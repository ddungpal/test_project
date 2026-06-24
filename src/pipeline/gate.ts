// 사람 게이트(§8.1 [사람 게이트]) — 컨펌 = 새 AI 호출이 아니라 상태 플래그 전환뿐.
//   stage_selections에 선택(+수정·이유) 기록 → run을 selectedState로 전이. AI 0회.
//   학습 입도(§8.4): proposed↔selected 델타 + selection_reason이 1차 학습 신호.

import { transitionRun, getRun, type Supa } from "./runState.js";
import { STAGE_DESCRIPTORS, type StageDescriptor } from "./stages.js";
import type { Json } from "../lib/supabase/database.types.js";

export interface SelectInput {
  runId: string;
  proposalId: string;
  chosenIdx: number;
  editedPayload?: unknown; // 사람이 수정했으면(없으면 후보 원안 채택)
  selectionReason?: string; // "왜 골랐나" — 선택패턴 학습 입력
  selectedBy?: string; // profiles.id(owner)
}

export interface SelectResult {
  selectionId: string;
  state: StageDescriptor["selectedState"];
}

export async function selectProposal(supa: Supa, descriptor: StageDescriptor, sel: SelectInput): Promise<SelectResult> {
  const run = await getRun(supa, sel.runId);
  if (run.state !== descriptor.proposedState) {
    throw new Error(`${descriptor.stage} 선택은 '${descriptor.proposedState}'에서만 가능(현재 '${run.state}').`);
  }

  // 코드리뷰 P1: proposalId가 이 run·stage에 실제로 속하는지 + chosenIdx가 후보에 존재하는지 검증
  // (스코프 누락 시 다른 run의 제안으로 교차 오염 가능).
  const { data: proposal, error: pe } = await supa
    .from("stage_proposals")
    .select("id, candidates")
    .eq("id", sel.proposalId)
    .eq("run_id", sel.runId)
    .eq("stage", descriptor.stage)
    .maybeSingle();
  if (pe) throw new Error(`proposal 조회 실패: ${pe.message}`);
  if (!proposal) throw new Error(`proposal ${sel.proposalId}는 run ${sel.runId}의 '${descriptor.stage}' 단계에 속하지 않음.`);
  const candidates = (proposal.candidates as unknown as { idx: number }[]) ?? [];
  if (sel.editedPayload === undefined && !candidates.some((c) => c.idx === sel.chosenIdx)) {
    throw new Error(`chosenIdx ${sel.chosenIdx}가 후보에 없음(후보 ${candidates.length}개).`);
  }

  const { data: selection, error: se } = await supa
    .from("stage_selections")
    .insert({
      proposal_id: sel.proposalId,
      chosen_idx: sel.chosenIdx,
      ...(sel.editedPayload !== undefined ? { edited_payload: sel.editedPayload as Json } : {}),
      ...(sel.selectionReason !== undefined ? { selection_reason: sel.selectionReason } : {}),
      ...(sel.selectedBy !== undefined ? { selected_by: sel.selectedBy } : {}),
    })
    .select("id")
    .single();
  if (se) throw new Error(`stage_selections insert 실패: ${se.message}`);

  await transitionRun(supa, sel.runId, descriptor.proposedState, descriptor.selectedState);
  return { selectionId: selection.id, state: descriptor.selectedState };
}

// 썸네일 확정(사람 게이트) — 단일 후보 '선택'이 아니라 3개 세트를 '그대로 확정'(A/B/C 테스트용).
//   selectProposal과 달리 chosen_idx는 의미가 없어 0(센티넬)으로 두고, edited_payload에 확정한
//   3개 candidates의 payload 배열을 기록한다. AI 0회(컨펌=상태전환+기록만).
//   스코프검증은 selectProposal 미러: 이 run·"thumbnail"에 속하는 최신 proposal·후보 3개 이상.
export interface ConfirmThumbnailsResult {
  selectionId: string;
  state: "thumbnails_selected";
}

export async function confirmThumbnailSet(supa: Supa, runId: string): Promise<ConfirmThumbnailsResult> {
  const desc = STAGE_DESCRIPTORS.thumbnail;
  const run = await getRun(supa, runId);
  if (run.state !== desc.proposedState) {
    throw new Error(`썸네일 확정은 '${desc.proposedState}'에서만 가능(현재 '${run.state}').`);
  }

  // 최신 thumbnail proposal(이 run·"thumbnail"에 속하는지 — selectProposal 스코프검증 미러).
  const { data: proposal, error: pe } = await supa
    .from("stage_proposals")
    .select("id, candidates")
    .eq("run_id", runId)
    .eq("stage", desc.stage)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pe) throw new Error(`thumbnail proposal 조회 실패: ${pe.message}`);
  if (!proposal) throw new Error(`run ${runId}에 확정할 'thumbnail' 제안이 없음.`);
  const candidates = (proposal.candidates as unknown as { payload: unknown }[]) ?? [];
  if (candidates.length < 3) {
    throw new Error(`썸네일 확정: 후보가 3개 미만(현재 ${candidates.length}). 3개 세트 확정 불가.`);
  }

  // 확정된 3개 candidates의 payload 배열을 edited_payload로 기록(chosen_idx=0 센티넬).
  const editedPayload = candidates.map((c) => c.payload) as unknown as Json;
  const { data: selection, error: se } = await supa
    .from("stage_selections")
    .insert({ proposal_id: proposal.id, chosen_idx: 0, edited_payload: editedPayload })
    .select("id")
    .single();
  if (se) throw new Error(`stage_selections insert 실패: ${se.message}`);

  await transitionRun(supa, runId, desc.proposedState, desc.selectedState);
  return { selectionId: selection.id, state: desc.selectedState };
}
