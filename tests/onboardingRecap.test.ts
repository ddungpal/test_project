// 쏙이 완료화면 풀이 복습 조인·집계 순수 로직 단위 테스트 — DOM·서버·컴포넌트 무관(순수 함수만).
//   ★ 컴포넌트 import 금지(vitest @/ alias 없음 함정) — src/lib/onboarding/recap.ts만 물린다.
//   buildRecap: 정답/오답/미응답 매칭·문항 순서 유지·추가문제(questionIdx 확장) 케이스.
//   recapScore: 섞인 행에서 correct/total 정확.
import { describe, it, expect } from "vitest";
import type { ArcQuestion, OnboardingArc } from "../src/agents/onboarder/schema.js";
import type { ArcAnswer } from "../src/lib/onboarding/arc.js";
import { buildRecap, recapScore, type RecapRow } from "../src/lib/onboarding/recap.js";

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

describe("buildRecap — arc.questions + answers 조인", () => {
  it("정답 문항은 correct true·chosenIdx 보존", () => {
    const rows = buildRecap(arc3(), [{ questionIdx: 0, chosenIdx: 0 }]);
    expect(rows[0]!.correct).toBe(true);
    expect(rows[0]!.chosenIdx).toBe(0);
    expect(rows[0]!.question.prompt).toBe("q1");
  });

  it("오답 문항은 correct false·chosenIdx는 고른 값 보존", () => {
    const rows = buildRecap(arc3(), [{ questionIdx: 1, chosenIdx: 2 }]); // q2 정답1, 고른건 2
    expect(rows[1]!.correct).toBe(false);
    expect(rows[1]!.chosenIdx).toBe(2);
  });

  it("미응답 문항은 chosenIdx null·correct false", () => {
    const rows = buildRecap(arc3(), [{ questionIdx: 0, chosenIdx: 0 }]); // q2·q3 미응답
    expect(rows[1]!.chosenIdx).toBeNull();
    expect(rows[1]!.correct).toBe(false);
    expect(rows[2]!.chosenIdx).toBeNull();
    expect(rows[2]!.correct).toBe(false);
  });

  it("행은 arc.questions 순서를 그대로 유지한다(응답 순서 무관)", () => {
    const rows = buildRecap(arc3(), [
      { questionIdx: 2, chosenIdx: 2 },
      { questionIdx: 0, chosenIdx: 0 },
      { questionIdx: 1, chosenIdx: 1 },
    ]);
    expect(rows.map((r) => r.question.prompt)).toEqual(["q1", "q2", "q3"]);
    expect(rows.map((r) => r.correct)).toEqual([true, true, true]);
  });

  it("같은 questionIdx가 여러 개면 마지막 응답을 쓴다(방어)", () => {
    const rows = buildRecap(arc3(), [
      { questionIdx: 0, chosenIdx: 1 }, // 먼저 오답
      { questionIdx: 0, chosenIdx: 0 }, // 나중 정답 — 이걸 채택
    ]);
    expect(rows[0]!.chosenIdx).toBe(0);
    expect(rows[0]!.correct).toBe(true);
  });

  it("추가 문제로 questionIdx가 0..N으로 늘어난 경우도 순서대로 조인", () => {
    // 5문항 아크(추가 문제 포함) — 정답 인덱스 0/1/2/0/1.
    const arc5: OnboardingArc = {
      coreAngle: "확장 앵글",
      questions: [
        q({ prompt: "q1", answerIdx: 0 }),
        q({ prompt: "q2", answerIdx: 1 }),
        q({ prompt: "q3", answerIdx: 2 }),
        q({ prompt: "q4", answerIdx: 0 }),
        q({ prompt: "q5", answerIdx: 1 }),
      ],
    };
    const answers: ArcAnswer[] = [
      { questionIdx: 0, chosenIdx: 0 }, // 정답
      { questionIdx: 1, chosenIdx: 0 }, // 오답
      { questionIdx: 2, chosenIdx: 2 }, // 정답
      { questionIdx: 3, chosenIdx: 0 }, // 정답
      { questionIdx: 4, chosenIdx: 2 }, // 오답
    ];
    const rows = buildRecap(arc5, answers);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.question.prompt)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(rows.map((r) => r.correct)).toEqual([true, false, true, true, false]);
    expect(rows.map((r) => r.chosenIdx)).toEqual([0, 0, 2, 0, 2]);
  });

  it("범위 밖 chosenIdx/answerIdx여도 throw 없이 === 비교 결과대로", () => {
    const rows = buildRecap(arc3(), [{ questionIdx: 0, chosenIdx: 99 }]);
    expect(rows[0]!.chosenIdx).toBe(99);
    expect(rows[0]!.correct).toBe(false); // 99 !== 0
  });

  it("빈 아크는 빈 배열(throw 0)", () => {
    const empty: OnboardingArc = { coreAngle: "", questions: [] };
    expect(buildRecap(empty, [])).toEqual([]);
  });

  it("입력 answers를 변형하지 않는다(순수)", () => {
    const answers: ArcAnswer[] = [{ questionIdx: 0, chosenIdx: 0 }];
    buildRecap(arc3(), answers);
    expect(answers).toEqual([{ questionIdx: 0, chosenIdx: 0 }]);
  });
});

describe("recapScore — correct/total 집계", () => {
  it("섞인 행에서 correct 수·total(= 행 수) 정확", () => {
    const rows = buildRecap(arc3(), [
      { questionIdx: 0, chosenIdx: 0 }, // 정답
      { questionIdx: 1, chosenIdx: 0 }, // 오답
      // q3 미응답
    ]);
    expect(recapScore(rows)).toEqual({ correct: 1, total: 3 });
  });

  it("total은 arc.questions.length(전체 문항 기준·미응답 포함)", () => {
    const rows = buildRecap(arc3(), []); // 전부 미응답
    expect(recapScore(rows)).toEqual({ correct: 0, total: 3 });
  });

  it("전부 정답이면 correct === total", () => {
    const rows: RecapRow[] = buildRecap(arc3(), [
      { questionIdx: 0, chosenIdx: 0 },
      { questionIdx: 1, chosenIdx: 1 },
      { questionIdx: 2, chosenIdx: 2 },
    ]);
    expect(recapScore(rows)).toEqual({ correct: 3, total: 3 });
  });

  it("빈 행은 correct 0·total 0", () => {
    expect(recapScore([])).toEqual({ correct: 0, total: 0 });
  });
});
