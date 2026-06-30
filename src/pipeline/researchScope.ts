// 셜록 scope-only 경로(§7·§8.1) — 검증 '실행'이 아니라 '제안'.
//   structure(outline) → 셜록 scope → 검증 후보(claims/concepts)를 목차 섹션 고루 커버해 빠짐없이 생성
//   → stage_proposals(stage='research')에 candidates 전부 저장 → structure_selected → research_scoped 전이.
//   ★ fan-out 팩트검증은 절대 안 한다(그건 사용자 선택 후 step2/researchCell 몫).
//   ★ 후보를 몰래 자르지 않는다(블라인드 slice 없음). budget은 '기본 체크 개수' 힌트일 뿐 — default_selected 마킹에만 쓴다.
import type { LlmConfig } from "../llm/config.js";
import { getRun, transitionRun, setProgress, type Supa } from "./runState.js";
import { flushLedger } from "./runGuards.js";
import { getSelectedStagePayload } from "./context.js";
import { scopeStep } from "../agents/sherlock_lead/step.js";
import { countOutlineSections, suggestDefaultSelection } from "./researchBudget.js";
import type { Candidate } from "./stageContract.js";
import type { CostGuard, InMemoryCostLedger } from "../llm/costGuard.js";
import type { Json } from "../lib/supabase/database.types.js";
import type { SherlockScopeOutput } from "../agents/sherlock_lead/schema.js";
import type { LlmBackendDriver } from "../llm/types.js";

/** scope 결과(claims+concepts) → stage_proposals candidate 배열 빌드.
 *  runResearchScope의 4) 로직을 그대로 추출(바이트 동일) — regenerateResearchScope와 공유.
 *  budget은 상위 N개만 default_selected=true 표시(상한 아님). 배열 순서 = 중요도. 블라인드 slice 없음. */
function buildScopeCandidates(scope: SherlockScopeOutput, budget: { claims: number; concepts: number }): Candidate[] {
  const candidates: Candidate[] = [];
  let idx = 0;
  scope.claims.forEach((c, i) => {
    candidates.push({
      idx: idx++,
      payload: {
        kind: "claim",
        ...(c.section !== undefined ? { section: c.section } : {}),
        default_selected: i < budget.claims,
        text: c.text,
        is_financial: c.is_financial,
      } as unknown,
      reason: c.is_financial ? "금융·수치 주장(강검증 대상)" : "사실 검증 대상",
      evidence_ids: [],
    });
  });
  scope.concepts.forEach((c, i) => {
    candidates.push({
      idx: idx++,
      payload: {
        kind: "concept",
        ...(c.section !== undefined ? { section: c.section } : {}),
        default_selected: i < budget.concepts,
        name: c.name,
        needs_number: c.needs_number,
        needs_analogy: c.needs_analogy,
      } as unknown,
      reason: "시청자가 어려워할 핵심 개념(설명자산 대상)",
      evidence_ids: [],
    });
  });
  return candidates;
}

export interface ResearchScopeDeps {
  supa: Supa;
  config: LlmConfig;
  costGuard: CostGuard;
  ledger?: InMemoryCostLedger;
  driver?: LlmBackendDriver; // 테스트·spike용 LLM 백엔드 주입(미지정 시 config.backend). regenerate가 scopeStep에 전달.
}

export interface ResearchScopeResult {
  runId: string;
  state: "research_scoped";
  proposalId: string;
  candidateCount: number;
  skipped: boolean;
}

