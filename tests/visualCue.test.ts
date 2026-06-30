// P5 visual-cues: normalizeVisual의 cueType 흡수(additive·하위호환) 단위테스트.
//   기존 cue 폴백·note 흡수 로직은 불변. cueType은 4개 enum일 때만 흡수, 아니면 stray 드랍(cue/note는 유지).

import { describe, expect, it } from "vitest";
import { normalizeSegmentPayload } from "../src/pipeline/segmentBlock.js";
import type { VisualCueType } from "../src/pipeline/segmentBlock.js";

describe("normalizeVisual cueType (P5)", () => {
  it("cueType 4종 각각 흡수", () => {
    const types: VisualCueType[] = ["subtitle", "capture", "chart", "table"];
    for (const t of types) {
      expect(normalizeSegmentPayload("visual", { cue: "큐", cueType: t })).toEqual({
        kind: "visual",
        payload: { cue: "큐", cueType: t },
      });
    }
  });

  it("cueType + note 함께 흡수", () => {
    expect(
      normalizeSegmentPayload("visual", { cue: "그래프 줌인", note: "빨강 강조", cueType: "chart" }),
    ).toEqual({
      kind: "visual",
      payload: { cue: "그래프 줌인", note: "빨강 강조", cueType: "chart" },
    });
  });

  it("cueType 없는 기존 payload는 그대로 유효(하위호환)", () => {
    expect(normalizeSegmentPayload("visual", { cue: "컷" })).toEqual({
      kind: "visual",
      payload: { cue: "컷" },
    });
    expect(normalizeSegmentPayload("visual", { cue: "컷", note: "설명" })).toEqual({
      kind: "visual",
      payload: { cue: "컷", note: "설명" },
    });
  });

  it("잘못된 cueType은 무시(드랍)하되 cue/note는 유지", () => {
    // enum 밖 문자열 → cueType 제외, cue 유지.
    expect(normalizeSegmentPayload("visual", { cue: "움짤", cueType: "gif" })).toEqual({
      kind: "visual",
      payload: { cue: "움짤" },
    });
    // 비-string cueType → 제외, cue/note 유지.
    expect(normalizeSegmentPayload("visual", { cue: "컷", note: "설명", cueType: 7 })).toEqual({
      kind: "visual",
      payload: { cue: "컷", note: "설명" },
    });
    // 대소문자 다른 값도 enum 아님 → 드랍.
    expect(normalizeSegmentPayload("visual", { cue: "컷", cueType: "Subtitle" })).toEqual({
      kind: "visual",
      payload: { cue: "컷" },
    });
  });

  it("cueType이 있어도 cue 없으면 폴백(기존 규칙 불변)", () => {
    expect(normalizeSegmentPayload("visual", { cueType: "subtitle" })).toEqual({
      kind: "prose",
      payload: null,
    });
    expect(normalizeSegmentPayload("visual", { cue: "", cueType: "chart" })).toEqual({
      kind: "prose",
      payload: null,
    });
  });

  it("VisualCueType는 4개 enum으로 타입 사용 가능(export 확인)", () => {
    const sample: VisualCueType[] = ["subtitle", "capture", "chart", "table"];
    expect(sample).toHaveLength(4);
  });
});
