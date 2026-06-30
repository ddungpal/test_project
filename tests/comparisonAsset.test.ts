// normalizeComparison 순수함수 단위테스트(comparison-table step0).
//   money-safety: 깨진 비교 payload는 절대 throw하지 않고 null로 드랍한다(빈/깨진 표 박제 금지).

import { describe, expect, it } from "vitest";
import { normalizeComparison } from "../src/pipeline/comparisonAsset.js";

describe("normalizeComparison", () => {
  it("정상 비교(entities 2·dimensions 2·grounded cells) → payload 통과, 필드 보존", () => {
    const out = normalizeComparison({
      entities: ["청년도약계좌", "청년미래적금"],
      dimensions: ["가입조건", "금리"],
      cells: [
        { dimension: "가입조건", entity: "청년도약계좌", value: "만 19~34세", verified: true },
        { dimension: "금리", entity: "청년도약계좌", value: "연 6%", verified: true },
        { dimension: "가입조건", entity: "청년미래적금", value: "만 19~34세", verified: false },
        { dimension: "금리", entity: "청년미래적금", value: "연 5%", verified: false },
      ],
      caption: "청년 금융상품 비교",
    });
    expect(out).toEqual({
      entities: ["청년도약계좌", "청년미래적금"],
      dimensions: ["가입조건", "금리"],
      cells: [
        { dimension: "가입조건", entity: "청년도약계좌", value: "만 19~34세", verified: true },
        { dimension: "금리", entity: "청년도약계좌", value: "연 6%", verified: true },
        { dimension: "가입조건", entity: "청년미래적금", value: "만 19~34세", verified: false },
        { dimension: "금리", entity: "청년미래적금", value: "연 5%", verified: false },
      ],
      caption: "청년 금융상품 비교",
    });
  });

  it("entities 1개 → null(비교 대상 1개면 표가 아니다)", () => {
    expect(
      normalizeComparison({
        entities: ["청년도약계좌"],
        dimensions: ["금리"],
        cells: [{ dimension: "금리", entity: "청년도약계좌", value: "연 6%", verified: true }],
      }),
    ).toBeNull();
  });

  it("dimensions 0개 → null", () => {
    expect(
      normalizeComparison({
        entities: ["A", "B"],
        dimensions: [],
        cells: [{ dimension: "금리", entity: "A", value: "6%", verified: true }],
      }),
    ).toBeNull();
  });

  it("유효 cell 0개 → null(빈 표 금지)", () => {
    // cells 빈 배열.
    expect(
      normalizeComparison({ entities: ["A", "B"], dimensions: ["금리"], cells: [] }),
    ).toBeNull();
    // cell들이 모두 잘못된 타입 → 전부 버려져 0개 → null.
    expect(
      normalizeComparison({
        entities: ["A", "B"],
        dimensions: ["금리"],
        cells: [{ dimension: "금리", entity: "A", value: 123 }, "nope", null],
      }),
    ).toBeNull();
  });

  it("entity/dimension가 선언 목록에 없는 cell → 그 cell만 버려짐(나머지 통과)", () => {
    const out = normalizeComparison({
      entities: ["A", "B"],
      dimensions: ["금리"],
      cells: [
        { dimension: "금리", entity: "A", value: "6%", verified: true },
        { dimension: "금리", entity: "C", value: "9%", verified: true }, // entity C 미선언 → 버림
        { dimension: "혜택", entity: "B", value: "x", verified: true }, // dimension 혜택 미선언 → 버림
        { dimension: "금리", entity: "B", value: "5%", verified: false },
      ],
    });
    expect(out).toEqual({
      entities: ["A", "B"],
      dimensions: ["금리"],
      cells: [
        { dimension: "금리", entity: "A", value: "6%", verified: true },
        { dimension: "금리", entity: "B", value: "5%", verified: false },
      ],
    });
  });

  it("verified 누락/비-boolean → false 폴백, 알 수 없는 추가 필드는 버림", () => {
    const out = normalizeComparison({
      entities: ["A", "B"],
      dimensions: ["금리"],
      cells: [
        { dimension: "금리", entity: "A", value: "6%" }, // verified 누락 → false
        { dimension: "금리", entity: "B", value: "5%", verified: "yes", junk: 1 }, // 비-boolean → false, stray 버림
      ],
      stray: "버려짐",
    });
    expect(out).toEqual({
      entities: ["A", "B"],
      dimensions: ["금리"],
      cells: [
        { dimension: "금리", entity: "A", value: "6%", verified: false },
        { dimension: "금리", entity: "B", value: "5%", verified: false },
      ],
    });
  });

  it("caption은 string일 때만 흡수(비-string → 제외, 비교는 유지)", () => {
    const out = normalizeComparison({
      entities: ["A", "B"],
      dimensions: ["금리"],
      cells: [{ dimension: "금리", entity: "A", value: "6%", verified: true }],
      caption: 123,
    });
    expect(out).toEqual({
      entities: ["A", "B"],
      dimensions: ["금리"],
      cells: [{ dimension: "금리", entity: "A", value: "6%", verified: true }],
    });
  });

  it("entities/dimensions가 배열 아니거나 비-string 포함 → null", () => {
    expect(normalizeComparison({ entities: "A,B", dimensions: ["금리"], cells: [] })).toBeNull();
    expect(normalizeComparison({ entities: ["A", 2], dimensions: ["금리"], cells: [] })).toBeNull();
    expect(normalizeComparison({ entities: ["A", "B"], dimensions: "금리", cells: [] })).toBeNull();
    expect(normalizeComparison({ entities: ["A", "B"], dimensions: ["금리"], cells: "nope" })).toBeNull();
  });

  it("어떤 입력에도 throw하지 않는다", () => {
    const garbage: unknown[] = [
      undefined,
      null,
      0,
      "",
      "x",
      [],
      {},
      NaN,
      true,
      () => {},
      Symbol("s"),
      { entities: null, dimensions: null, cells: null },
      { entities: ["A", "B"], dimensions: ["d"], cells: [undefined, null, 1, "x", {}] },
    ];
    for (const g of garbage) {
      expect(() => normalizeComparison(g)).not.toThrow();
    }
  });
});
