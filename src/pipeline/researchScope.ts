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

export interface ResearchScopeDeps {
  supa: Supa;
  config: LlmConfig;
  costGuard: CostGuard;
  ledger?: InMemoryCostLedger;
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

// 사람 게이트(§8.1) — 사용자가 고른 scope 후보(claims/concepts) idx 집합을 기록 + research_scoped→researching 전이.
//   gate.ts selectProposal/confirmThumbnailSet 미러(새 방식 발명 금지):
//   - research_scoped에서만(아니면 throw), proposal이 이 run·stage='research'에 속하는지 스코프검증.
//   - 0개 가드: 전부 빼면 검증할 게 없음 → 명확히 throw(조용히 통과 금지).
//   - 선택 idx가 실제 candidate idx에 존재하는지 검증(없는 idx 섞이면 throw — 교차 오염·오타 차단).
//   - 다중 선택이라 chosen_idx는 0 센티넬(confirmThumbnailSet 패턴), 선택 집합은 edited_payload에 기록.
//   ★ 이벤트는 여기서 발사하지 않는다(이 모듈은 inngest 미import) — 검증 트리거는 서버액션 몫.
export async function selectResearchScope(
  supa: Supa,
  runId: string,
  proposalId: string,
  selected: { claims: number[]; concepts: number[] },
): Promise<void> {
  const run = await getRun(supa, runId);
  if (run.state !== "research_scoped") {
    throw new Error(`research scope 선택은 'research_scoped'에서만 가능(현재 '${run.state}').`);
  }

  // 0개 가드 — 최소 1개. 전부 빼면 리서치할 대상이 0건이라 검증 단계가 무의미.
  if (selected.claims.length + selected.concepts.length === 0) {
    throw new Error("최소 1개 이상의 검증 후보(claim/concept)를 선택해야 합니다.");
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
  const editedPayload = {
    selectedClaimIdx: selected.claims,
    selectedConceptIdx: selected.concepts,
  } as unknown as Json;
  const { error: se } = await supa
    .from("stage_selections")
    .insert({ proposal_id: proposalId, chosen_idx: 0, edited_payload: editedPayload })
    .select("id")
    .single();
  if (se) throw new Error(`stage_selections insert 실패: ${se.message}`);

  await transitionRun(supa, runId, "research_scoped", "researching");
}
