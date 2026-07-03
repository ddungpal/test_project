// 쏙이 문항 정답 위치 분산 — shuffleChoices(결정적 셔플) + normalizeArc 통합.
//   설계: docs/specs/2026-07-03-onboarding-question-quality-design.md "Step 0".
//   순수 함수 대상 — 스텁·DOM·서버 무관.
import { describe, it, expect } from "vitest";
import { shuffleChoices } from "../src/lib/onboarding/shuffle.js";
import { normalizeArc, type ArcQuestion } from "../src/agents/onboarder/schema.js";

// 정상 문항 팩토리(override로 필드 조정).
function q(over: Partial<ArcQuestion> = {}): ArcQuestion {
  return {
    prompt: "질문?",
    choices: ["A", "B", "C", "D"],
    answerIdx: 0,
    difficulty: "mid",
    hookMode: "reversal",
    ahaReveal: "사실은 이렇다",
    ...over,
  };
}

describe("shuffleChoices — 정답 내용 보존", () => {
  it("셔플 후 choices[answerIdx]가 원래 정답 문자열과 같다(여러 문항)", () => {
    const cases: ArcQuestion[] = [
      q({ prompt: "적금?", choices: ["예금", "적금", "펀드", "ETF"], answerIdx: 1 }),
      q({ prompt: "복리?", choices: ["단리", "복리", "무이자"], answerIdx: 1 }),
      q({ prompt: "세금?", choices: ["비과세", "일반과세", "분리과세", "종합과세"], answerIdx: 3 }),
      q({ prompt: "환율?", choices: ["원화", "달러"], answerIdx: 0 }),
    ];
    for (const orig of cases) {
      const originalAnswer = orig.choices[orig.answerIdx];
      const shuffled = shuffleChoices(orig);
      expect(shuffled.choices[shuffled.answerIdx]).toBe(originalAnswer);
      // 개수·내용 집합 불변(위치만 이동)
      expect(shuffled.choices.length).toBe(orig.choices.length);
      expect([...shuffled.choices].sort()).toEqual([...orig.choices].sort());
    }
  });

  it("입력을 변형하지 않는다(새 객체 반환)", () => {
    const orig = q({ prompt: "불변?", choices: ["A", "B", "C", "D"], answerIdx: 0 });
    const beforeChoices = [...orig.choices];
    const beforeIdx = orig.answerIdx;
    shuffleChoices(orig);
    expect(orig.choices).toEqual(beforeChoices);
    expect(orig.answerIdx).toBe(beforeIdx);
  });

  it("다른 필드(unverifiedNumbers·cliffhanger 등)를 전부 보존한다", () => {
    const orig = q({
      prompt: "보존?",
      choices: ["A", "B", "C"],
      answerIdx: 2,
      difficulty: "deep",
      hookMode: "practical",
      ahaReveal: "aha-보존",
      unverifiedNumbers: ["4.5%", "2026년"],
      cliffhanger: "다음 문항 클리프행어",
    });
    const shuffled = shuffleChoices(orig);
    expect(shuffled.prompt).toBe("보존?");
    expect(shuffled.difficulty).toBe("deep");
    expect(shuffled.hookMode).toBe("practical");
    expect(shuffled.ahaReveal).toBe("aha-보존");
    expect(shuffled.unverifiedNumbers).toEqual(["4.5%", "2026년"]);
    expect(shuffled.cliffhanger).toBe("다음 문항 클리프행어");
  });
});

describe("shuffleChoices — 결정적", () => {
  it("같은 문항을 두 번 셔플하면 동일 결과(deepEqual)", () => {
    const orig = q({ prompt: "결정적?", choices: ["W", "X", "Y", "Z"], answerIdx: 2 });
    const a = shuffleChoices(orig);
    const b = shuffleChoices(orig);
    expect(a).toEqual(b);
  });

  it("한 번 셔플한 결과를 다시 셔플해도(내용 시드가 바뀌므로) 정답 내용은 여전히 보존", () => {
    const orig = q({ prompt: "재셔플?", choices: ["가", "나", "다", "라"], answerIdx: 1 });
    const once = shuffleChoices(orig);
    const twice = shuffleChoices(once);
    expect(twice.choices[twice.answerIdx]).toBe("나");
  });
});