export async function runResearchScope(runId: string, deps: ResearchScopeDeps): Promise<ResearchScopeResult> {
  const { supa, config, costGuard, ledger } = deps;
  const llm = { config, costGuard };
  const run = await getRun(supa, runId);

  // 0) 멱등: 이미 research_scoped이고 research proposal이 있으면 기존 반환(재과금 0·중복 이벤트/재시도 안전).
  if (run.state === "research_scoped") {
    const { data: existing } = await supa
      .from("stage_proposals")
      .select("id, candidates")
      .eq("run_id", runId)
      .eq("stage", "research")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const cands = (existing.candidates as unknown as Candidate[]) ?? [];
      return { runId, state: "research_scoped", proposalId: existing.id, candidateCount: cands.length, skipped: true };
    }
  }

  // 진입 가드: structure_selected에서만 scope 제안을 시작한다(§8.1 fromState).
  if (run.state !== "structure_selected") {
    throw new Error(`research scope는 'structure_selected'에서만(현재 '${run.state}').`);
  }

  await setProgress(supa, runId, "1/2·검증 범위 생성 (셜록)");
  try {
    // 1) 컨텍스트: 선택된 구성(outline) + 주제·제목(researchCell.ts와 동일 패턴).
    const structure = await getSelectedStagePayload(supa, runId, "structure");
    const topic = (await getSelectedStagePayload(supa, runId, "topic") as { title?: string } | null)?.title ?? "";
    const title = (await getSelectedStagePayload(supa, runId, "title_thumb") as { title?: string } | null)?.title ?? "";

    // 2) 섹션 비례 '기본 선택 개수' 힌트(상한 아님 — default_selected 마킹용).
    const budget = suggestDefaultSelection(countOutlineSections(structure), config.research);

    // 3) 셜록 scope — 검증 후보 분해(섹션 고루 커버·중요도순). fan-out 검증 없음.
    const scope = await scopeStep(llm, runId, { topic, title, outline: structure, budget });

    // 4) 후보 배열 — claims + concepts 전부(블라인드 slice 없음). 배열 순서 = 중요도.
    //    budget은 상위 N개만 default_selected=true로 표시(기본 체크 힌트). 나머지는 false지만 모두 저장된다.
    //    (regenerate와 공유하는 buildScopeCandidates로 추출 — 출력은 바이트 동일.)
    const candidates: Candidate[] = buildScopeCandidates(scope, budget);

    // 5) proposed 저장(컨펌 전 = 저장 후 표시) — runProposalStage 저장부 미러(새 방식 발명 금지).
    const { data: proposal, error: pe } = await supa
      .from("stage_proposals")
      .insert({ run_id: runId, stage: "research", candidates: candidates as unknown as Json, prompt_run_ref: "scope" })
      .select("id")
      .single();
    if (pe) throw new Error(`stage_proposals(research) insert 실패: ${pe.message}`);

    // 6) cost_ledger flush(전이 '전') + 이 단계 실비 합(researchCell.ts P0 패턴).
    const stageCost = await flushLedger(supa, runId, ledger);

    // 7) 전이를 마지막에 — structure_selected → research_scoped(검증 직행 차단·게이트 경유).
    await transitionRun(supa, runId, "structure_selected", "research_scoped", { cost_usd: run.cost_usd + stageCost });

    return { runId, state: "research_scoped", proposalId: proposal.id, candidateCount: candidates.length, skipped: false };
  } finally {
    await setProgress(supa, runId, null);
  }
}

/** scope 재생성(a) — 셜록 후보가 부족할 때 '기존 외 추가'를 받는다.
 *  research_scoped에서만(아니면 throw). 새 stage_proposals(stage='research') 행을 INSERT하되 **전이하지 않는다**
 *  (research_scoped 유지). loadSelectedScope·selectResearchScope가 '최신' proposal을 읽으니 자동 반영된다.
 *  reason·기존 후보 텍스트를 scopeStep에 전달해 "기존 외 추가·이유 반영·중복 회피"하게 한다.
 *  ★ 픽스처 보존: 이 함수만 scopeStep input에 reason/existing을 채운다(runResearchScope는 byte-identical 유지). */
