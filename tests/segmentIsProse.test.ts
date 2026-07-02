// isProseSegment(순수) — 프로즈(직접 텍스트 수정 대상)인지 판정. 블록(table/case/visual+payload)만 false.
//   컴포넌트(EditableSegment)에서 편집 버튼 게이팅에 쓰는 규칙 — lib에 둬 vitest(.js 상대경로)로 검증.
import { describe, it, expect } from "vitest";
import { isProseSegment } from "../src/lib/script/segmentEdit.js";

describe("isProseSegment — 프로즈만 편집 대상", () => {
  it("kind=prose는 프로즈(true)", () => {
    expect(isProseSegment({ kind: "prose", payload: null })).toBe(true);
  });

  it("블록 kind인데 payload 있으면 블록(false) — 편집 미노출", () => {
    expect(isProseSegment({ kind: "table", payload: { columns: [], rows: [] } })).toBe(false);
    expect(isProseSegment({ kind: "case", payload: { branches: [] } })).toBe(false);
    expect(isProseSegment({ kind: "visual", payload: { cue: "x" } })).toBe(false);
  });

  it("블록 kind인데 payload가 null이면 프로즈 폴백(true) — SegmentBody 렌더 분기와 동일", () => {
    expect(isProseSegment({ kind: "table", payload: null })).toBe(true);
    expect(isProseSegment({ kind: "visual", payload: null })).toBe(true);
  });
});
