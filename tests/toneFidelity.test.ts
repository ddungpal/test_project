// 말투 충실도 채점(Phase D step1) 단위 테스트 — 순수·결정적(LLM·DB·시각 무관).
//   검사 대상은 '말투 특징'(banned·말투 마커)뿐. 사실(숫자·주장 진위)은 검사하지 않음을 단언한다.
import { describe, it, expect } from "vitest";
import { scoreToneFidelity } from "../src/performance/toneFidelity.js";

// tone_profile.components(jsonb) 축약 픽스처 — 검사에 쓰이는 banned·phrases·vocab.signature_words 만 채움.
const components = {
  vocab: { register: "구어체", formality: "반말", signature_words: ["짠부", "현타"], notes: "" },
  phrases: ["솔직히 말해서", "자 그래서"],
  banned: ["여러분 안녕하세요", "구독과 좋아요"],
};

describe("scoreToneFidelity — banned 검사", () => {
  it("banned 표현이 등장하면 해당 check fail, score 하락", () => {
    const text = "여러분 안녕하세요. 솔직히 말해서 오늘 주제는 현타다.";
    const r = scoreToneFidelity(text, components);
    const banned = r.checks.find((c) => c.name === "banned");
    expect(banned?.pass).toBe(false);
    expect(banned?.detail).toContain("여러분 안녕하세요");
    // 마커는 통과("솔직히 말해서"·"현타") → 2개 중 1개 통과 → 0.5
    expect(r.score).toBe(0.5);
  });

  it("banned 표현이 여러 개 등장하면 모두 detail 에 모인다", () => {
    const text = "여러분 안녕하세요. 구독과 좋아요 부탁해요.";
    const r = scoreToneFidelity(text, components);
    const banned = r.checks.find((c) => c.name === "banned");
    expect(banned?.pass).toBe(false);
    expect(banned?.detail).toContain("여러분 안녕하세요");
    expect(banned?.detail).toContain("구독과 좋아요");
  });
});

describe("scoreToneFidelity — 말투 마커 검사(느슨)", () => {
  it("banned 없고 마커 있으면 통과, score=1", () => {
    const text = "자 그래서 오늘은 현타 오는 소비 얘기를 해볼게.";
    const r = scoreToneFidelity(text, components);
    // banned 미등장 pass + 마커("자 그래서"·"현타") pass → 둘 다 통과
    expect(r.score).toBe(1);
    expect(r.checks.every((c) => c.pass)).toBe(true);
  });

  it("phrases 가 없어도 vocab.signature_words 중 1개만 있으면 마커 pass", () => {
    const onlyVocab = {
      vocab: { register: "", formality: "", signature_words: ["현타"], notes: "" },
    };
    const r = scoreToneFidelity("그건 좀 현타다.", onlyVocab);
    const markers = r.checks.find((c) => c.name === "tone_markers");
    expect(markers?.pass).toBe(true);
    expect(r.score).toBe(1);
  });

  it("마커가 하나도 없으면 tone_markers fail", () => {
    const r = scoreToneFidelity("전혀 다른 평범한 문장입니다.", components);
    const markers = r.checks.find((c) => c.name === "tone_markers");
    expect(markers?.pass).toBe(false);
    // banned 미등장 pass + 마커 fail → 0.5
    expect(r.score).toBe(0.5);
  });
});

describe("scoreToneFidelity — 빈/깨진 patterns(중립, throw 금지)", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["빈 객체", {}],
    ["배열", [1, 2, 3]],
    ["숫자", 42],
    ["문자열", "patterns"],
    ["banned·markers 가 빈 배열인 객체", { banned: [], phrases: [], vocab: { signature_words: [] } }],
    ["banned 가 비-배열", { banned: "여러분", phrases: 123 }],
  ])("%s → { score: 1, checks: [] }", (_label, patterns) => {
    expect(scoreToneFidelity("아무 텍스트", patterns)).toEqual({ score: 1, checks: [] });
  });
});

describe("scoreToneFidelity — 결정성", () => {
  it("같은 입력 2회 호출 → deep equal", () => {
    const text = "여러분 안녕하세요. 자 그래서 현타 얘기.";
    const a = scoreToneFidelity(text, components);
    const b = scoreToneFidelity(text, components);
    expect(a).toEqual(b);
  });
});

describe("scoreToneFidelity — 말투 ≠ 사실(사실은 검사하지 않음)", () => {
  it("사실 오류가 있어도 말투 마커만 맞으면 점수 영향 없음", () => {
    // '1+1=3' 은 명백한 사실 오류지만, 채점은 말투만 본다.
    const wrongFact = "자 그래서 1 더하기 1은 3이야. 진짜 현타.";
    const r = scoreToneFidelity(wrongFact, components);
    expect(r.score).toBe(1); // banned 미등장 + 마커 등장 → 만점
  });

  it("검사 항목에 사실 검사가 없다(name 은 banned·tone_markers 뿐)", () => {
    const r = scoreToneFidelity("자 그래서 현타다.", components);
    const names = r.checks.map((c) => c.name).sort();
    expect(names).toEqual(["banned", "tone_markers"]);
    // fact·claim·number 류 검사명이 없음을 단언.
    expect(r.checks.some((c) => /fact|claim|number|숫자|사실/i.test(c.name))).toBe(false);
  });
});
