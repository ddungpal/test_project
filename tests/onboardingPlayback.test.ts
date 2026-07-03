// 쏙이 아크 인터랙티브 재생 순수 로직 단위 테스트 — DOM·서버·컴포넌트 무관(순수 함수만).
//   ★ 컴포넌트 import 금지(vitest @/ alias 없음 함정) — src/lib/onboarding/playback.ts만 물린다.
//   문항 진행·공개·정오 판정·응답 누적·마지막 문항 후 answers가 ArcAnswer[]로 모임을 검증.
import { describe, it, expect } from "vitest";
import type { ArcQuestion, OnboardingArc } from "../src/agents/onboarder/schema.js";
import type { ArcAnswer } from "../src/lib/onboarding/arc.js";
import {
  initPlayback,
  restorePlayback,
  currentQuestion,
  totalQuestions,
  isLast,
  isRevealed,
  isCorrect,
  chooseAnswer,
  next,
  collectAnswers,
  isComplete,
} from "../src/lib/onboarding/playback.js";

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

// 3문항 아크 — 정답 인덱스 0/1/2.
function arc3(): OnboardingArc {
  return {
    coreAngle: "핵심 앵글",
    questions: [q({ prompt: "q1", answerIdx: 0 }), q({ prompt: "q2", answerIdx: 1 }), q({ prompt: "q3", answerIdx: 2 })],
  };
}

describe("initPlayback", () => {
  it("첫 문항·미공개·빈 응답으로 시작한다", () => {
    const s = initPlayback(arc3());
    expect(s.questionIdx).toBe(0);
    expect(isRevealed(s)).toBe(false);
    expect(collectAnswers(s)).toEqual([]);
    expect(totalQuestions(s)).toBe(3);
    expect(currentQuestion(s)?.prompt).toBe("q1");
    expect(isLast(s)).toBe(false);
  });
});

describe("restorePlayback — 새로고침 후 이력 복원", () => {
  it("응답이 없으면 처음부터(initPlayback와 동일)", () => {
    const s = restorePlayback(arc3(), []);
    expect(s.questionIdx).toBe(0);
    expect(isRevealed(s)).toBe(false);
    expect(collectAnswers(s)).toEqual([]);
  });

  it("일부만 풀었으면 다음 미답 문항에서 이어 풀고, 푼 응답은 보존한다", () => {
    const answers: ArcAnswer[] = [{ questionIdx: 0, chosenIdx: 0 }]; // q1만 풀었음
    const s = restorePlayback(arc3(), answers);
    expect(s.questionIdx).toBe(1); // q2로 이어감
    expect(isRevealed(s)).toBe(false);
    expect(collectAnswers(s)).toEqual(answers); // 이력 유지
    expect(isComplete(s)).toBe(false);
  });

  it("다 풀었으면 마지막 문항 공개 상태(제출 가능)로 복원한다", () => {
    const answers: ArcAnswer[] = [
      { questionIdx: 0, chosenIdx: 0 },
      { questionIdx: 1, chosenIdx: 1 },
      { questionIdx: 2, chosenIdx: 2 },
    ];
    const s = restorePlayback(arc3(), answers);
    expect(s.questionIdx).toBe(2);
    expect(isComplete(s)).toBe(true); // 제출 버튼 노출 조건
    expect(collectAnswers(s)).toEqual(answers);
  });

  it("범위 밖 응답(아크 축소 등)은 방어적으로 버린다", () => {
    const answers: ArcAnswer[] = [{ questionIdx: 0, chosenIdx: 0 }, { questionIdx: 9, chosenIdx: 1 }];
    const s = restorePlayback(arc3(), answers);
    expect(collectAnswers(s)).toEqual([{ questionIdx: 0, chosenIdx: 0 }]);
  });
});

