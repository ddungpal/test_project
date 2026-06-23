import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import type { RunState, Stage } from "../../domain/enums.js";
import { PROPOSAL_STAGES, type CandidateView, type ProposalStage, type ProposalSource } from "./proposalTypes.js";
import type { ContentRelation } from "./seedTypes.js";

// 런 상세 읽기(Phase 3.2) — 서버 컴포넌트 전용. admin 클라이언트(개발 바이패스와 짝, 읽기전용).

export interface StageProposalView {
  proposalId: string;
  candidates: CandidateView[];
  sources: ProposalSource[]; // 검색 출처(웹·YouTube) — migration 16, 없으면 []
}
export interface StageSelectionView {
  chosenIdx: number | null;
  editedPayload: unknown | null;
  reason: string | null;
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

  // 서브진행(migration 15) — 별도 best-effort 조회(컬럼 미적용이어도 본 조회는 안 깨지게).
  let progressNote: string | null = null;
  {
    const { data: pn, error: pne } = await supa.from("production_runs").select("progress_note").eq("id", runId).maybeSingle();
    if (!pne && pn) progressNote = (pn as { progress_note: string | null }).progress_note;
  }

  const { data: content, error: ce } = await supa
    .from("contents")
    .select("topic, title")
    .eq("id", run.content_id)
    .maybeSingle();
  if (ce) throw new Error(`contents 조회 실패: ${ce.message}`);

  // 참조 기존편(씨앗 모드 content_links) — 대상 content 라벨 코드 조인.
  const { data: links, error: le } = await supa
    .from("content_links")
    .select("to_content_id, relation, intent, created_at")
    .eq("from_content_id", run.content_id)
    .order("created_at", { ascending: true });
  if (le) throw new Error(`content_links 조회 실패: ${le.message}`);
  let references: RunDetail["references"] = [];
  if (links && links.length > 0) {
    const toIds = [...new Set(links.map((l) => l.to_content_id))];
    const { data: refContents, error: rce } = await supa.from("contents").select("id, title, topic").in("id", toIds);
    if (rce) throw new Error(`참조 contents 조회 실패: ${rce.message}`);
    const labelById = new Map((refContents ?? []).map((c) => [c.id, c.title || c.topic || "(제목 미정)"]));
    references = links.map((l) => ({
      label: labelById.get(l.to_content_id) ?? "(삭제된 편)",
      relation: l.relation as ContentRelation,
      intent: l.intent,
    }));
  }

  // 단계별 최신 proposal(같은 단계 재시도 시 마지막 것).
  const { data: proposals, error: pe } = await supa
    .from("stage_proposals")
    .select("id, stage, candidates, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: false });
  if (pe) throw new Error(`제안 조회 실패: ${pe.message}`);

  const latestByStage = new Map<Stage, { id: string; candidates: CandidateView[]; sources: ProposalSource[] }>();
  for (const p of proposals ?? []) {
    if (latestByStage.has(p.stage)) continue; // 이미 최신(내림차순 첫 항목)
    latestByStage.set(p.stage, { id: p.id, candidates: (p.candidates as unknown as CandidateView[]) ?? [], sources: [] });
  }

  // 검색 출처(migration 16) — 별도 best-effort 조회(컬럼 미적용이어도 본 조회 안 깨지게). 최신 proposal에만 부착.
  {
    const latestIds = [...latestByStage.values()].map((v) => v.id);
    if (latestIds.length > 0) {
      const { data: srcRows, error: sre } = await supa.from("stage_proposals").select("id, sources").in("id", latestIds);
      if (!sre) {
        const byId = new Map((srcRows ?? []).map((r) => [r.id, (r as { sources: ProposalSource[] | null }).sources ?? []]));
        for (const v of latestByStage.values()) v.sources = byId.get(v.id) ?? [];
      }
    }
  }

  // 선택(stage_selections) — 이 run의 proposal들에 한정.
  const proposalIds = (proposals ?? []).map((p) => p.id);
  const selByProposal = new Map<string, StageSelectionView>();
  if (proposalIds.length > 0) {
    const { data: sels, error: se } = await supa
      .from("stage_selections")
      .select("proposal_id, chosen_idx, edited_payload, selection_reason, created_at")
      .in("proposal_id", proposalIds)
      .order("created_at", { ascending: false });
    if (se) throw new Error(`선택 조회 실패: ${se.message}`);
    for (const s of sels ?? []) {
      if (selByProposal.has(s.proposal_id)) continue;
      selByProposal.set(s.proposal_id, {
        chosenIdx: s.chosen_idx,
        editedPayload: s.edited_payload,
        reason: s.selection_reason,
      });
    }
  }

  const stages = {} as Record<ProposalStage, StageView>;
  for (const stage of PROPOSAL_STAGES) {
    const prop = latestByStage.get(stage) ?? null;
    stages[stage] = {
      stage,
      proposal: prop ? { proposalId: prop.id, candidates: prop.candidates, sources: prop.sources } : null,
      selection: prop ? (selByProposal.get(prop.id) ?? null) : null,
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
