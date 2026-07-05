// ownerRulesDraftSummary — 오너 피드백 규칙 draft patterns(jsonb) → 표시용 요약 라인.
//   빈/깨진 입력 방어 + 정상 입력 라인 생성 + 누락/빈 필드 생략을 검증(순수 함수·$0). analogyDraftSummary 테스트 미러.
import { describe, it, expect } from "vitest";
import { ownerRulesDraftSummary } from "../src/lib/learning/ownerRulesDraftSummary.js";

describe("ownerRulesDraftSummary", () => {
  it("빈/비객체/배열 입력은 [] 를 반환(방어)", () => {
    expect(ownerRulesDraftSummary(null)).toEqual([]);
    expect(ownerRulesDraftSummary(undefined)).toEqual([]);
    expect(ownerRulesDraftSummary({})).toEqual([]);
    expect(ownerRulesDraftSummary("text")).toEqual([]);
    expect(ownerRulesDraftSummary(42)).toEqual([]);
    expect(ownerRulesDraftSummary([1, 2, 3])).toEqual([]);
  });

  it("정상 patterns 는 규칙·근거 라인을 만든다", () => {
    const lines = ownerRulesDraftSummary({
      rules: ["제목엔 구체 수치를 포함한다", "낚시성 과장은 쓰지 않는다"],
      sources: [
        { topic: "노후", candidates: ["a", "b"], feedback: "숫자 없으면 안 눌러" },
        { candidates: ["c"], feedback: "'~하는 법'은 식상" },
      ],
    });
    expect(lines).toEqual(["규칙 2개", "근거 2건"]);
  });

  it("sources 없으면 규칙 라인만, rules 없으면 근거 라인만", () => {
    expect(ownerRulesDraftSummary({ rules: ["단 하나"] })).toEqual(["규칙 1개"]);
    expect(ownerRulesDraftSummary({ sources: [{ feedback: "x", candidates: [] }] })).toEqual(["근거 1건"]);
  });

  it("rules 가 비배열/빈배열이면 규칙 라인을 생략한다(방어)", () => {
    expect(ownerRulesDraftSummary({ rules: "문자열이면 안됨" })).toEqual([]);
    expect(ownerRulesDraftSummary({ rules: [] })).toEqual([]);
  });

  it("rules 안의 비문자열/빈문자열은 개수에서 제외한다", () => {
    expect(ownerRulesDraftSummary({ rules: ["유효", "", "  ", 123, null] })).toEqual(["규칙 1개"]);
  });

  it("sources 가 비배열이면 근거 라인을 생략한다(방어)", () => {
    expect(ownerRulesDraftSummary({ rules: ["a"], sources: "not array" })).toEqual(["규칙 1개"]);
    expect(ownerRulesDraftSummary({ rules: ["a"], sources: [] })).toEqual(["규칙 1개"]);
  });
});