describe("chooseAnswer — 공개 + 응답 누적", () => {
  it("찍으면 reveal이 켜지고 응답이 누적된다", () => {
    const s0 = initPlayback(arc3());
    const s1 = chooseAnswer(s0, 2); // q1(정답0)에 2 찍음(오답)
    expect(isRevealed(s1)).toBe(true);
    expect(collectAnswers(s1)).toEqual([{ questionIdx: 0, chosenIdx: 2 }]);
  });

  it("입력 상태를 변형하지 않는다(순수)", () => {
    const s0 = initPlayback(arc3());
    chooseAnswer(s0, 1);
    expect(isRevealed(s0)).toBe(false);
    expect(collectAnswers(s0)).toEqual([]);
  });

  it("이미 공개된 뒤 다시 찍어도 재누적하지 않는다(멱등)", () => {
    const s1 = chooseAnswer(initPlayback(arc3()), 0);
    const s2 = chooseAnswer(s1, 1); // 중복 클릭
    expect(collectAnswers(s2)).toHaveLength(1);
    expect(collectAnswers(s2)).toEqual([{ questionIdx: 0, chosenIdx: 0 }]);
  });
});

describe("isCorrect — 정오 판정(chosenIdx === answerIdx)", () => {
  it("정답 인덱스면 true, 아니면 false", () => {
    const s = initPlayback(arc3()); // q1 정답 0
    expect(isCorrect(s, 0)).toBe(true);
    expect(isCorrect(s, 1)).toBe(false);
    expect(isCorrect(s, 2)).toBe(false);
  });
});

describe("next — 다음 문항으로 진행", () => {
  it("찍기 전엔 넘어가지 않는다", () => {
    const s0 = initPlayback(arc3());
    const s1 = next(s0);
    expect(s1.questionIdx).toBe(0);
  });

  it("찍은 뒤 next면 다음 문항·reveal off", () => {
    const s1 = chooseAnswer(initPlayback(arc3()), 0);
    const s2 = next(s1);
    expect(s2.questionIdx).toBe(1);
    expect(isRevealed(s2)).toBe(false);
    expect(currentQuestion(s2)?.prompt).toBe("q2");
  });

  it("마지막 문항에서는 next로 끝을 넘어가지 않는다", () => {
    let s = initPlayback(arc3());
    s = next(chooseAnswer(s, 0)); // → q2
    s = next(chooseAnswer(s, 1)); // → q3(마지막)
    expect(isLast(s)).toBe(true);
    const after = next(chooseAnswer(s, 2));
    expect(after.questionIdx).toBe(2); // 넘어가지 않음
  });
});

describe("전체 아크 재생 → collectAnswers가 ArcAnswer[]로 모인다", () => {
  it("세 문항을 모두 답하면 응답 3개가 순서대로 모이고 isComplete가 true", () => {
    let s = initPlayback(arc3());
    s = chooseAnswer(s, 0); // q1 정답
    s = next(s);
    s = chooseAnswer(s, 0); // q2 오답(정답1)
    s = next(s);
    s = chooseAnswer(s, 2); // q3 정답

    const answers: ArcAnswer[] = collectAnswers(s);
    expect(answers).toEqual([
      { questionIdx: 0, chosenIdx: 0 },
      { questionIdx: 1, chosenIdx: 0 },
      { questionIdx: 2, chosenIdx: 2 },
    ]);
    expect(isComplete(s)).toBe(true);
  });

  it("마지막 전까지는 isComplete가 false", () => {
    let s = initPlayback(arc3());
    s = next(chooseAnswer(s, 0)); // q2로
    expect(isComplete(s)).toBe(false);
  });
});

describe("빈 아크 방어(throw 0)", () => {
  it("문항 0개면 currentQuestion null·isLast false·isComplete false", () => {
    const empty: OnboardingArc = { coreAngle: "", questions: [] };
    const s = initPlayback(empty);
    expect(currentQuestion(s)).toBeNull();
    expect(isLast(s)).toBe(false);
    expect(isComplete(s)).toBe(false);
    expect(isCorrect(s, 0)).toBe(false);
    // 문항 없이 찍어도 크래시 없이 reveal만 켜짐(응답 미누적)
    const s1 = chooseAnswer(s, 0);
    expect(isRevealed(s1)).toBe(true);
    expect(collectAnswers(s1)).toEqual([]);
  });
});
