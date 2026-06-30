// normalizeSegmentPayload 순수함수 단위테스트(script-format-model step0).
//   money-safety: 깨진 kind/payload는 절대 throw하지 않고 prose로 폴백한다.

import { describe, expect, it } from "vitest";
import { normalizeSegmentPayload } from "../src/pipeline/segmentBlock.js";

describe("normalizeSegmentPayload", () => {
  it("undefined/null/prose/미지 kind → prose, payload null", () => {
    expect(normalizeSegmentPayload(undefined, null)).toEqual({ kind: "prose", payload: null });
    expect(normalizeSegmentPayload(null, null)).toEqual({ kind: "prose", payload: null });
    expect(normalizeSegmentPayload("prose", { columns: ["a"] })).toEqual({ kind: "prose", payload: null });
    expect(normalizeSegmentPayload("unknown_block", { foo: 1 })).toEqual({ kind: "prose", payload: null });
    expect(normalizeSegmentPayload("", null)).toEqual({ kind: "prose", payload: null });
  });

  describe("table", () => {
    it("정상 table → columns/rows 보존", () => {
      const out = normalizeSegmentPayload("table", {
        columns: ["항목", "금액"],
        rows: [["세금", "10만원"], ["수익", "5만원"]],
      });
      expect(out).toEqual({
        kind: "table",
        payload: { columns: ["항목", "금액"], rows: [["세금", "10만원"], ["수익", "5만원"]] },
      });
    });

    it("caption은 string일 때만 흡수", () => {
      const ok = normalizeSegmentPayload("table", { columns: ["a"], rows: [["1"]], caption: "표 설명" });
      expect(ok).toEqual({ kind: "table", payload: { columns: ["a"], rows: [["1"]], caption: "표 설명" } });
      // caption 비-string → 제외(prose 폴백 아님, table 유지).
      const noCap = normalizeSegmentPayload("table", { columns: ["a"], rows: [["1"]], caption: 123 });
      expect(noCap).toEqual({ kind: "table", payload: { columns: ["a"], rows: [["1"]] } });
    });

    it("알 수 없는 추가 필드는 버린다(stray 흡수)", () => {
      const out = normalizeSegmentPayload("table", { columns: ["a"], rows: [["1"]], junk: "버려짐", style: {} });
      expect(out).toEqual({ kind: "table", payload: { columns: ["a"], rows: [["1"]] } });
    });

    it("깨진 table(rows 누락/잘못된 타입) → prose 폴백", () => {
      expect(normalizeSegmentPayload("table", { columns: ["a"] })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("table", { columns: ["a"], rows: "nope" })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("table", { columns: [1, 2], rows: [["a"]] })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("table", { columns: ["a"], rows: [["ok"], [1]] })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("table", null)).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("table", "string")).toEqual({ kind: "prose", payload: null });
    });
  });

  describe("case", () => {
    it("정상 case → branches 보존, intro string일 때만 흡수", () => {
      const out = normalizeSegmentPayload("case", {
        intro: "상황별로 보면",
        branches: [
          { condition: "연봉 5천 이하", outcome: "공제 유리" },
          { condition: "연봉 1억 이상", outcome: "한도 초과" },
        ],
      });
      expect(out).toEqual({
        kind: "case",
        payload: {
          intro: "상황별로 보면",
          branches: [
            { condition: "연봉 5천 이하", outcome: "공제 유리" },
            { condition: "연봉 1억 이상", outcome: "한도 초과" },
          ],
        },
      });
    });

    it("intro 비-string이면 제외(case 유지)·stray 버림", () => {
      const out = normalizeSegmentPayload("case", {
        intro: 42,
        branches: [{ condition: "c", outcome: "o", extra: "버려짐" }],
        junk: true,
      });
      expect(out).toEqual({ kind: "case", payload: { branches: [{ condition: "c", outcome: "o" }] } });
    });

    it("빈/잘못된 branches → prose 폴백", () => {
      expect(normalizeSegmentPayload("case", { branches: [] })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("case", { branches: "nope" })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("case", { branches: [{ condition: "c" }] })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("case", { branches: [{ condition: 1, outcome: "o" }] })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("case", { branches: ["not-object"] })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("case", null)).toEqual({ kind: "prose", payload: null });
    });
  });

  describe("visual", () => {
    it("정상 visual → cue 보존, note string일 때만 흡수", () => {
      expect(normalizeSegmentPayload("visual", { cue: "그래프 줌인" })).toEqual({
        kind: "visual",
        payload: { cue: "그래프 줌인" },
      });
      expect(normalizeSegmentPayload("visual", { cue: "그래프 줌인", note: "빨강 강조" })).toEqual({
        kind: "visual",
        payload: { cue: "그래프 줌인", note: "빨강 강조" },
      });
      // note 비-string → 제외, stray 버림.
      expect(normalizeSegmentPayload("visual", { cue: "컷", note: 9, junk: [] })).toEqual({
        kind: "visual",
        payload: { cue: "컷" },
      });
    });

    it("cue 없는/빈 visual → prose 폴백", () => {
      expect(normalizeSegmentPayload("visual", { note: "설명만" })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("visual", { cue: "" })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("visual", { cue: 123 })).toEqual({ kind: "prose", payload: null });
      expect(normalizeSegmentPayload("visual", null)).toEqual({ kind: "prose", payload: null });
    });
  });

  it("어떤 입력에도 throw하지 않는다", () => {
    const garbage: unknown[] = [undefined, null, 0, "", "x", [], {}, NaN, true, () => {}, Symbol("s")];
    for (const k of ["table", "case", "visual", "prose", "weird", "", null, undefined]) {
      for (const p of garbage) {
        expect(() => normalizeSegmentPayload(k as string | null | undefined, p)).not.toThrow();
      }
    }
  });
});
