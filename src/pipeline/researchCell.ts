// 셜록 리서치 셀 — fan-out/join 골격(§7·§8·§9). "누가 병렬로 도는지"만 선언한다.
//   scope(셜록) → [팩트검증가 ‖ 셈이 ‖ 유이] 병렬 → 리콘실(7무결성가드) → 반론(critic)
//   → research_facts + explanation_assets 저장 → researching→research_ready 전이.
//   각 에이전트 로직은 agents/{role}/step.ts, 검증·삼각검증은 researchReconcile.ts. 여기는 조립만.
import type { CostGuard, InMemoryCostLedger } from "../llm/costGuard.js";
import type { LlmConfig } from "../llm/config.js";
import type { SearchBackend, SearchResult } from "../search/types.js";
import { getRun, transitionRun, setProgress, type Supa } from "./runState.js";
import { isCapError, flushLedger } from "./runGuards.js";
import { getSelectedStagePayload } from "./context.js";
import { reconcileFacts, buildAssetRows } from "./researchReconcile.js";
import { scopeStep } from "../agents/sherlock_lead/step.js";
import { verifyClaimStep, degradedVerification, type VerifyClaimResult } from "../agents/fact_verifier/step.js";
import { numbersStep } from "../agents/numbers/step.js";
import { analogyStep } from "../agents/analogist/step.js";
import { criticStep } from "../agents/critic/step.js";
import type { NumbersOutput } from "../agents/numbers/schema.js";
import type { AnalogistOutput } from "../agents/analogist/schema.js";
import type { CriticOutput } from "../agents/critic/schema.js";

export interface ResearchCellDeps {
  supa: Supa;
  config: LlmConfig;
  costGuard: CostGuard;
  ledger?: InMemoryCostLedger;
  searchBackend?: SearchBackend; // 미지정 시 env(SEARCH_BACKEND)
}

export interface ResearchCellResult {
  runId: string;
  state: "research_ready";
  factCount: number;
  assetCount: number;
  escalatedCount: number;
  critic: CriticOutput;
  skipped: boolean;
}

