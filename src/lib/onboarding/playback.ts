// 쏙이 아크 인터랙티브 재생 — 순수 상태/판정 로직(throw 0·입력 비변형).
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "E. UI".
//   ★ 순수 헬퍼는 src/lib/onboarding/에 둔다(vitest @/ alias 없음 함정 — 컴포넌트는 re-export만).
//   재생 흐름: initPlayback → (문항 노출) → chooseAnswer(찍기·reveal on·answer 누적) → next(다음 문항·reveal off) → … → isLast에서 collectAnswers.
//   정오 판정은 chosenIdx === question.answerIdx(schema.ts 정의).
import type { OnboardingArc, ArcQuestion } from "../../agents/onboarder/schema.js";
import type { ArcAnswer } from "./arc.js";

// 재생 상태(불변 취급 — 각 함수는 새 객체를 반환, 입력 비변형).
//   questionIdx: 현재 문항 인덱스. revealed: 현재 문항 아하 공개 여부. answers: 누적 응답(ArcAnswer[] — arc.ts 재사용).
export type PlaybackState = {
  arc: OnboardingArc;
  questionIdx: number;
  revealed: boolean;
  answers: ArcAnswer[];
};

/** 아크로 재생 상태 초기화 — 첫 문항·미공개·빈 응답. 순수·throw 0. */
export function initPlayback(arc: OnboardingArc): PlaybackState {
  return { arc, questionIdx: 0, revealed: false, answers: [] };
}

/** 현재 문항 반환(범위 밖이면 null·방어). 순수·throw 0. */
export function currentQuestion(state: PlaybackState): ArcQuestion | null {
  const questions = state.arc?.questions ?? [];
  return questions[state.questionIdx] ?? null;
}

/** 총 문항 수. */
export function totalQuestions(state: PlaybackState): number {
  return state.arc?.questions?.length ?? 0;
}

/** 현재 문항이 마지막인가(문항 0개면 false). */
export function isLast(state: PlaybackState): boolean {
  const total = totalQuestions(state);
  return total > 0 && state.questionIdx >= total - 1;
}

/** 이미 공개된 뒤인가 — 이후 중복 chooseAnswer를 UI가 막을 수 있게. */
export function isRevealed(state: PlaybackState): boolean {
  return state.revealed;
}

/**
 * 이 chosenIdx가 현재 문항의 정답인가. 현재 문항 없으면 false(방어). 순수·throw 0.
 *   정오 판정: chosenIdx === question.answerIdx.
 */
export function isCorrect(state: PlaybackState, chosenIdx: number): boolean {
  const q = currentQuestion(state);
  if (!q) return false;
  return chosenIdx === q.answerIdx;
}

/**
 * 현재 문항에 답을 고른다 — reveal on + 응답 누적(새 상태 반환·입력 비변형).
 *   - 이미 공개됐으면(중복 클릭) 그대로 반환(멱등·재누적 방지).
 *   - 현재 문항이 없으면(범위 밖) reveal만 켜고 응답은 안 쌓음(방어).
 *   - answers에는 {questionIdx, chosenIdx}(arc.ts ArcAnswer) 누적.
 *   순수·throw 0.
 */
export function chooseAnswer(state: PlaybackState, chosenIdx: number): PlaybackState {
  if (state.revealed) return state; // 이미 공개 — 재누적 방지(멱등)
  const q = currentQuestion(state);
  if (!q) return { ...state, revealed: true }; // 문항 없음 — 공개만(방어)
  const answer: ArcAnswer = { questionIdx: state.questionIdx, chosenIdx };
  return { ...state, revealed: true, answers: [...state.answers, answer] };
}

/**
 * 다음 문항으로 진행 — 인덱스 +1 · reveal off(새 상태 반환·입력 비변형).
 *   - 마지막 문항이면 그대로 반환(끝을 넘어가지 않음).
 *   - 아직 공개 전이면(찍기 전) 그대로 반환(찍고 나서만 넘어감).
 *   순수·throw 0.
 */
export function next(state: PlaybackState): PlaybackState {
  if (!state.revealed) return state; // 찍기 전엔 안 넘어감
  if (isLast(state)) return state; // 마지막이면 그대로
  return { ...state, questionIdx: state.questionIdx + 1, revealed: false };
}

/** 제출용 응답 조립 — 누적된 ArcAnswer[] 반환(방어 복사). submitOnboarding(runId, answers)에 넘긴다. */
export function collectAnswers(state: PlaybackState): ArcAnswer[] {
  return [...state.answers];
}

/** 모든 문항을 다 답했는가(마지막 문항까지 공개 완료) — 제출 버튼 노출 판정용. */
export function isComplete(state: PlaybackState): boolean {
  return totalQuestions(state) > 0 && isLast(state) && state.revealed;
}
