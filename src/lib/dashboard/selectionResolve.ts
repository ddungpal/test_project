import type { Stage } from "../../domain/enums.js";
import type { CandidateView, ProposalStage } from "./proposalTypes.js";

// 확정(selection) 해석 — 순수(외부 의존 없음, server-only 아님 → 테스트 직접 import 가능).
//   배경: 확정 후 'AI로 다시 생성'(post-confirm-regenerate)은 새 proposal을 INSERT만 한다(상태 전이 없음).
//   그래서 stage의 selection을 '최신 proposal id'로만 찾으면, 새 proposal엔 selection이 없어 확정 뷰가 사라진다.
//   해결: selection은 stage의 '모든 proposal 횡단 최신 selection'으로 읽고, 그 payload는
//   selection 자신의 proposal candidates로 해석한다(최신 proposal이 아니라). sv.proposal은 최신 proposal 그대로.

export interface StageSelectionView {
  chosenIdx: number | null;
  editedPayload: unknown | null;
  reason: string | null;
  payload: unknown; // 해석된 확정 payload: edited_payload ?? 자기 proposal candidate[chosen_idx] ?? {}
}

/** stage_selections 한 행(해석 입력) — created_at desc 정렬 전제. */
export interface SelectionRow {
  proposal_id: string;
  chosen_idx: number | null;
  edited_payload: unknown | null;
  selection_reason: string | null;
}

/** proposal id → 그 proposal의 stage·candidates(해석에 필요). */
export interface ProposalRef {
  id: string;
  stage: Stage;
  candidates: CandidateView[];
}

/**
 * 확정 payload 해석(순수) — edited_payload 우선, 없으면 그 proposal의 chosen 후보 payload, 둘 다 없으면 {}.
 *   ★ candidates는 반드시 'selection이 속한 proposal'의 것이어야 한다(최신 proposal 아님).
 */
export function resolveSelectionPayload(
  editedPayload: unknown | null,
  chosenIdx: number | null,
  candidates: CandidateView[],
): unknown {
  if (editedPayload != null) return editedPayload;
  if (chosenIdx != null) {
    const c = candidates.find((c) => c.idx === chosenIdx);
    if (c) return c.payload;
  }
  return {};
}

/**
 * stage별 최신 selection을 해석한 뷰로 맵핑(순수).
 *   - sels: created_at desc 정렬 전제(선두가 최신). stage별 첫(최신) selection만 채택.
 *   - proposals: 이 run의 모든 proposal(stage·candidates). selection의 proposal_id로 stage·candidates를 찾는다.
 *   - payload는 selection 자신의 proposal candidates로 해석한다(재생성으로 더 새 proposal이 있어도 무관).
 */
export function resolveSelectionsByStage(
  sels: readonly SelectionRow[],
  proposals: readonly ProposalRef[],
): Map<ProposalStage, StageSelectionView> {
  const byId = new Map<string, ProposalRef>();
  for (const p of proposals) byId.set(p.id, p);

  const out = new Map<ProposalStage, StageSelectionView>();
  for (const s of sels) {
    const prop = byId.get(s.proposal_id);
    if (!prop) continue; // 이 run에 속하지 않는 proposal(방어)
    const stage = prop.stage as ProposalStage;
    if (out.has(stage)) continue; // 이미 최신(desc 첫 항목) 채택됨
    out.set(stage, {
      chosenIdx: s.chosen_idx,
      editedPayload: s.edited_payload,
      reason: s.selection_reason,
      payload: resolveSelectionPayload(s.edited_payload, s.chosen_idx, prop.candidates),
    });
  }
  return out;
}
