// 쏙이 완료화면 — 풀이 복습(recap) 순수 조인·집계 로직(throw 0·입력 비변형).
//   설계: docs/specs/2026-07-03-onboarding-review-recap-design.md "순수 헬퍼".
//   ★ 순수 헬퍼는 src/lib/onboarding/에 둔다(vitest @/ alias 없음 함정 — 컴포넌트는 re-export만).
//   정오 판정은 playback.ts isCorrect과 동일 규칙: chosenIdx === question.answerIdx.
import type { OnboardingArc, ArcQuestion } from "../../agents/onboarder/schema.js";
import type { ArcAnswer } from "./arc.js";

// 복습 한 행 — 문항 + 내가 고른 답(미응답이면 null) + 정오.
export type RecapRow = {
  question: ArcQuestion;
  chosenIdx: number | null; // 미응답이면 null(방어)
  correct: boolean; // chosenIdx != null && chosenIdx === question.answerIdx
};

/**
 * arc.questions를 인덱스 순서로 순회하며 answers(questionIdx로 매칭)를 조인.
 *   - 각 문항 idx에 대응하는 answer를 questionIdx === idx로 찾는다.
 *   - 같은 idx가 여러 개면 마지막 것을 쓴다(방어; 재생 로직상 1문항 1응답).
 *   - 매칭 answer 없으면 미응답 → chosenIdx = null, correct = false.
 *   - answerIdx/chosenIdx가 choices 범위 밖이어도 throw 없이 === 비교 결과대로.
 *   순수·throw 0. 입력 비변형.
 */
export function buildRecap(arc: OnboardingArc, answers: ArcAnswer[]): RecapRow[] {
  const questions = arc?.questions ?? [];
  const list = Array.isArray(answers) ? answers : [];

  return questions.map((question, idx) => {
    // 같은 questionIdx가 여러 개면 마지막 것(방어) — 뒤에서부터 찾는다.
    let chosenIdx: number | null = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const ans = list[i];
      if (ans?.questionIdx === idx) {
        chosenIdx = ans.chosenIdx;
        break;
      }
    }
    const correct = chosenIdx != null && chosenIdx === question.answerIdx;
    return { question, chosenIdx, correct };
  });
}

/**
 * 요약 집계 — total = rows.length(전체 문항 기준), correct = correct===true 행 수.
 *   순수·throw 0. 입력 비변형.
 */
export function recapScore(rows: RecapRow[]): { correct: number; total: number } {
  const list = Array.isArray(rows) ? rows : [];
  let correct = 0;
  for (const r of list) {
    if (r?.correct === true) correct++;
  }
  return { correct, total: list.length };
}

/** 페이저 인덱스를 [0, total-1]로 클램프. total<=0이면 0. NaN도 0. 순수·throw 0. */
export function clampRecapIndex(idx: number, total: number): number {
  if (!Number.isFinite(idx)) return 0;
  if (total <= 0) return 0;
  if (idx < 0) return 0;
  const i = Math.trunc(idx);
  if (i >= total) return total - 1;
  return i;
}
