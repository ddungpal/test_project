// 짠펜 comparison 자산 연결(comparison-table step2) — money 게이트·assetsInput 빌드·end-to-end.
//   핵심: ① 게이트(isAssetUsable)가 comparison을 normalizeComparison 유효성으로 통과/드랍,
//        ② buildAssetsInput이 comparison엔 payload를 포함하고 number/analogy는 기존 모양(payload 미포함) 유지,
//        ③ end-to-end: comparison 자산 → kind:"table" payload(검증 데이터 옮김) → normalizeSegmentPayload 통과·적재 가능.
//   순수 헬퍼만 테스트(scriptCell이 이 헬퍼를 쓰므로 동작이 못박힌다). fake supa 불필요.

import { describe, expect, it } from "vitest";
import {
  isAssetUsable,
  buildAssetsInput,
  normalizeComparison,
  type AssetRowForScribe,
} from "../src/pipeline/comparisonAsset.js";
import { normalizeSegmentPayload } from "../src/pipeline/segmentBlock.js";

// 게이트/입력 빌드에 필요한 필드만 채운 자산 행 팩토리.
function row(partial: Partial<AssetRowForScribe> & { kind: string }): AssetRowForScribe {
  return {
    concept: partial.concept ?? "개념",
    kind: partial.kind,
    numeric_example: partial.numeric_example ?? null,
    analogy: partial.analogy ?? null,
    math_verified: partial.math_verified ?? null,
    distortion_checked: partial.distortion_checked ?? null,
    payload: partial.payload,
  };
}

const validComparisonPayload = {
  entities: ["청년도약계좌", "청년미래적금"],
  dimensions: ["가입조건", "금리"],
  cells: [
    { dimension: "가입조건", entity: "청년도약계좌", value: "만 19~34세", verified: true },
    { dimension: "금리", entity: "청년도약계좌", value: "연 6%", verified: true },
    { dimension: "가입조건", entity: "청년미래적금", value: "만 19~34세", verified: false },
    { dimension: "금리", entity: "청년미래적금", value: "연 5%", verified: false },
  ],
  caption: "청년 금융상품 비교",
};

describe("isAssetUsable — money 게이트(검증된 자산만 대본에)", () => {
  it("number는 math_verified===true만 통과", () => {
    expect(isAssetUsable(row({ kind: "number", math_verified: true }))).toBe(true);
    expect(isAssetUsable(row({ kind: "number", math_verified: false }))).toBe(false);
    expect(isAssetUsable(row({ kind: "number", math_verified: null }))).toBe(false);
  });

  it("analogy는 distortion_checked===true만 통과", () => {
    expect(isAssetUsable(row({ kind: "analogy", distortion_checked: true }))).toBe(true);
    expect(isAssetUsable(row({ kind: "analogy", distortion_checked: false }))).toBe(false);
    expect(isAssetUsable(row({ kind: "analogy", distortion_checked: null }))).toBe(false);
  });

  it("comparison은 normalizeComparison 유효(non-null)일 때만 통과", () => {
    expect(isAssetUsable(row({ kind: "comparison", payload: validComparisonPayload }))).toBe(true);
  });

  it("comparison이지만 구조가 깨진(entities 1개) payload는 드랍한다 — 깨진 비교 표 박제 금지", () => {
    const broken = { entities: ["하나뿐"], dimensions: ["금리"], cells: [] };
    expect(isAssetUsable(row({ kind: "comparison", payload: broken }))).toBe(false);
  });

  it("comparison payload가 null/undefined면 드랍한다", () => {
    expect(isAssetUsable(row({ kind: "comparison", payload: null }))).toBe(false);
    expect(isAssetUsable(row({ kind: "comparison", payload: undefined }))).toBe(false);
  });

  it("알 수 없는 kind는 드랍한다(보수적)", () => {
    expect(isAssetUsable(row({ kind: "mystery" }))).toBe(false);
  });
});

