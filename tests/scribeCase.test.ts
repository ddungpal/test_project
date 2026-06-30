// 짠펜 case 자산 연결(case-branching step2) — money 게이트·assetsInput 빌드·end-to-end.
//   핵심: ① 게이트(isAssetUsable)가 case를 normalizeCaseAsset 유효성으로 통과/드랍,
//        ② buildAssetsInput이 case엔 payload를 포함하고 number/analogy는 기존 모양(payload 미포함) 유지,
//        ③ end-to-end: case 자산 → kind:"case" payload(검증 분기 옮김, grounded=false outcome은 "확인 필요") → normalizeSegmentPayload 통과·적재 가능.
//   순수 헬퍼만 테스트(scriptCell이 이 헬퍼를 쓰므로 동작이 못박힌다). fake supa 불필요. scribeComparison.test.ts 미러.

import { describe, expect, it } from "vitest";
import {
  isAssetUsable,
  buildAssetsInput,
  type AssetRowForScribe,
} from "../src/pipeline/comparisonAsset.js";
import { normalizeCaseAsset } from "../src/pipeline/caseAsset.js";
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

const validCasePayload = {
  intro: "월급 형태에 따라 저축 전략이 달라져요",
  branches: [
    { condition: "월급이 일정하면", outcome: "자동이체로 선저축", grounded: true },
    { condition: "수입이 불규칙하면", outcome: "들어올 때마다 비율로 저축", grounded: false },
  ],
};

describe("isAssetUsable — money 게이트(검증된 자산만 대본에)", () => {
  it("case는 normalizeCaseAsset 유효(non-null)일 때만 통과", () => {
    expect(isAssetUsable(row({ kind: "case", payload: validCasePayload }))).toBe(true);
  });

  it("case이지만 구조가 깨진(분기 1개) payload는 드랍한다 — 깨진 케이스 대본 박제 금지", () => {
    const broken = { branches: [{ condition: "하나뿐", outcome: "결과", grounded: true }] };
    expect(isAssetUsable(row({ kind: "case", payload: broken }))).toBe(false);
  });

  it("case payload가 null/undefined면 드랍한다", () => {
    expect(isAssetUsable(row({ kind: "case", payload: null }))).toBe(false);
    expect(isAssetUsable(row({ kind: "case", payload: undefined }))).toBe(false);
  });

  it("기존 분기(number/analogy/comparison)는 불변 — case 추가가 회귀 없음", () => {
    expect(isAssetUsable(row({ kind: "number", math_verified: true }))).toBe(true);
    expect(isAssetUsable(row({ kind: "number", math_verified: false }))).toBe(false);
    expect(isAssetUsable(row({ kind: "analogy", distortion_checked: true }))).toBe(true);
    expect(isAssetUsable(row({ kind: "mystery" }))).toBe(false);
  });
});

describe("buildAssetsInput — 게이트 통과분만, case에 payload 포함", () => {
  it("case 자산은 정규화된 payload(branches+grounded)를 함께 전달한다", () => {
    const out = buildAssetsInput([row({ kind: "case", concept: "저축전략", payload: validCasePayload })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("case");
    expect(out[0]!.payload).toEqual(normalizeCaseAsset(validCasePayload));
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
      row({ kind: "case", concept: "통과C", payload: validCasePayload }),
    ]);
    expect(out.map((a) => a.concept)).toEqual(["통과A", "통과C"]);
    expect(out.map((a) => a.idx)).toEqual([0, 1]);
  });

  it("드랍될 case(깨진 payload — 분기<2)는 입력에 안 들어간다", () => {
    const out = buildAssetsInput([row({ kind: "case", payload: { branches: [{ condition: "x", outcome: "y", grounded: true }] } })]);
    expect(out).toHaveLength(0);
  });
});

describe("end-to-end — case 자산 → kind:\"case\" payload → normalizeSegmentPayload 통과(적재 가능)", () => {
  it("grounded 분기는 outcome 그대로, grounded=false 분기는 outcome을 '확인 필요'로 둔 케이스가 적재 가능한 case로 정규화된다", () => {
    // step2 SCRIBE_SYSTEM 지침대로 짠펜이 만들 case 세그먼트를 재현.
    //   ⚠ 자산 payload는 {condition,outcome,grounded}, 세그먼트 payload는 {condition,outcome} —
    //     grounded는 outcome 텍스트에 "확인 필요"로 반영하고 세그먼트엔 condition/outcome만 남는다.
    const ca = normalizeCaseAsset(validCasePayload)!;
    expect(ca).not.toBeNull();

    const branches = ca.branches.map((b) => ({
      condition: b.condition,
      // grounded=false면 단정 금지 → outcome을 '확인 필요'로(money-safety). grounded=true면 그대로 옮김.
      outcome: b.grounded ? b.outcome : `${b.outcome} (확인 필요)`,
    }));
    const casePayload = { intro: ca.intro, branches };

    const normalized = normalizeSegmentPayload("case", casePayload);
    expect(normalized).toEqual({
      kind: "case",
      payload: {
        intro: "월급 형태에 따라 저축 전략이 달라져요",
        branches: [
          { condition: "월급이 일정하면", outcome: "자동이체로 선저축" }, // grounded=true → outcome 그대로
          { condition: "수입이 불규칙하면", outcome: "들어올 때마다 비율로 저축 (확인 필요)" }, // grounded=false → 확인 필요
        ],
      },
    });
    // 세그먼트 payload엔 grounded 키가 없어야 한다(자산→세그먼트 변환에서 떨어져 나감).
    for (const b of (normalized.payload as { branches: Record<string, unknown>[] }).branches) {
      expect("grounded" in b).toBe(false);
    }
  });
});
