// 쏙이 온보딩 순수 헬퍼 단위 테스트 — DOM·서버 무관(순수 함수).
//   normalizeArc(LLM 원출력 방어) / inferLevel(수준 추론) / extractGold(금맥 추출).
import { describe, it, expect } from "vitest";
import { normalizeArc, type ArcQuestion, type OnboardingArc } from "../src/agents/onboarder/schema.js";
import { inferLevel, extractGold, type ArcAnswer } from "../src/lib/onboarding/arc.js";

// 정상 문항 팩토리(override로 필드 조정).
function q(over: Partial<ArcQuestion> = {}): ArcQuestion {
  return {
    prompt: "질문?",
    choices: ["A", "B", "C"],
    answerIdx: 0,
    difficulty: "mid",
    hookMode: "reversal",
    ahaReveal: "사실은 이렇다",
    ...over,
  };
}

describe("normalizeArc", () => {
  it("정상 아크는 그대로 통과한다", () => {
    const raw = {
      coreAngle: "핵심 앵글",
      questions: [
        { prompt: "p1", choices: ["a", "b"], answerIdx: 1, difficulty: "basic", hookMode: "practical", ahaReveal: "aha1" },
        { prompt: "p2", choices: ["a", "b", "c"], answerIdx: 2, difficulty: "deep", hookMode: "reversal", ahaReveal: "aha2" },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc).not.toBeNull();
    expect(arc!.coreAngle).toBe("핵심 앵글");
    expect(arc!.questions).toHaveLength(2);
    expect(arc!.questions[0]!.answerIdx).toBe(1);
  });

  it("questions가 1개 미만이면 null 드랍", () => {
    expect(normalizeArc({ coreAngle: "x", questions: [] })).toBeNull();
    expect(normalizeArc({ coreAngle: "x" })).toBeNull();
    expect(normalizeArc(null)).toBeNull();
    expect(normalizeArc("nope")).toBeNull();
  });

  it("answerIdx가 choices 범위 밖인 문항은 드랍", () => {
    const raw = {
      coreAngle: "x",
      questions: [
        { prompt: "ok", choices: ["a", "b"], answerIdx: 0, difficulty: "mid", hookMode: "reversal", ahaReveal: "r" },
        { prompt: "bad", choices: ["a", "b"], answerIdx: 5, difficulty: "mid", hookMode: "reversal", ahaReveal: "r" },
        { prompt: "neg", choices: ["a", "b"], answerIdx: -1, difficulty: "mid", hookMode: "reversal", ahaReveal: "r" },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc!.questions).toHaveLength(1);
    expect(arc!.questions[0]!.prompt).toBe("ok");
  });

  it("difficulty/hookMode가 enum 아닌 문항은 드랍", () => {
    const raw = {
      coreAngle: "x",
      questions: [
        { prompt: "ok", choices: ["a", "b"], answerIdx: 0, difficulty: "deep", hookMode: "practical", ahaReveal: "r" },
        { prompt: "baddiff", choices: ["a", "b"], answerIdx: 0, difficulty: "extreme", hookMode: "practical", ahaReveal: "r" },
        { prompt: "badhook", choices: ["a", "b"], answerIdx: 0, difficulty: "deep", hookMode: "sneaky", ahaReveal: "r" },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc!.questions).toHaveLength(1);
    expect(arc!.questions[0]!.prompt).toBe("ok");
  });

  it("choices가 2개 미만인 문항은 드랍", () => {
    const raw = {
      coreAngle: "x",
      questions: [
        { prompt: "ok", choices: ["a", "b"], answerIdx: 0, difficulty: "mid", hookMode: "reversal", ahaReveal: "r" },
        { prompt: "solo", choices: ["a"], answerIdx: 0, difficulty: "mid", hookMode: "reversal", ahaReveal: "r" },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc!.questions).toHaveLength(1);
    expect(arc!.questions[0]!.prompt).toBe("ok");
  });

  it("stray 필드는 명시선택으로 버리고, coreAngle 없으면 ''", () => {
    const raw = {
      questions: [
        { prompt: "p", choices: ["a", "b"], answerIdx: 0, difficulty: "mid", hookMode: "reversal", ahaReveal: "r", junk: 123 },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc!.coreAngle).toBe("");
    expect(arc!.questions[0]!).not.toHaveProperty("junk");
  });

  it("옵셔널 unverifiedNumbers·cliffhanger 보존(있을 때만)", () => {
    const raw = {
      coreAngle: "x",
      questions: [
        {
          prompt: "p",
          choices: ["a", "b"],
          answerIdx: 0,
          difficulty: "deep",
          hookMode: "reversal",
          ahaReveal: "r",
          unverifiedNumbers: ["연 7%", "3개월"],
          cliffhanger: "그런데 여기서 반전이",
        },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc!.questions[0]!.unverifiedNumbers).toEqual(["연 7%", "3개월"]);
    expect(arc!.questions[0]!.cliffhanger).toBe("그런데 여기서 반전이");
  });

  it("throw 하지 않는다(잘못된 형태 입력에도)", () => {
    expect(() => normalizeArc(undefined)).not.toThrow();
    expect(() => normalizeArc({ questions: "not-array" })).not.toThrow();
    expect(() => normalizeArc({ questions: [null, 42, "str"] })).not.toThrow();
  });
});

describe("inferLevel", () => {
  it("deep 문항 다 맞히면 상위 수준(advanced)", () => {
    const arc: OnboardingArc = {
      coreAngle: "x",
      questions: [
        q({ difficulty: "deep", answerIdx: 0 }),
        q({ difficulty: "deep", answerIdx: 1 }),
      ],
    };
    const answers: ArcAnswer[] = [
      { questionIdx: 0, chosenIdx: 0 },
      { questionIdx: 1, chosenIdx: 1 },
    ];
    expect(inferLevel(arc, answers)).toBe("advanced");
  });

  it("basic 문항을 틀리면 하위 수준(beginner)", () => {
    const arc: OnboardingArc = {
      coreAngle: "x",
      questions: [q({ difficulty: "basic", answerIdx: 0 })],
    };
    const answers: ArcAnswer[] = [{ questionIdx: 0, chosenIdx: 1 }];
    expect(inferLevel(arc, answers)).toBe("beginner");
  });

  it("응답 0이면 중립값(novice) 반환·크래시 0", () => {
    const arc: OnboardingArc = {
      coreAngle: "x",
      questions: [q({ difficulty: "deep" })],
    };
    expect(inferLevel(arc, [])).toBe("novice");
  });

  it("빈 아크·빈 응답도 안전(중립)", () => {
    expect(inferLevel({ coreAngle: "", questions: [] }, [])).toBe("novice");
  });

  it("deep 절반 맞히면 중급(intermediate)", () => {
    const arc: OnboardingArc = {
      coreAngle: "x",
      questions: [
        q({ difficulty: "deep", answerIdx: 0 }),
        q({ difficulty: "deep", answerIdx: 0 }),
      ],
    };
    const answers: ArcAnswer[] = [
      { questionIdx: 0, chosenIdx: 0 }, // 맞음
      { questionIdx: 1, chosenIdx: 1 }, // 틀림
    ];
    expect(inferLevel(arc, answers)).toBe("intermediate");
  });

  it("범위 밖 questionIdx 응답은 무시(방어)", () => {
    const arc: OnboardingArc = {
      coreAngle: "x",
      questions: [q({ difficulty: "deep", answerIdx: 0 })],
    };
    const answers: ArcAnswer[] = [{ questionIdx: 99, chosenIdx: 0 }];
    expect(inferLevel(arc, answers)).toBe("novice"); // 유효 응답 0 → 중립
  });
});

describe("extractGold", () => {
  it("틀린 문항의 prompt가 confusionPoints에 들어간다", () => {
    const arc: OnboardingArc = {
      coreAngle: "이게 핵심 앵글",
      questions: [
        q({ prompt: "쉬운 질문", answerIdx: 0, ahaReveal: "aha-easy" }),
        q({ prompt: "헷갈리는 질문", answerIdx: 1, ahaReveal: "aha-hard" }),
      ],
    };
    const answers: ArcAnswer[] = [
      { questionIdx: 0, chosenIdx: 0 }, // 맞음
      { questionIdx: 1, chosenIdx: 0 }, // 틀림
    ];
    const gold = extractGold(arc, answers);
    expect(gold.confusionPoints).toEqual(["헷갈리는 질문"]);
    expect(gold.ahaPoints).toEqual(["aha-hard"]);
  });

  it("coreAngle을 그대로 보존한다", () => {
    const arc: OnboardingArc = {
      coreAngle: "보존되는 앵글",
      questions: [q()],
    };
    const gold = extractGold(arc, [{ questionIdx: 0, chosenIdx: 0 }]);
    expect(gold.coreAngle).toBe("보존되는 앵글");
  });

  it("빈 응답에도 안전(confusion/aha 빈 배열, coreAngle 보존, level은 inferLevel)", () => {
    const arc: OnboardingArc = {
      coreAngle: "앵글 유지",
      questions: [q()],
    };
    const gold = extractGold(arc, []);
    expect(gold.confusionPoints).toEqual([]);
    expect(gold.ahaPoints).toEqual([]);
    expect(gold.coreAngle).toBe("앵글 유지");
    expect(gold.calibratedLevel).toBe("novice");
  });

  it("calibratedLevel은 inferLevel과 일치한다", () => {
    const arc: OnboardingArc = {
      coreAngle: "x",
      questions: [q({ difficulty: "basic", answerIdx: 0 })],
    };
    const answers: ArcAnswer[] = [{ questionIdx: 0, chosenIdx: 1 }]; // basic 틀림
    const gold = extractGold(arc, answers);
    expect(gold.calibratedLevel).toBe("beginner");
    expect(gold.calibratedLevel).toBe(inferLevel(arc, answers));
  });

  it("throw 하지 않는다", () => {
    const arc: OnboardingArc = { coreAngle: "x", questions: [q()] };
    expect(() => extractGold(arc, [{ questionIdx: 99, chosenIdx: 0 }])).not.toThrow();
  });
});
