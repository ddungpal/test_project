// 쏙이 온보딩 — 응답에서 수준 추론·금맥 추출(순수·throw 0, 부작용 0).
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "데이터 모델" / D. 금맥 주입.
//   반환 수준은 AUDIENCE_LEVELS 어휘(beginner/novice/intermediate/advanced)에 정렬.
//   순수 헬퍼는 src/lib/**에 둔다(vitest @/ alias 없음 함정 — 컴포넌트는 re-export만).
import type { OnboardingArc, OnboardingGold } from "../../agents/onboarder/schema.js";
import { AUDIENCE_LEVELS, type AudienceLevel } from "../dashboard/proposalTypes.js";

// 김짠부의 응답(각 문항에 고른 인덱스) — 클라에서 수집해 넘어옴.
export type ArcAnswer = { questionIdx: number; chosenIdx: number };

// 응답 0(데이터 없음)일 때 중립 반환값 — novice(초급).
const NEUTRAL_LEVEL: AudienceLevel = "novice";

/**
 * 어려운 문항을 맞혔나로 수준 추론 → audience_level 문자열.
 *   규칙(재량): deep 정답률이 높으면 상위, basic을 틀리면 하위로 캘리브레이션.
 *   - 응답 0(데이터 없음)이면 중립값(novice) 반환·크래시 0.
 *   순수·throw 0. 입력 비변형.
 */
export function inferLevel(arc: OnboardingArc, answers: ArcAnswer[]): AudienceLevel {
  const questions = arc?.questions ?? [];
  if (questions.length === 0 || answers.length === 0) return NEUTRAL_LEVEL;

  let deepTotal = 0;
  let deepCorrect = 0;
  let basicTotal = 0;
  let basicWrong = 0;
  let answered = 0;

  for (const ans of answers) {
    const q = questions[ans?.questionIdx ?? -1];
    if (!q) continue; // 범위 밖 응답 무시(방어)
    answered++;
    const correct = ans.chosenIdx === q.answerIdx;
    if (q.difficulty === "deep") {
      deepTotal++;
      if (correct) deepCorrect++;
    } else if (q.difficulty === "basic") {
      basicTotal++;
      if (!correct) basicWrong++;
    }
  }

  if (answered === 0) return NEUTRAL_LEVEL; // 유효 응답 없음 → 중립

  // basic조차 틀리면 하위 수준(입문).
  if (basicTotal > 0 && basicWrong / basicTotal >= 0.5) return "beginner";

  // deep 정답률로 상위 캘리브레이션.
  if (deepTotal > 0) {
    const ratio = deepCorrect / deepTotal;
    if (ratio >= 0.75) return "advanced";
    if (ratio >= 0.5) return "intermediate";
  }

  return NEUTRAL_LEVEL;
}

/**
 * 응답에서 금맥 추출(순수) → 구다리로 주입.
 *   - confusionPoints = 틀린 문항의 prompt(시청자도 헷갈릴 지점).
 *   - ahaPoints = 틀린 문항의 ahaReveal(놀란 반전 = 훅 후보).
 *   - coreAngle = arc.coreAngle 그대로 보존.
 *   - calibratedLevel = inferLevel(arc, answers).
 *   빈 응답 안전(confusion/aha 빈 배열, coreAngle 보존). 순수·throw 0. 입력 비변형.
 */
export function extractGold(arc: OnboardingArc, answers: ArcAnswer[]): OnboardingGold {
  const questions = arc?.questions ?? [];
  const coreAngle = arc?.coreAngle ?? "";
  const calibratedLevel = inferLevel(arc, answers);

  const confusionPoints: string[] = [];
  const ahaPoints: string[] = [];

  for (const ans of answers) {
    const q = questions[ans?.questionIdx ?? -1];
    if (!q) continue; // 범위 밖 응답 무시(방어)
    const wrong = ans.chosenIdx !== q.answerIdx;
    if (wrong) {
      if (q.prompt.length > 0) confusionPoints.push(q.prompt);
      if (q.ahaReveal.length > 0) ahaPoints.push(q.ahaReveal);
    }
  }

  return { confusionPoints, ahaPoints, coreAngle, calibratedLevel };
}

export { AUDIENCE_LEVELS };