describe("buildAssetsInput — 게이트 통과분만, comparison에 payload 포함", () => {
  it("comparison 자산은 정규화된 payload(entities/dimensions/cells)를 함께 전달한다", () => {
    const out = buildAssetsInput([row({ kind: "comparison", concept: "청년상품", payload: validComparisonPayload })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("comparison");
    expect(out[0]!.payload).toEqual(normalizeComparison(validComparisonPayload));
  });

  it("number/analogy-only 입력에선 기존 모양 그대로 — payload 키가 없다(promptHash 영향 최소)", () => {
    const out = buildAssetsInput([
      row({ kind: "number", concept: "복리", numeric_example: "월 10만원 30년 = 약 1억", math_verified: true }),
      row({ kind: "analogy", concept: "분산투자", analogy: "계란을 한 바구니에", distortion_checked: true }),
    ]);
    expect(out).toEqual([
      { idx: 0, concept: "복리", kind: "number", numeric_example: "월 10만원 30년 = 약 1억", analogy: null },
      { idx: 1, concept: "분산투자", kind: "analogy", numeric_example: null, analogy: "계란을 한 바구니에" },
    ]);
    // payload 키 자체가 없어야 한다(기존 입력 바이트 보존).
    expect("payload" in out[0]!).toBe(false);
    expect("payload" in out[1]!).toBe(false);
  });

  it("게이트에서 드랍된 자산은 입력에서 빠지고, idx는 통과 순서로 재부여된다(lineage 인덱스 일치)", () => {
    const out = buildAssetsInput([
      row({ kind: "number", concept: "통과A", numeric_example: "x", math_verified: true }),
      row({ kind: "number", concept: "드랍", math_verified: false }), // 게이트 탈락
      row({ kind: "comparison", concept: "통과C", payload: validComparisonPayload }),
    ]);
    expect(out.map((a) => a.concept)).toEqual(["통과A", "통과C"]);
    expect(out.map((a) => a.idx)).toEqual([0, 1]);
  });

  it("드랍될 comparison(깨진 payload)은 입력에 안 들어간다", () => {
    const out = buildAssetsInput([row({ kind: "comparison", payload: { entities: ["x"], dimensions: [], cells: [] } })]);
    expect(out).toHaveLength(0);
  });
});

describe("end-to-end — comparison 자산 → kind:\"table\" payload → normalizeSegmentPayload 통과(적재 가능)", () => {
  it("검증된 cell은 값을 옮기고 verified=false 칸은 '확인 필요'로 둔 표가 적재 가능한 table로 정규화된다", () => {
    // step2 SCRIBE_SYSTEM 지침대로 짠펜이 만들 표를 재현: columns=[대상열, ...dimensions], rows=entity별.
    const cp = normalizeComparison(validComparisonPayload)!;
    expect(cp).not.toBeNull();

    // verified=false 칸은 '확인 필요'로(money-safety). 검증 칸은 cell.value 그대로.
    const valueOf = (entity: string, dim: string) => {
      const cell = cp.cells.find((c) => c.entity === entity && c.dimension === dim);
      if (!cell) return "확인 필요";
      return cell.verified ? cell.value : "확인 필요";
    };
    const columns = ["상품", ...cp.dimensions];
    const rows = cp.entities.map((e) => [e, ...cp.dimensions.map((d) => valueOf(e, d))]);
    const tablePayload = { columns, rows, caption: cp.caption };

    const normalized = normalizeSegmentPayload("table", tablePayload);
    expect(normalized).toEqual({
      kind: "table",
      payload: {
        columns: ["상품", "가입조건", "금리"],
        rows: [
          ["청년도약계좌", "만 19~34세", "연 6%"], // 둘 다 verified=true → 값 그대로
          ["청년미래적금", "확인 필요", "확인 필요"], // 둘 다 verified=false → 확인 필요
        ],
        caption: "청년 금융상품 비교",
      },
    });
  });
});