export async function runResearchCell(runId: string, deps: ResearchCellDeps): Promise<ResearchCellResult> {
  const { supa, config, costGuard, ledger } = deps;
  const llm = { config, costGuard };
  const { maxClaims, maxConcepts, koreanOfficialDomains } = config.research;
  const run = await getRun(supa, runId);

  // 0) 멱등: 이미 research_ready면 기존 결과 요약 반환.
  if (run.state === "research_ready") {
    const { count: fc } = await supa.from("research_facts").select("*", { count: "exact", head: true }).eq("run_id", runId);
    if ((fc ?? 0) > 0) {
      const { count: ac } = await supa.from("explanation_assets").select("*", { count: "exact", head: true }).eq("run_id", runId);
      const { count: ec } = await supa.from("research_facts").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("escalated_to_human", true);
      return { runId, state: "research_ready", factCount: fc ?? 0, assetCount: ac ?? 0, escalatedCount: ec ?? 0, critic: { missing: [], counter_evidence: [] }, skipped: true };
    }
  }
  // 진입 가드: 정상 시작(structure_selected) 또는 크래시 후 재개(researching)만 허용(코드리뷰 P0 — 고착 복구).
  if (run.state !== "structure_selected" && run.state !== "researching") {
    throw new Error(`research 셀은 'structure_selected'(또는 재개 'researching')에서만(현재 '${run.state}').`);
  }

  // 1) researching 진입(이미 researching이면 재개 — 전이 생략).
  if (run.state === "structure_selected") {
    await transitionRun(supa, runId, "structure_selected", "researching");
  }

  // 2) 컨텍스트: 선택된 구성 + 주제·제목.
  await setProgress(supa, runId, "1/4·검증 범위 설정 (셜록)");
  const structure = await getSelectedStagePayload(supa, runId, "structure");
  const topic = (await getSelectedStagePayload(supa, runId, "topic") as { title?: string } | null)?.title ?? "";
  const title = (await getSelectedStagePayload(supa, runId, "title_thumb") as { title?: string } | null)?.title ?? "";

  // 3) scope(셜록) — 검증 대상 분해.
  const scope = await scopeStep(llm, runId, { topic, title, outline: structure });
  const claims = scope.claims.slice(0, maxClaims);
  const concepts = scope.concepts.slice(0, maxConcepts);

  // 4) 팩트검증가 fan-out(claim별 검색+검증) — 병렬. 비용 캡 에러는 강등 안 하고 전파(그 외만 강등).
  await setProgress(supa, runId, `2/5·팩트 검증 (claim ${claims.length}건 병렬)`);
  const factPs = claims.map((claim) =>
    verifyClaimStep(claim, runId, llm, { financialDomains: koreanOfficialDomains, ...(deps.searchBackend ? { backend: deps.searchBackend } : {}) }).catch((e) => {
      if (isCapError(e)) throw e;
      return { claim, results: [] as SearchResult[], v: degradedVerification(e instanceof Error ? e.message : String(e)) } satisfies VerifyClaimResult;
    }),
  );
  // ★ allSettled로 진행 중 호출을 버리지 않음 → 캡 도달 시에도 모두 정산 후 ledger flush·cost 저장 후 전파.
  const factSettled = await Promise.allSettled(factPs);
  await throwIfCapRejected(factSettled, supa, runId, run.cost_usd, ledger);
  const facts = factSettled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));

  // 5) 리콘실(코드, AI 없음) — 7무결성가드 + 삼각검증. 여기서 '확정 사실'이 나온다.
  await setProgress(supa, runId, "3/5·교차 정리·트리아지");
  const today = new Date().toISOString().slice(0, 10);
  const factRows = reconcileFacts(runId, facts, today);

  // 6) 셈이·유이 — '검증된 사실'을 받아 예시 생성(팩트검증 뒤·둘은 서로 병렬).
  //    ★ 셈이는 verified 수치만 사실로(미검증은 가정/생략), 유이는 검증된 사실과 어긋나는 비유 금지.
  //    그래서 숫자/비유가 '계획상 값'이 아니라 '확인된 값'에 grounding 된다(grounding gap 해소).
  await setProgress(supa, runId, "4/5·숫자·비유 (셈이∥유이)");
  const factContext = factRows.map((f) => ({ claim: f.claim, verification_status: f.verification_status, quote_excerpt: f.quote_excerpt }));
  const numPs: Promise<NumbersOutput["assets"]> =
    concepts.some((c) => c.needs_number)
      ? numbersStep(llm, runId, { concepts: concepts.filter((c) => c.needs_number), facts: factContext }).catch((e) => { if (isCapError(e)) throw e; return [] as NumbersOutput["assets"]; })
      : Promise.resolve([] as NumbersOutput["assets"]);
  const anaPs: Promise<AnalogistOutput["assets"]> =
    concepts.some((c) => c.needs_analogy)
      ? analogyStep(llm, runId, { concepts: concepts.filter((c) => c.needs_analogy), facts: factContext }).catch((e) => { if (isCapError(e)) throw e; return [] as AnalogistOutput["assets"]; })
      : Promise.resolve([] as AnalogistOutput["assets"]);
  const [numSettled, anaSettled] = await Promise.all([Promise.allSettled([numPs]), Promise.allSettled([anaPs])]);
  await throwIfCapRejected([...numSettled, ...anaSettled], supa, runId, run.cost_usd, ledger);
  const numberAssets = numSettled[0]!.status === "fulfilled" ? numSettled[0]!.value : [];
  const analogyAssets = anaSettled[0]!.status === "fulfilled" ? anaSettled[0]!.value : [];
  const assetRows = buildAssetRows(runId, numberAssets, analogyAssets);

  // 7) 반론(critic) — 확증편향 차단.
  await setProgress(supa, runId, "5/5·반론 (확증편향 차단)");
  const verifiedSummary = factRows.map((f) => `[${f.verification_status}] ${f.claim}`);
  const critic = await criticStep(llm, runId, { facts: verifiedSummary, outline: structure });

  // 7) 저장 — 재개(researching) 멱등: 이전(크래시) 시도의 facts/assets를 지우고 새로 쓴다(중복 방지, 코드리뷰 P0/P1).
  await supa.from("research_facts").delete().eq("run_id", runId);
  await supa.from("explanation_assets").delete().eq("run_id", runId);
  if (factRows.length) {
    const { error } = await supa.from("research_facts").insert(factRows);
    if (error) throw new Error(`research_facts insert 실패: ${error.message}`);
  }
  if (assetRows.length) {
    const { error } = await supa.from("explanation_assets").insert(assetRows);
    if (error) throw new Error(`explanation_assets insert 실패: ${error.message}`);
  }

  // 8) cost_ledger flush(전이 전) + 이 단계 실비 합(코드리뷰 P0: ledger 합, spentUsd 이중계산 회피).
  const stageCost = await flushLedger(supa, runId, ledger);

  // 9) 전이를 '마지막'에 — 여기까지 오면 모든 쓰기가 끝났으므로 research_ready가 일관적. 누계 = 이전 + 이 단계.
  await setProgress(supa, runId, null); // 단계 완료 → 서브진행 표시 해제.
  await transitionRun(supa, runId, "researching", "research_ready", { cost_usd: run.cost_usd + stageCost });

  const escalatedCount = factRows.filter((f) => f.escalated_to_human).length;
  return { runId, state: "research_ready", factCount: factRows.length, assetCount: assetRows.length, escalatedCount, critic, skipped: false };
}

/** 병렬 결과에 비용 캡 거부가 있으면 ledger flush·cost 저장 후 전파(runStageGuarded가 일시정지/중단).
 *  전이 없이 throw → 비용 유실/캡 우회 방지. 캡 없으면 no-op. */
async function throwIfCapRejected(
  settled: PromiseSettledResult<unknown>[],
  supa: Supa,
  runId: string,
  baseCost: number,
  ledger?: InMemoryCostLedger,
): Promise<void> {
  const capRejection = settled.find((s): s is PromiseRejectedResult => s.status === "rejected" && isCapError(s.reason));
  if (!capRejection) return;
  const sc = await flushLedger(supa, runId, ledger);
  if (sc > 0) await supa.from("production_runs").update({ cost_usd: baseCost + sc }).eq("id", runId);
  throw capRejection.reason;
}
