// normalizeCaseAsset 순수함수 단위테스트(case-branching step0).
//   money-safety: 깨진 분기 payload는 절대 throw하지 않고 null로 드랍한다(빈/깨진 케이스 박제 금지).

import { describe, expect, it } from "vitest";
import { normalizeCaseAsset } from "../src/pipeline/caseAsset.js";

describe("normalizeCaseAsset", () => {
  it("정상 케이스(branches 2·grounded) → payload 통과, 필드 보존", () => {
    const out = normalizeCaseAsset({
      intro: "상황별로 나눠보면",
      branches: [
        { condition: "월급이 일정하면", outcome: "자동이체로 선저축", grounded: true },
        { condition: "수입이 불규칙하면", outcome: "비상금부터 확보", grounded: true },
      ],
    });
    expect(out).toEqual({
      intro: "상황별로 나눠보면",
      branches: [
        { condition: "월급이 일정하면", outcome: "자동이체로 선저축", grounded: true },
        { condition: "수입이 불규칙하면", outcome: "비상금부터 확보", grounded: true },
      ],
    });
  });

  it("branches 1개 → null(분기 1개는 케이스가 아니다)", () => {
    expect(
      normalizeCaseAsset({
        branches: [{ condition: "A", outcome: "B", grounded: true }],
      }),
    ).toBeNull();
  });

  it("branches 0개 → null", () => {
    expect(normalizeCaseAsset({ branches: [] })).toBeNull();
  });

  it("condition/outcome 비-string인 branch는 버려짐 → 유효 2개 미만이면 null", () => {
    // 하나만 유효, 나머지는 타입 깨짐 → 유효 1개 → null.
    expect(
      normalizeCaseAsset({
        branches: [
          { condition: "A", outcome: "B", grounded: true },
          { condition: 1, outcome: "B" }, // condition 비-string → 버림
          { condition: "C", outcome: null }, // outcome 비-string → 버림
        ],
      }),
    ).toBeNull();
  });

  it("일부 branch만 무효 → 유효 분기 ≥2면 통과(무효만 버림)", () => {
    const out = normalizeCaseAsset({
      branches: [
        { condition: "A", outcome: "B", grounded: true },
        "nope", // 객체 아님 → 버림
        { condition: "C", outcome: "D", grounded: false },
        { outcome: "E", grounded: true }, // condition 누락 → 버림
      ],
    });
    expect(out).toEqual({
      branches: [
        { condition: "A", outcome: "B", grounded: true },
        { condition: "C", outcome: "D", grounded: false },
      ],
    });
  });

  it("grounded 누락/비-boolean → false 폴백, 알 수 없는 추가 필드는 버림", () => {
    const out = normalizeCaseAsset({
      branches: [
        { condition: "A", outcome: "B" }, // grounded 누락 → false
        { condition: "C", outcome: "D", grounded: "yes", junk: 1 }, // 비-boolean → false, stray 버림
      ],
      stray: "버려짐",
    });
    expect(out).toEqual({
      branches: [
        { condition: "A", outcome: "B", grounded: false },
        { condition: "C", outcome: "D", grounded: false },
      ],
    });
  });

  it("intro는 string일 때만 흡수(비-string → 제외, 케이스는 유지)", () => {
    const out = normalizeCaseAsset({
      intro: 123,
      branches: [
        { condition: "A", outcome: "B", grounded: true },
        { condition: "C", outcome: "D", grounded: true },
      ],
    });
    expect(out).toEqual({
      branches: [
        { condition: "A", outcome: "B", grounded: true },
        { condition: "C", outcome: "D", grounded: true },
      ],
    });
  });

  it("branches가 배열이 아니면 → null", () => {
    expect(normalizeCaseAsset({ branches: "A,B" })).toBeNull();
    expect(normalizeCaseAsset({ branches: {} })).toBeNull();
    expect(normalizeCaseAsset({})).toBeNull();
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
      { branches: null },
      { branches: [undefined, null, 1, "x", {}, { condition: 1 }] },
    ];
    for (const g of garbage) {
      expect(() => normalizeCaseAsset(g)).not.toThrow();
    }
  });
});