describe("shuffleChoices — 위치 분산", () => {
  it("원 raw answerIdx가 전부 0인 문항 세트를 셔플하면 answerIdx가 한 값에 고정되지 않는다", () => {
    // 서로 다른 내용(prompt·choices) → 서로 다른 시드 → 서로 다른 순열.
    const items: ArcQuestion[] = [
      q({ prompt: "문항1?", choices: ["정답1", "오답1a", "오답1b", "오답1c"], answerIdx: 0 }),
      q({ prompt: "문항2?", choices: ["정답2", "오답2a", "오답2b", "오답2c"], answerIdx: 0 }),
      q({ prompt: "문항3?", choices: ["정답3", "오답3a", "오답3b", "오답3c"], answerIdx: 0 }),
      q({ prompt: "문항4?", choices: ["정답4", "오답4a", "오답4b", "오답4c"], answerIdx: 0 }),
      q({ prompt: "문항5?", choices: ["정답5", "오답5a", "오답5b", "오답5c"], answerIdx: 0 }),
    ];
    const idxs = items.map((it) => shuffleChoices(it).answerIdx);
    // 결정적이므로 실제 실행값을 그대로 기대로 고정(회귀 검출용).
    expect(idxs).toEqual([2, 1, 2, 3, 1]);
    // 한 값에 고정되지 않음(최소 2개 이상 서로 다른 인덱스).
    expect(new Set(idxs).size).toBeGreaterThanOrEqual(2);
    // 그리고 정답 내용은 전부 보존.
    items.forEach((it, i) => {
      const s = shuffleChoices(it);
      expect(s.choices[s.answerIdx]).toBe(it.choices[0]);
      void i;
    });
  });
});

describe("shuffleChoices — 방어", () => {
  it("choices가 2개 미만이면 내용 그대로 반환한다", () => {
    const solo = q({ prompt: "단일?", choices: ["유일답"], answerIdx: 0 });
    const shuffled = shuffleChoices(solo);
    expect(shuffled.choices).toEqual(["유일답"]);
    expect(shuffled.answerIdx).toBe(0);
  });

  it("choices가 0개여도 throw하지 않는다", () => {
    const empty = q({ prompt: "빈?", choices: [], answerIdx: 0 });
    expect(() => shuffleChoices(empty)).not.toThrow();
    expect(shuffleChoices(empty).choices).toEqual([]);
  });
});

describe("normalizeArc 통합 — 저장 전 결정적 셔플", () => {
  it("원 raw questions의 answerIdx가 전부 같아도 정규화 후 정답 내용이 보존되고 위치가 섞인다", () => {
    const raw = {
      coreAngle: "핵심 앵글",
      questions: [
        { prompt: "q1?", choices: ["정답1", "오답1a", "오답1b", "오답1c"], answerIdx: 0, difficulty: "basic", hookMode: "reversal", ahaReveal: "a1" },
        { prompt: "q2?", choices: ["정답2", "오답2a", "오답2b", "오답2c"], answerIdx: 0, difficulty: "mid", hookMode: "practical", ahaReveal: "a2" },
        { prompt: "q3?", choices: ["정답3", "오답3a", "오답3b", "오답3c"], answerIdx: 0, difficulty: "deep", hookMode: "reversal", ahaReveal: "a3" },
        { prompt: "q4?", choices: ["정답4", "오답4a", "오답4b", "오답4c"], answerIdx: 0, difficulty: "deep", hookMode: "practical", ahaReveal: "a4" },
        { prompt: "q5?", choices: ["정답5", "오답5a", "오답5b", "오답5c"], answerIdx: 0, difficulty: "mid", hookMode: "reversal", ahaReveal: "a5" },
      ],
    };
    const arc = normalizeArc(raw);
    expect(arc).not.toBeNull();
    const qs = arc!.questions;
    expect(qs).toHaveLength(5);
    // 정답 내용 보존: 각 문항의 정답은 원래 첫 번째 choice("정답N").
    qs.forEach((question, i) => {
      expect(question.choices[question.answerIdx]).toBe(`정답${i + 1}`);
    });
    // 위치 분산: answerIdx가 전부 0(원래 값)에 고정되지 않음.
    const idxs = qs.map((question) => question.answerIdx);
    expect(new Set(idxs).size).toBeGreaterThanOrEqual(2);
    expect(idxs.every((n) => n === 0)).toBe(false);
  });
});