export async function regenerateResearchScope(
  supa: Supa,
  runId: string,
  deps: ResearchScopeDeps,
  reason?: string,
): Promise<{ proposalId: string }> {
  const { config, costGuard, ledger } = deps;
  const llm = { config, costGuard, ...(deps.driver ? { driver: deps.driver } : {}) };
  const run = await getRun(supa, runId);

  // research_scoped에서만 — 다른 state면 명확히 거부(scope 게이트 외 단계에서 재생성 금지).
  if (run.state !== "research_scoped") {
    throw new Error(`scope 재생성은 'research_scoped'에서만 가능(현재 '${run.state}').`);
  }

  await setProgress(supa, runId, "검증 범위 추가 생성 (셜록)");
  try {
    // 1) 컨텍스트(runResearchScope와 동일 패턴).
    const structure = await getSelectedStagePayload(supa, runId, "structure");
    const topic = (await getSelectedStagePayload(supa, runId, "topic") as { title?: string } | null)?.title ?? "";
    const title = (await getSelectedStagePayload(supa, runId, "title_thumb") as { title?: string } | null)?.title ?? "";
    const budget = suggestDefaultSelection(countOutlineSections(structure), config.research);

    // 2) 기존 후보 텍스트(중복 회피용) — 최신 research proposal에서 claim text·concept name만 추출.
    const { data: existingProp } = await supa
      .from("stage_proposals")
      .select("candidates")
      .eq("run_id", runId)
      .eq("stage", "research")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    type ScopePayload =
      | { kind: "claim"; text: string }
      | { kind: "concept"; name: string }
      | Record<string, unknown>;
    const existingCands = (existingProp?.candidates as unknown as { payload: ScopePayload }[]) ?? [];
    const existingClaims = existingCands
      .map((c) => c.payload)
      .filter((p): p is { kind: "claim"; text: string } => (p as { kind?: string }).kind === "claim")
      .map((p) => p.text);
    const existingConcepts = existingCands
      .map((c) => c.payload)
      .filter((p): p is { kind: "concept"; name: string } => (p as { kind?: string }).kind === "concept")
      .map((p) => p.name);

    // 3) 셜록 재호출 — reason·existing은 값이 있을 때만 input에 담는다(promptHash 영향은 regenerate 경로에 국한).
    const trimmedReason = reason?.trim();
    const scope = await scopeStep(llm, runId, {
      topic,
      title,
      outline: structure,
      budget,
      ...(trimmedReason ? { reason: trimmedReason } : {}),
      ...(existingClaims.length || existingConcepts.length
        ? { existing: { claims: existingClaims, concepts: existingConcepts } }
        : {}),
    });

    // 4) 후보 빌드(runResearchScope와 공유) + 새 proposal INSERT(전이 없음 — 최신 proposal이 자동 반영).
    const candidates = buildScopeCandidates(scope, budget);
    const { data: proposal, error: pe } = await supa
      .from("stage_proposals")
      .insert({ run_id: runId, stage: "research", candidates: candidates as unknown as Json, prompt_run_ref: "scope" })
      .select("id")
      .single();
    if (pe) throw new Error(`stage_proposals(research) insert 실패: ${pe.message}`);

    // 5) cost_ledger flush + 누계 갱신(전이는 안 하지만 실비는 정산해야 비용 유실 없음 — runResearchScope 패턴).
    const stageCost = await flushLedger(supa, runId, ledger);
    if (stageCost > 0) {
      await supa.from("production_runs").update({ cost_usd: run.cost_usd + stageCost }).eq("id", runId);
    }

    return { proposalId: proposal.id };
  } finally {
    await setProgress(supa, runId, null);
  }
}

