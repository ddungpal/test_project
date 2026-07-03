// 쏙이 온보딩 term hookMode 단위 테스트 — DOM·서버 무관(순수 함수).
//   step1(term-definition-questions): hookMode='term'이 enum에 흡수되어 normalizeArc를 통과하는지.
//   isHookMode는 schema.ts 내부 함수(비-export)라 normalizeArc 통과로 간접 검증한다.
import { describe, it, expect } from "vitest";
import { normalizeArc } from "../src/agents/onboarder/schema.js";

describe("term hookMode", () => {
  it("hookMode='term' 문항은 normalizeArc를 통과하고 hookMode를 보존한다", () => {
    const raw = {
      coreAngle: "핵심 앵글",
      questions: [
        {
          prompt: "'파킹통장'이 정확히 뭘까?",
          choices: ["수시입출금 고금리 통장", "주차비 자동납부 통장", "예금만 되는 통장"],
          answerIdx: 0,
          difficulty: "basic",
          hookMode: "term",
          ahaReveal: "언제든 넣고 빼도 이자가 붙는 통장이다",
        },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc).not.toBeNull();
    expect(arc!.questions).toHaveLength(1);
    expect(arc!.questions[0]!.hookMode).toBe("term");
    // 셔플이 적용돼도 정답 내용은 보존된다(위치만 이동).
    expect(arc!.questions[0]!.choices[arc!.questions[0]!.answerIdx]).toBe("수시입출금 고금리 통장");
  });

  it("세 hookMode(reversal/practical/term)가 나란히 통과한다", () => {
    const raw = {
      coreAngle: "x",
      questions: [
        { prompt: "p1", choices: ["a", "b"], answerIdx: 0, difficulty: "mid", hookMode: "reversal", ahaReveal: "r1" },
        { prompt: "p2", choices: ["a", "b"], answerIdx: 1, difficulty: "mid", hookMode: "practical", ahaReveal: "r2" },
        { prompt: "p3", choices: ["a", "b"], answerIdx: 0, difficulty: "mid", hookMode: "term", ahaReveal: "r3" },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc!.questions).toHaveLength(3);
    expect(arc!.questions.map((x) => x.hookMode)).toEqual(["reversal", "practical", "term"]);
  });

  it("여전히 알 수 없는 hookMode 문항은 드랍한다(enum 흡수 범위 밖)", () => {
    const raw = {
      coreAngle: "x",
      questions: [
        { prompt: "ok", choices: ["a", "b"], answerIdx: 0, difficulty: "mid", hookMode: "term", ahaReveal: "r" },
        { prompt: "bad", choices: ["a", "b"], answerIdx: 0, difficulty: "mid", hookMode: "definition", ahaReveal: "r" },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc!.questions).toHaveLength(1);
    expect(arc!.questions[0]!.prompt).toBe("ok");
  });
});
