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
import type { ScopeClaim, ScopeConcept } from "../agents/sherlock_lead/schema.js";
import { verifyClaimStep, degradedVerification, type VerifyClaimResult } from "../agents/fact_verifier/step.js";
import { numbersStep } from "../agents/numbers/step.js";
import { analogyStep } from "../agents/analogist/step.js";
import { criticStep } from "../agents/critic/step.js";
import type { NumbersOutput } from "../agents/numbers/schema.js";
import type { AnalogistOutput } from "../agents/analogist/schema.js";
import type { CriticOutput } from "../agents/critic/schema.js";
import type { ResearchFactContext } from "../agents/numbers/step.js";
import type { LlmBackendDriver } from "../llm/types.js";
import type { VerificationStatus } from "../domain/enums.js";

export interface ResearchCellDeps {
  supa: Supa;
  config: LlmConfig;
  costGuard: CostGuard;
  ledger?: InMemoryCostLedger;
  searchBackend?: SearchBackend; // 미지정 시 env(SEARCH_BACKEND)
  driver?: LlmBackendDriver; // 테스트·spike용 LLM 백엔드 주입(미지정 시 config.backend). callLLM에 그대로 전달.
}

/** 리서치 재진입 모드(migration 28·되돌림 전이).
 *  - 'full'(기본): 현행 동작 그대로 — scope→팩트검증→리콘실→예시→반론. 회귀 0(바이트 동일).
 *  - 'examples': 같은 scope·같은 검증결과 위에서 숫자/비유(셈이·유이)만 다시 — 팩트검증·리콘실·반론 스킵,
 *    research_facts 보존(절대 삭제 금지), explanation_assets만 재생성. 비용 절감용 부분 재진입. */
export type ResearchFromStep = "full" | "examples";

export interface ResearchCellResult {
  runId: string;
  state: "research_ready";
  factCount: number;
  assetCount: number;
  escalatedCount: number;
  critic: CriticOutput;
  skipped: boolean;
}

