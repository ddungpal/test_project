// 확정(selection) 해석 회귀 — 확정 후 'AI로 다시 생성'(새 proposal INSERT, 상태 전이 없음)으로
//   더 새 proposal이 생겨도 확정 뷰가 사라지지 않아야 한다.
//   핵심: selection은 stage의 '모든 proposal 횡단 최신 selection'으로 읽고, payload는 그 selection 자신의
//   proposal candidates로 해석한다. sv.proposal은 최신 proposal 그대로(폴링·draft 기준).
import { describe, it, expect } from "vitest";
import {
  resolveSelectionPayload,
  resolveSelectionsByStage,
  type SelectionRow,
  type ProposalRef,
} from "../src/lib/dashboard/selectionResolve.js";
import type { CandidateView } from "../src/lib/dashboard/proposalTypes.js";

function cand(idx: number, payload: unknown): CandidateView {
  return { idx, payload, reason: "", evidence_ids: [] };
}

describe("resolveSelectionPayload", () => {
  it("edited_payload가 있으면 우선한다", () => {
    expect(resolveSelectionPayload({ title: "edited" }, 0, [cand(0, { title: "cand0" })])).toEqual({ title: "edited" });
  });
  it("edited 없으면 chosen_idx 후보 payload", () => {
    expect(resolveSelectionPayload(null, 1, [cand(0, { title: "a" }), cand(1, { title: "b" })])).toEqual({ title: "b" });
  });
  it("chosen 후보를 못 찾으면 {}", () => {
    expect(resolveSelectionPayload(null, 9, [cand(0, { title: "a" })])).toEqual({});
  });
  it("chosen_idx가 null이면 {}", () => {
    expect(resolveSelectionPayload(null, null, [cand(0, { title: "a" })])).toEqual({});
  });
});

describe("resolveSelectionsByStage — 재생성 후 확정 뷰 복구", () => {
  it("확정 selection이 P1, 더 새 proposal P2(selection 없음)일 때: selection non-null, payload는 P1 확정값으로 해석", () => {
    // proposals: created_at desc 가정(여기선 순서 무관 — id로 조회). P2가 최신.
    const proposals: ProposalRef[] = [
      { id: "P2", stage: "title_thumb", candidates: [cand(0, { title: "P2후보" })] }, // 재생성 결과(최신, selection 없음)
      { id: "P1", stage: "title_thumb", candidates: [cand(0, { title: "P1-A" }), cand(1, { title: "P1-B" })] },
    ];
    // sels: created_at desc — P1의 selection만 존재(B안 선택).
    const sels: SelectionRow[] = [
      { proposal_id: "P1", chosen_idx: 1, edited_payload: null, selection_reason: "B가 더 좋아" },
    ];
    const byStage = resolveSelectionsByStage(sels, proposals);
    const sel = byStage.get("title_thumb");
    expect(sel).toBeTruthy();
    expect(sel!.chosenIdx).toBe(1);
    expect(sel!.payload).toEqual({ title: "P1-B" }); // 최신 P2후보가 아니라 P1 확정값
    expect(sel!.reason).toBe("B가 더 좋아");
  });

  it("재생성 안 한 일반 경우(최신 proposal에 selection) — 기존과 동일 해석(회귀 가드)", () => {
    const proposals: ProposalRef[] = [
      { id: "P1", stage: "topic", candidates: [cand(0, { title: "T0" }), cand(1, { title: "T1" })] },
    ];
    const sels: SelectionRow[] = [
      { proposal_id: "P1", chosen_idx: 0, edited_payload: null, selection_reason: null },
    ];
    const sel = resolveSelectionsByStage(sels, proposals).get("topic");
    expect(sel!.payload).toEqual({ title: "T0" });
  });

  it("edited_payload가 있으면 그 selection 해석에 우선 반영된다", () => {
    const proposals: ProposalRef[] = [
      { id: "P1", stage: "title_thumb", candidates: [cand(0, { title: "원본" })] },
    ];
    const sels: SelectionRow[] = [
      { proposal_id: "P1", chosen_idx: 0, edited_payload: { title: "손편집본" }, selection_reason: null },
    ];
    expect(resolveSelectionsByStage(sels, proposals).get("title_thumb")!.payload).toEqual({ title: "손편집본" });
  });

  it("stage별 최신 selection만 채택(desc 선두) — 같은 stage 옛 selection은 무시", () => {
    const proposals: ProposalRef[] = [
      { id: "P2", stage: "structure", candidates: [cand(0, { approach: "신규" })] },
      { id: "P1", stage: "structure", candidates: [cand(0, { approach: "옛것" })] },
    ];
    // desc: P2 selection이 선두(최신) → 채택. P1 selection은 무시.
    const sels: SelectionRow[] = [
      { proposal_id: "P2", chosen_idx: 0, edited_payload: null, selection_reason: "재선택" },
      { proposal_id: "P1", chosen_idx: 0, edited_payload: null, selection_reason: "옛선택" },
    ];
    const sel = resolveSelectionsByStage(sels, proposals).get("structure");
    expect(sel!.payload).toEqual({ approach: "신규" });
    expect(sel!.reason).toBe("재선택");
  });

  it("이 run에 없는 proposal_id selection은 방어적으로 무시", () => {
    const proposals: ProposalRef[] = [{ id: "P1", stage: "topic", candidates: [cand(0, { title: "X" })] }];
    const sels: SelectionRow[] = [{ proposal_id: "ghost", chosen_idx: 0, edited_payload: null, selection_reason: null }];
    expect(resolveSelectionsByStage(sels, proposals).size).toBe(0);
  });
});
