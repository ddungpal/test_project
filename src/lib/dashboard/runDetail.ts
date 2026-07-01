import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import type { RunState, Stage } from "../../domain/enums.js";
import { PROPOSAL_STAGES, type CandidateView, type ProposalStage, type ProposalSource } from "./proposalTypes.js";
import { resolveSelectionsByStage, type ProposalRef, type StageSelectionView } from "./selectionResolve.js";
import type { ContentRelation } from "./seedTypes.js";

export type { StageSelectionView };

// 런 상세 읽기(Phase 3.2) — 서버 컴포넌트 전용. admin 클라이언트(개발 바이패스와 짝, 읽기전용).

export interface StageProposalView {
  proposalId: string;
  candidates: CandidateView[];
  sources: ProposalSource[]; // 검색 출처(웹·YouTube) — migration 16, 없으면 []
}
export interface StageView {
  stage: ProposalStage;
  proposal: StageProposalView | null;
  selection: StageSelectionView | null;
}
export interface RunDetail {
  run: {
    id: string;
    state: RunState;
    costUsd: number;
    reworkCount: number;
    abortReason: string | null;
    createdAt: string;
    asOfDate: string;
    model: string | null;
    progressNote: string | null; // 단계 내부 서브진행 'i/n·라벨'(migration 15)
  };
  content: { topic: string | null; title: string | null };
  references: { label: string; relation: ContentRelation; intent: string | null }[]; // 씨앗 모드 참조 기존편(migration 14)
  stages: Record<ProposalStage, StageView>;
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  const supa = createAdminClient();

  const { data: run, error: re } = await supa
    .from("production_runs")
    .select("id, state, cost_usd, rework_count, abort_reason, created_at, as_of_date, model, content_id")
    .eq("id", runId)
    .maybeSingle();
  if (re) throw new Error(`런 조회 실패: ${re.message}`);
  if (!run) return null;

