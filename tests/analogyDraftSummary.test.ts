// analogyDraftSummary — 비유 draft patterns(jsonb) → 표시용 요약 라인.
//   빈/깨진 입력 방어 + 정상 입력 라인 생성 + 빈 배열 필드 생략을 검증(순수 함수·$0).
import { describe, it, expect } from "vitest";
import { analogyDraftSummary } from "../src/lib/learning/analogyDraftSummary.js";

describe("analogyDraftSummary", () => {
  it("빈/비객체/배열 입력은 [] 를 반환(방어)", () => {
    expect(analogyDraftSummary(null)).toEqual([]);
    expect(analogyDraftSummary(undefined)).toEqual([]);
    expect(analogyDraftSummary({})).toEqual([]);
    expect(analogyDraftSummary("text")).toEqual([]);
    expect(analogyDraftSummary(42)).toEqual([]);
    expect(analogyDraftSummary([1, 2, 3])).toEqual([]);
  });

  it("정상 patterns 는 각 필드를 요약 라인으로 만든다", () => {
    const lines = analogyDraftSummary({
      techniques: ["a", "b", "c"],
      target_domains: ["음식", "몸"],
      do: ["규모 변화를 동작으로"],
      banned: ["또 다른 전문용어로 비유"],
      distortion_guard: "쉽게 만들려다 사실 왜곡 금지",
      confidence: "high",
    });
    expect(lines).toContain("기법 3개");
    expect(lines).toContain("친숙 영역 2개");
    expect(lines).toContain("장치 1개");
    expect(lines).toContain("금지 1개");
    expect(lines).toContain("왜곡 가드 ✓");
    expect(lines).toContain("신뢰도: high");
  });

  it("빈 배열/누락 필드는 라인을 생략한다", () => {
    const lines = analogyDraftSummary({
      techniques: ["단 하나"],
      target_domains: [], // 빈 배열 → 생략
      do: [], // 빈 배열 → 생략
      banned: [], // 빈 배열 → 생략
      distortion_guard: "가드", // 있으므로 라인
      // confidence 누락 → 생략
    });
    expect(lines).toEqual(["기법 1개", "왜곡 가드 ✓"]);
  });

  it("distortion_guard 가 빈 문자열/공백이면 가드 라인을 생략한다", () => {
    expect(analogyDraftSummary({ distortion_guard: "" })).toEqual([]);
    expect(analogyDraftSummary({ distortion_guard: "   " })).toEqual([]);
  });

  it("배열이 아닌 값(잘못된 타입)은 무시한다(방어)", () => {
    const lines = analogyDraftSummary({
      techniques: "문자열이면 안됨",
      target_domains: 5,
      distortion_guard: "가드",
    });
    expect(lines).toEqual(["왜곡 가드 ✓"]);
  });

  it("배열 안의 비문자열/빈문자열은 개수에서 제외한다", () => {
    const lines = analogyDraftSummary({
      techniques: ["유효", "", "  ", 123, null],
    });
    expect(lines).toEqual(["기법 1개"]);
  });
});
