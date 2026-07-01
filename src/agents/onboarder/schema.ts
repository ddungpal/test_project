// 쏙이(onboarder) — "궁금증 아크" 데이터 모델 + forced tool_use JSON 스키마.
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "데이터 모델".
//   ★ stray 내성: comparator 패턴 미러 — 루트·items 모두 additionalProperties:true(claude-p stray 결정적 실패 방지).
//   ★ 배열 required 함정: required는 string/필수 필드만. 빈 배열이 될 수 있는 배열 필드는 required에서 뺀다(forced tool_use 검증 깨짐 방지).
import type { JsonSchema } from "../../llm/types.js";

export type ArcDifficulty = "basic" | "mid" | "deep";
export type ArcHookMode = "reversal" | "practical"; // 위험→reversal, 혜택→practical

export type ArcQuestion = {
  prompt: string;
  choices: string[]; // 2~4지선다
  answerIdx: number; // choices 인덱스
  difficulty: ArcDifficulty; // 사후 수준추론용
  hookMode: ArcHookMode;
  ahaReveal: string; // 찍은 뒤 여는 해설
  unverifiedNumbers?: string[]; // 미검증 수치(⚠️확인 필요 표시)
  cliffhanger?: string; // 이 아하가 다음 문항을 여는 한 줄
};

export type OnboardingArc = { questions: ArcQuestion[]; coreAngle: string };

export type OnboarderInput = {
  topic: string;
  transcript?: string;
  videoFacts?: string[];
  referenceTitle?: string;
};

export type OnboardingGold = {
  confusionPoints: string[]; // 틀린 문항 = 시청자도 헷갈릴 것 → 구다리가 풀 섹션
  ahaPoints: string[]; // 놀란 반전 = 훅 후보
  coreAngle: string; // 아크가 수렴한 갈림길 = 영상 핵심 앵글
  calibratedLevel: string; // 추론된 수준(audience_level 캘리브레이션)
};

const DIFFICULTIES: readonly ArcDifficulty[] = ["basic", "mid", "deep"];
const HOOK_MODES: readonly ArcHookMode[] = ["reversal", "practical"];

export const ONBOARDER_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: true, // 루트도 stray 허용(claude-p 내성). required로 존재 필드만 강제.
  required: ["coreAngle"], // string만. questions는 배열이라 required에서 뺀다(빈 배열 함정) — minItems로 통제.
  properties: {
    coreAngle: { type: "string" },
    questions: {
      type: "array",
      minItems: 1, // 최소 1문항(빈 아크 금지). 통제는 minItems로.
      items: {
        type: "object",
        additionalProperties: true, // 여분 필드 붙어도 통과 — normalizeArc가 명시선택해 stray 버림.
        required: ["prompt", "answerIdx", "difficulty", "hookMode", "ahaReveal"], // choices는 배열이라 required 제외(minItems로).
        properties: {
          prompt: { type: "string", minLength: 1 },
          choices: {
            type: "array",
            minItems: 2,
            maxItems: 4, // 2~4지선다
            items: { type: "string" },
          },
          answerIdx: { type: "number" },
          difficulty: { type: "string", enum: [...DIFFICULTIES] },
          hookMode: { type: "string", enum: [...HOOK_MODES] },
          ahaReveal: { type: "string", minLength: 1 },
          unverifiedNumbers: { type: "array", items: { type: "string" } },
          cliffhanger: { type: "string" },
        },
      },
    },
  },
};

/**
 * LLM 원출력 방어(순수·throw 0, comparator normalizeComparison 미러).
 *   - questions가 1개 미만이면 null 드랍.
 *   - answerIdx가 choices 범위 밖이면 그 문항 드랍.
 *   - difficulty/hookMode가 enum 아니면 그 문항 드랍(stray 흡수).
 *   - coreAngle 없으면 "".
 * 명시선택으로 stray 필드는 버린다. 입력 비변형.
 */
export function normalizeArc(raw: unknown): OnboardingArc | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const rawQuestions = Array.isArray(obj.questions) ? obj.questions : [];
  const questions: ArcQuestion[] = [];

  for (const q of rawQuestions) {
    if (!q || typeof q !== "object") continue;
    const item = q as Record<string, unknown>;

    const prompt = typeof item.prompt === "string" ? item.prompt : "";
    if (prompt.length === 0) continue;

    const choices = Array.isArray(item.choices)
      ? item.choices.filter((c): c is string => typeof c === "string")
      : [];
    if (choices.length < 2) continue; // 최소 2지선다 아니면 드랍

    const answerIdx = typeof item.answerIdx === "number" ? item.answerIdx : NaN;
    if (!Number.isInteger(answerIdx) || answerIdx < 0 || answerIdx >= choices.length) continue; // 범위 밖 드랍

    const difficulty = item.difficulty;
    if (!isDifficulty(difficulty)) continue; // enum 아니면 드랍

    const hookMode = item.hookMode;
    if (!isHookMode(hookMode)) continue; // enum 아니면 드랍

    const ahaReveal = typeof item.ahaReveal === "string" ? item.ahaReveal : "";
    if (ahaReveal.length === 0) continue;

    const question: ArcQuestion = { prompt, choices, answerIdx, difficulty, hookMode, ahaReveal };

    const unverifiedNumbers = Array.isArray(item.unverifiedNumbers)
      ? item.unverifiedNumbers.filter((n): n is string => typeof n === "string")
      : undefined;
    if (unverifiedNumbers && unverifiedNumbers.length > 0) question.unverifiedNumbers = unverifiedNumbers;

    if (typeof item.cliffhanger === "string" && item.cliffhanger.length > 0) {
      question.cliffhanger = item.cliffhanger;
    }

    questions.push(question);
  }

  if (questions.length < 1) return null; // 1개 미만이면 null 드랍

  const coreAngle = typeof obj.coreAngle === "string" ? obj.coreAngle : "";
  return { questions, coreAngle };
}

function isDifficulty(v: unknown): v is ArcDifficulty {
  return typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
}
function isHookMode(v: unknown): v is ArcHookMode {
  return typeof v === "string" && (HOOK_MODES as readonly string[]).includes(v);
}