// 자동 스코프 선택(정책 나·§A) — autoflow 무중단. 사람 선택 없이 '어차피 검수했을' 후보만 검증대상으로 고른다.
//   정책: claim이고 is_financial===true / concept이고 (needs_number===true || needs_analogy===true)만 선택.
//   그 외(비금융 평범 주장·숫자/비유 불필요 개념)는 검증 안 함(출처만) — 에스컬레이션 술어와 같은 범위.
//   반환: 선택된 candidate의 '전역 idx'(claims가 concepts보다 앞 — buildScopeCandidates 순서 = 금융 우선 자연 정렬).
//   ★ 깨진 입력 방어: candidates null/undefined·payload 없음·idx 비숫자는 조용히 스킵(throw 금지). 빈 후보→빈 선택.
//   ponytail: cap(비용 하드캡)은 cell의 costGuard가 강제한다 — 여기선 인위적 개수 컷 없이 '정책 선택'만 한다(우회 금지).
export function autoSelectScope(candidates: Candidate[]): { claims: number[]; concepts: number[] } {
  const claims: number[] = [];
  const concepts: number[] = [];
  if (!Array.isArray(candidates)) return { claims, concepts };
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const idx = (c as { idx?: unknown }).idx;
    if (typeof idx !== "number" || !Number.isFinite(idx)) continue; // idx 숫자 아니면 스킵
    const payload = (c as { payload?: unknown }).payload;
    if (!payload || typeof payload !== "object") continue; // payload 없으면 스킵
    const p = payload as { kind?: unknown; is_financial?: unknown; needs_number?: unknown; needs_analogy?: unknown };
    if (p.kind === "claim") {
      if (p.is_financial === true) claims.push(idx);
    } else if (p.kind === "concept") {
      if (p.needs_number === true || p.needs_analogy === true) concepts.push(idx);
    }
  }
  return { claims, concepts };
}

// 자동 scope 전진(§A) — autoSelectScope 결과를 기록하고 research_scoped→researching 전이. 사람 0-guard 미재사용
//   (자동 흐름은 고위험 0건이면 빈 선택으로 그냥 통과 — 검증할 게 없으면 출처만, 정책대로). selectResearchScope와 동일
//   기록 형태(chosen_idx=0 센티넬·edited_payload={selectedClaimIdx, selectedConceptIdx}, 빈 배열 허용).
//   ★ 멱등: state가 research_scoped가 아니면 no-op(retry/durable replay 안전 — 중복 selection insert·이중 전이 금지).
export async function autoAdvanceResearchScope(supa: Supa, runId: string): Promise<void> {
  const run = await getRun(supa, runId);
  if (run.state !== "research_scoped") return; // 멱등: 이미 전진했으면 no-op

  // 최신 stage='research' proposal candidates 로드(runResearchScope 멱등 읽기 미러).
  const { data: proposal, error: pe } = await supa
    .from("stage_proposals")
    .select("id, candidates")
    .eq("run_id", runId)
    .eq("stage", "research")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pe) throw new Error(`research proposal 조회 실패: ${pe.message}`);
  if (!proposal) throw new Error(`run ${runId}에 'research' proposal이 없음(자동 scope 전진 불가).`);

  const candidates = (proposal.candidates as unknown as Candidate[]) ?? [];
  const selected = autoSelectScope(candidates);

  // selectResearchScope와 동일 형태(빈 배열 허용 — 사람 0-guard 없음).
  const editedPayload = {
    selectedClaimIdx: selected.claims,
    selectedConceptIdx: selected.concepts,
  } as unknown as Json;
  const { error: se } = await supa
    .from("stage_selections")
    .insert({ proposal_id: proposal.id, chosen_idx: 0, edited_payload: editedPayload })
    .select("id")
    .single();
  if (se) throw new Error(`stage_selections insert 실패: ${se.message}`);

  await transitionRun(supa, runId, "research_scoped", "researching");
}

// 사람 게이트(§8.1) — 사용자가 고른 scope 후보(claims/concepts) idx 집합을 기록 + research_scoped→researching 전이.
//   gate.ts selectProposal/confirmThumbnailSet 미러(새 방식 발명 금지):
//   - research_scoped에서만(아니면 throw), proposal이 이 run·stage='research'에 속하는지 스코프검증.
//   - 0개 가드: 전부 빼면 검증할 게 없음 → 명확히 throw(조용히 통과 금지).
//   - 선택 idx가 실제 candidate idx에 존재하는지 검증(없는 idx 섞이면 throw — 교차 오염·오타 차단).
//   - 다중 선택이라 chosen_idx는 0 센티넬(confirmThumbnailSet 패턴), 선택 집합은 edited_payload에 기록.
//   ★ 이벤트는 여기서 발사하지 않는다(이 모듈은 inngest 미import) — 검증 트리거는 서버액션 몫.
// 수동 추가(b) — 사용자가 직접 입력한 claim/concept. proposal candidates를 '변형하지 않고' 선택(edited_payload)에 인라인.
//   ★ is_financial은 detectFinancial 자동판정 + 사용자 토글의 '결과값'을 그대로 받는다(여기서 재판정 안 함 — 토글이 최종).
export interface ManualClaim {
  text: string;
  is_financial: boolean;
  section?: string;
}
export interface ManualConcept {
  name: string;
  needs_number: boolean;
  needs_analogy: boolean;
  section?: string;
}