export async function runResearchCell(
  runId: string,
  deps: ResearchCellDeps,
  opts: { fromStep?: ResearchFromStep } = {},
): Promise<ResearchCellResult> {
  const { supa, config, costGuard, ledger } = deps;
  const llm = { config, costGuard, ...(deps.driver ? { driver: deps.driver } : {}) };
  const { koreanOfficialDomains } = config.research;
  const fromStep: ResearchFromStep = opts.fromStep ?? "full";
  const run = await getRun(supa, runId);

  // 0) 멱등: 이미 research_ready면 기존 결과 요약 반환.
  //    재진입(fromStep='examples')은 액션이 research_ready→researching로 전이시킨 뒤 셀을 호출하는 전제라
  //    이 가드에 닿지 않는다(진입 시 state=researching). 이 조기반환은 크래시 후 중복 호출만 단락한다.
  if (run.state === "research_ready") {
    const { count: fc } = await supa.from("research_facts").select("*", { count: "exact", head: true }).eq("run_id", runId);
    if ((fc ?? 0) > 0) {
      const { count: ac } = await supa.from("explanation_assets").select("*", { count: "exact", head: true }).eq("run_id", runId);
      const { count: ec } = await supa.from("research_facts").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("escalated_to_human", true);
      return { runId, state: "research_ready", factCount: fc ?? 0, assetCount: ac ?? 0, escalatedCount: ec ?? 0, critic: { missing: [], counter_evidence: [] }, skipped: true };
    }
  }
  // 진입 가드: 셀은 'researching'에서만 시작(크래시 후 재개·재진입 포함). step0이 structure_selected→researching
  //   직행 전이를 없앴고(scope 게이트 경유), 선택/재진입 액션이 (research_scoped|research_ready|research_review)
  //   →researching로 전이시킨 뒤 이벤트를 재발행하므로 셀 진입 시점엔 항상 researching이다.
  if (run.state !== "researching") {
    throw new Error(`research 셀은 'researching'에서만(현재 '${run.state}'). scope 선택·재진입(→researching) 후 진입한다.`);
  }

  // ── 재진입: 예시만(fromStep='examples') ──────────────────────────────────
  //   ②팩트검증·③리콘실·⑦반론을 스킵하고, 기존 research_facts를 보존한 채 숫자/비유(셈이·유이)만 재생성한다.
  //   비용 절감용(검증은 비싸고 안정적, 예시 품질만 다시 굴리고 싶을 때). research_facts는 절대 삭제 금지.
  if (fromStep === "examples") {
    return runExamplesReentry(runId, deps, llm);
  }

  // 1) 컨텍스트: 선택된 구성 + 주제·제목.
  await setProgress(supa, runId, "1/4·검증 범위 설정 (셜록)");
  const structure = await getSelectedStagePayload(supa, runId, "structure");

  // 2) scope — 셜록 재호출이 아니라 '사용자가 고른 후보'를 읽는다(블라인드 slice 없음 — 고른 그대로).
  const { claims, concepts } = await loadSelectedScope(supa, runId);

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

/** 예시만 재진입(fromStep='examples'). full 경로와 분리해 검증 로직(②③⑦)을 절대 건드리지 않는다.
 *  rework 결정: 리서치 내부 재진입(scope 재조정·예시 재생성·검수 후 재진입)은 rework_count를 올리지 않는다.
 *    교차단계 rework(scripting→researching 등 freshness 되돌림)와 구분하고, 비용은 2단 캡으로만 제한한다.
 *    → 여기서 bumpRework를 호출하지 않는다(의도적).
 *  흐름: research_facts(run_id) 로드 → factContext 구성 → concepts는 loadSelectedScope →
 *        셈이·유이만 재실행 → explanation_assets만 delete+insert(research_facts 보존) →
 *        critic 미실행(빈 값) → researching→research_ready 복귀(full과 동일 전이). */
async function runExamplesReentry(
  runId: string,
  deps: ResearchCellDeps,
  llm: { config: LlmConfig; costGuard: CostGuard; driver?: LlmBackendDriver },
): Promise<ResearchCellResult> {
  const { supa, ledger } = deps;
  const run = await getRun(supa, runId); // 누계 cost_usd 시점 재확보(가드 직후라 researching 보장).

  // 1) 기존 검증 사실 로드 — 재검증 안 함(②③ 스킵). factContext는 full 경로와 동형({claim, status, quote}).
  await setProgress(supa, runId, "1/2·기존 검증 사실 로드 (재검증 없음)");
  const { data: factData, error: fe } = await supa
    .from("research_facts")
    .select("claim, verification_status, quote_excerpt, escalated_to_human")
    .eq("run_id", runId);
  if (fe) throw new Error(`research_facts 로드 실패: ${fe.message}`);
  const existingFacts = (factData ?? []) as {
    claim: string;
    verification_status: VerificationStatus;
    quote_excerpt: string | null;
    escalated_to_human: boolean;
  }[];
  const factContext: ResearchFactContext[] = existingFacts.map((f) => ({
    claim: f.claim,
    verification_status: f.verification_status,
    quote_excerpt: f.quote_excerpt,
  }));

  // 2) concepts는 선택된 scope에서(블라인드 slice 없음). claims는 재검증 안 하므로 불필요.
  const { concepts } = await loadSelectedScope(supa, runId);

  // 3) 셈이·유이만 재실행 — full 경로와 동일 호출(검증된 사실에 grounding). 캡 에러만 전파, 그 외는 빈 배열 강등.
  await setProgress(supa, runId, "2/2·숫자·비유 재생성 (셈이∥유이)");
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

  // 4) 저장 — explanation_assets만 교체. ★ research_facts는 절대 삭제하지 않는다(검증 보존).
  await supa.from("explanation_assets").delete().eq("run_id", runId);
  if (assetRows.length) {
    const { error } = await supa.from("explanation_assets").insert(assetRows);
    if (error) throw new Error(`explanation_assets insert 실패: ${error.message}`);
  }

  // 5) cost flush + 전이(full과 동일: researching→research_ready). critic 미실행 → 빈 값(보존 의미).
  const stageCost = await flushLedger(supa, runId, ledger);
  await setProgress(supa, runId, null);
  await transitionRun(supa, runId, "researching", "research_ready", { cost_usd: run.cost_usd + stageCost });

  const escalatedCount = existingFacts.filter((f) => f.escalated_to_human).length;
  return {
    runId,
    state: "research_ready",
    factCount: existingFacts.length, // 보존된 기존 facts 수.
    assetCount: assetRows.length, // 재생성된 예시 수.
    escalatedCount,
    critic: { missing: [], counter_evidence: [] }, // 반론 미실행(스킵) — 기존 critic 결과는 DB에 없으므로 빈 값.
    skipped: false,
  };
}

/** 사용자가 고른 scope 후보만 복원한다(블라인드 slice 없음 — researchScope.selectResearchScope가 기록한 그대로).
 *  ① 이 run의 최신 stage='research' proposal candidates(claims 0..K-1, concepts K..N-1 전역 idx),
 *  ② 그 proposal_id의 최신 stage_selections.edited_payload({selectedClaimIdx, selectedConceptIdx})를 읽어
 *  교집합으로 선택된 candidate만 남기고, payload를 ScopeClaim/ScopeConcept 형태로 복원해 반환한다
 *  (scopeStep이 주던 것과 동형 → 이후 검증 로직 입력만 교체, 검증 자체는 불변). section 메타 보존. */
export async function loadSelectedScope(
  supa: Supa,
  runId: string,
): Promise<{ claims: ScopeClaim[]; concepts: ScopeConcept[] }> {
  // 최신 research proposal(researchScope.runResearchScope의 멱등 읽기 미러).
  const { data: proposal, error: pe } = await supa
    .from("stage_proposals")
    .select("id, candidates")
    .eq("run_id", runId)
    .eq("stage", "research")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pe) throw new Error(`research proposal 조회 실패: ${pe.message}`);
  if (!proposal) throw new Error(`run ${runId}에 검증할 'research' 제안이 없음(scope 단계 미수행).`);

  // 그 proposal의 최신 선택(selectResearchScope가 INSERT한 edited_payload).
  const { data: selection, error: se } = await supa
    .from("stage_selections")
    .select("edited_payload")
    .eq("proposal_id", proposal.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (se) throw new Error(`research selection 조회 실패: ${se.message}`);
  if (!selection) throw new Error(`run ${runId}의 research 제안에 scope 선택 기록이 없음.`);

  const picked = (selection.edited_payload as unknown as {
    selectedClaimIdx?: number[];
    selectedConceptIdx?: number[];
    // 수동 추가분(selectResearchScope가 인라인 저장) — candidates엔 없고 선택에만 있다.
    manualClaims?: { text: string; is_financial: boolean; section?: string }[];
    manualConcepts?: { name: string; needs_number: boolean; needs_analogy: boolean; section?: string }[];
  } | null) ?? {};
  const claimIdx = new Set(picked.selectedClaimIdx ?? []);
  const conceptIdx = new Set(picked.selectedConceptIdx ?? []);

  // candidate payload(kind로 구분) → 선택된 전역 idx만 교집합으로 남겨 ScopeClaim/ScopeConcept 복원.
  type ScopeCandidatePayload =
    | { kind: "claim"; section?: string; text: string; is_financial: boolean }
    | { kind: "concept"; section?: string; name: string; needs_number: boolean; needs_analogy: boolean };
  const candidates = (proposal.candidates as unknown as { idx: number; payload: ScopeCandidatePayload }[]) ?? [];

  const claims: ScopeClaim[] = [];
  const concepts: ScopeConcept[] = [];
  for (const c of candidates) {
    const p = c.payload;
    if (p.kind === "claim" && claimIdx.has(c.idx)) {
      claims.push({ text: p.text, is_financial: p.is_financial, ...(p.section !== undefined ? { section: p.section } : {}) });
    } else if (p.kind === "concept" && conceptIdx.has(c.idx)) {
      concepts.push({
        name: p.name,
        needs_number: p.needs_number,
        needs_analogy: p.needs_analogy,
        ...(p.section !== undefined ? { section: p.section } : {}),
      });
    }
  }

  // 수동 추가분 병합 — candidates엔 없으므로 edited_payload에 저장된 값을 그대로 ScopeClaim/ScopeConcept로 변환.
  //   ★ 수동 claim의 is_financial은 저장된 값(자동판정+토글 결과)을 그대로 쓴다(여기서 재판정 안 함).
  //   수동분도 검증·예시 파이프라인을 동일하게 탄다(검증 로직 자체는 불변). section 옵셔널 보존.
  for (const mc of picked.manualClaims ?? []) {
    claims.push({ text: mc.text, is_financial: mc.is_financial, ...(mc.section !== undefined ? { section: mc.section } : {}) });
  }
  for (const mc of picked.manualConcepts ?? []) {
    concepts.push({
      name: mc.name,
      needs_number: mc.needs_number,
      needs_analogy: mc.needs_analogy,
      ...(mc.section !== undefined ? { section: mc.section } : {}),
    });
  }

  return { claims, concepts };
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