  // 그룹 A(run 이후 독립 병렬): 서브진행·content·content_links·proposals.
  //   progressNote는 best-effort(컬럼 미적용이어도 본 조회 안 깨지게) → Promise.all 안에서 reject 안 되게 가드.
  const [pnRes, contentRes, linksRes, proposalsRes] = await Promise.all([
    supa
      .from("production_runs")
      .select("progress_note")
      .eq("id", runId)
      .maybeSingle()
      .then((r) => r, () => ({ data: null, error: { message: "progress_note 조회 실패" } as { message: string } })),
    supa.from("contents").select("topic, title").eq("id", run.content_id).maybeSingle(),
    supa
      .from("content_links")
      .select("to_content_id, relation, intent, created_at")
      .eq("from_content_id", run.content_id)
      .order("created_at", { ascending: true }),
    supa
      .from("stage_proposals")
      .select("id, stage, candidates, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: false }),
  ]);

  // 서브진행(migration 15) — 별도 best-effort 조회.
  let progressNote: string | null = null;
  {
    const { data: pn, error: pne } = pnRes;
    if (!pne && pn) progressNote = (pn as { progress_note: string | null }).progress_note;
  }

  const { data: content, error: ce } = contentRes;
  if (ce) throw new Error(`contents 조회 실패: ${ce.message}`);

  const { data: links, error: le } = linksRes;
  if (le) throw new Error(`content_links 조회 실패: ${le.message}`);

  const { data: proposals, error: pe } = proposalsRes;
  if (pe) throw new Error(`제안 조회 실패: ${pe.message}`);

  const latestByStage = new Map<Stage, { id: string; candidates: CandidateView[]; sources: ProposalSource[] }>();
  for (const p of proposals ?? []) {
    if (p.stage === "onboarding") continue; // 온보딩은 선형 파이프라인 밖(off-chain) — 별도 UI에서 소비, 여기선 무시.
    if (latestByStage.has(p.stage)) continue; // 이미 최신(내림차순 첫 항목)
    latestByStage.set(p.stage, { id: p.id, candidates: (p.candidates as unknown as CandidateView[]) ?? [], sources: [] });
  }

  // 그룹 B(그룹 A 결과 파생, 서로 독립 → 병렬): refContents(←links)·srcRows(←latestIds)·selections(←proposalIds).
  //   각 입력 배열이 비면 쿼리를 건너뛰던 가드 유지(빈 입력 시 null로 resolve). srcRows는 best-effort.
  const toIds = links && links.length > 0 ? [...new Set(links.map((l) => l.to_content_id))] : [];
  const latestIds = [...latestByStage.values()].map((v) => v.id);
  const proposalIds = (proposals ?? []).map((p) => p.id);

  const [refContentsRes, srcRowsRes, selsRes] = await Promise.all([
    toIds.length > 0
      ? supa.from("contents").select("id, title, topic").in("id", toIds)
      : Promise.resolve(null),
    latestIds.length > 0
      ? supa
          .from("stage_proposals")
          .select("id, sources")
          .in("id", latestIds)
          .then((r) => r, () => ({ data: null, error: { message: "sources 조회 실패" } as { message: string } }))
      : Promise.resolve(null),
    proposalIds.length > 0
      ? supa
          .from("stage_selections")
          .select("proposal_id, chosen_idx, edited_payload, selection_reason, created_at")
          .in("proposal_id", proposalIds)
          .order("created_at", { ascending: false })
      : Promise.resolve(null),
  ]);

  // 참조 기존편(씨앗 모드 content_links) — 대상 content 라벨 코드 조인.
  let references: RunDetail["references"] = [];
  if (links && links.length > 0) {
    const { data: refContents, error: rce } = refContentsRes ?? { data: null, error: null };
    if (rce) throw new Error(`참조 contents 조회 실패: ${rce.message}`);
    const labelById = new Map((refContents ?? []).map((c) => [c.id, c.title || c.topic || "(제목 미정)"]));
    references = links.map((l) => ({
      label: labelById.get(l.to_content_id) ?? "(삭제된 편)",
      relation: l.relation as ContentRelation,
      intent: l.intent,
    }));
  }

  // 검색 출처(migration 16) — 별도 best-effort 조회(컬럼 미적용이어도 본 조회 안 깨지게). 최신 proposal에만 부착.
  if (latestIds.length > 0) {
    const { data: srcRows, error: sre } = srcRowsRes ?? { data: null, error: null };
    if (!sre) {
      const byId = new Map((srcRows ?? []).map((r) => [r.id, (r as { sources: ProposalSource[] | null }).sources ?? []]));
      for (const v of latestByStage.values()) v.sources = byId.get(v.id) ?? [];
    }
  }

  // 선택(stage_selections) — 이 run의 proposal들에 한정. stage별 '모든 proposal 횡단 최신 selection'을 채택하고,
  //   각 selection의 payload는 '그 selection이 속한 proposal'의 candidates로 해석한다(최신 proposal 아님).
  //   ★ 확정 후 재생성(새 proposal INSERT)으로 더 새 proposal이 생겨도 확정 뷰가 사라지지 않는다(selection은 옛 proposal 소속).
  let selByStage = new Map<ProposalStage, StageSelectionView>();
  if (proposalIds.length > 0) {
    const { data: sels, error: se } = selsRes ?? { data: null, error: null };
    if (se) throw new Error(`선택 조회 실패: ${se.message}`);
    // 해석에 필요한 proposal_id → { stage, candidates }(모든 proposal 횡단). selsRes는 created_at desc 정렬.
    const proposalRefs: ProposalRef[] = (proposals ?? []).map((p) => ({
      id: p.id,
      stage: p.stage as Stage,
      candidates: (p.candidates as unknown as CandidateView[]) ?? [],
    }));
    selByStage = resolveSelectionsByStage(sels ?? [], proposalRefs);
  }

  const stages = {} as Record<ProposalStage, StageView>;
  for (const stage of PROPOSAL_STAGES) {
    const prop = latestByStage.get(stage) ?? null; // sv.proposal은 최신 proposal 그대로(폴링·draft 기준).
    stages[stage] = {
      stage,
      proposal: prop ? { proposalId: prop.id, candidates: prop.candidates, sources: prop.sources } : null,
      selection: selByStage.get(stage) ?? null,
    };
  }

  return {
    run: {
      id: run.id,
      state: run.state as RunState,
      costUsd: run.cost_usd,
      reworkCount: run.rework_count,
      abortReason: run.abort_reason,
      createdAt: run.created_at,
      asOfDate: run.as_of_date,
      model: run.model,
      progressNote,
    },
    content: { topic: content?.topic ?? null, title: content?.title ?? null },
    references,
    stages,
  };
}