export async function selectResearchScope(
  supa: Supa,
  runId: string,
  proposalId: string,
  selected: { claims: number[]; concepts: number[] },
  // 수동 추가는 옵셔널(기존 호출부·테스트 불변). proposal candidates를 변형하지 않고 선택에만 인라인 저장한다.
  manual?: { claims?: ManualClaim[]; concepts?: ManualConcept[] },
): Promise<void> {
  const run = await getRun(supa, runId);
  if (run.state !== "research_scoped") {
    throw new Error(`research scope 선택은 'research_scoped'에서만 가능(현재 '${run.state}').`);
  }

  const manualClaims = manual?.claims ?? [];
  const manualConcepts = manual?.concepts ?? [];

  // 0개 가드 — 최소 1개. 선택 idx 개수 + 수동 추가 개수 합산(둘 다 비면 검증 대상이 0건이라 무의미).
  if (selected.claims.length + selected.concepts.length + manualClaims.length + manualConcepts.length === 0) {
    throw new Error("최소 1개 이상의 검증 후보(claim/concept)를 선택하거나 추가해야 합니다.");
  }

  // proposal이 이 run·"research"에 속하는지(selectProposal 스코프검증 미러) + candidates 로드.
  const { data: proposal, error: pe } = await supa
    .from("stage_proposals")
    .select("id, candidates")
    .eq("id", proposalId)
    .eq("run_id", runId)
    .eq("stage", "research")
    .maybeSingle();
  if (pe) throw new Error(`research proposal 조회 실패: ${pe.message}`);
  if (!proposal) throw new Error(`proposal ${proposalId}는 run ${runId}의 'research' 단계에 속하지 않음.`);

  // 선택 idx가 실제 candidate idx에 존재하는지 검증(없는 idx 섞이면 throw).
  //   candidate.idx는 전역(claims 0..K-1, concepts K..N-1) — 종류별 분리 없이 한 집합으로 검증.
  const candidates = (proposal.candidates as unknown as { idx: number }[]) ?? [];
  const validIdx = new Set(candidates.map((c) => c.idx));
  const allSelected = [...selected.claims, ...selected.concepts];
  const missing = allSelected.filter((i) => !validIdx.has(i));
  if (missing.length > 0) {
    throw new Error(`선택 idx [${missing.join(", ")}]가 후보에 없음(후보 ${candidates.length}개).`);
  }

  // 다중 선택이라 chosen_idx=0 센티넬(confirmThumbnailSet 패턴), 선택 집합은 edited_payload에.
  //   수동 추가분은 candidates를 변형하지 않고 여기 인라인(드리프트·출처혼동 차단). 값이 없으면 키 자체를 빼서
  //   기존 edited_payload({selectedClaimIdx, selectedConceptIdx})와 byte-identical 유지(기존 테스트 불변).
  const editedPayload = {
    selectedClaimIdx: selected.claims,
    selectedConceptIdx: selected.concepts,
    ...(manualClaims.length ? { manualClaims } : {}),
    ...(manualConcepts.length ? { manualConcepts } : {}),
  } as unknown as Json;
  const { error: se } = await supa
    .from("stage_selections")
    .insert({ proposal_id: proposalId, chosen_idx: 0, edited_payload: editedPayload })
    .select("id")
    .single();
  if (se) throw new Error(`stage_selections insert 실패: ${se.message}`);

  await transitionRun(supa, runId, "research_scoped", "researching");
}
