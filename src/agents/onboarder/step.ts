// 쏙이 step — '궁금증 아크' 생성(callLLM 1회). 비교가(comparator) 골격 미러.
//   입력은 prepare가 공급한 topic+자막+영상사실. normalizeArc로 방어(stray 버림·불량 문항 드랍) 후 반환.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import {
  ONBOARDER_SCHEMA,
  ONBOARDER_SYSTEM,
  normalizeArc,
  type ArcDifficulty,
  type ArcQuestion,
  type OnboarderInput,
  type OnboardingArc,
} from "./schema.js";

export async function onboarderStep(
  llm: CallLLMDeps,
  runId: string,
  input: OnboarderInput,
): Promise<OnboardingArc> {
  const r = await callLLM<unknown>(
    { roleId: "onboarder", system: ONBOARDER_SYSTEM, input, schema: ONBOARDER_SCHEMA, runId, maxTokens: 6000 },
    llm,
  );
  // normalizeArc는 소재 부족·전 문항 드랍 시 null 가능 → 빈 아크 폴백(크래시 금지).
  return normalizeArc(r.data) ?? { questions: [], coreAngle: "" };
}

/**
 * 난이도 타겟 추가 문항 생성 — 기존 아크에 이어붙일 새 문항만 반환(append는 콜러 몫).
 *   ★ ONBOARDER_SYSTEM 원문은 건드리지 않는다 — 추가지시를 뒤에 덧붙일 뿐(default 경로 promptHash 보존).
 *   - 기존 문항 prompt·coreAngle을 system에 나열해 중복 방지·연속성 근거로 준다.
 *   - callLLM(maxTokens 6000) → normalizeArc 방어 → questions만 반환(빈 배열 가능).
 */
export async function onboarderMoreStep(
  llm: CallLLMDeps,
  runId: string,
  input: OnboarderInput,
  difficulty: ArcDifficulty,
  existing: OnboardingArc,
): Promise<ArcQuestion[]> {
  const existingPrompts = (existing?.questions ?? []).map((q) => `- ${q.prompt}`).join("\n");
  const moreDirective = [
    "",
    `【추가 문항 생성 모드】 아래 기존 아크에 이어붙일 난이도=${difficulty} 문항 2~3개만 새로 생성한다.`,
    "- 기존 흐름·클리프행어를 이어서 전개하고, 마지막은 기존 coreAngle 방향으로 수렴시킨다.",
    "- 기존 문항과 prompt가 중복되지 않게 한다(같은 질문 재출력 금지).",
    `- 모든 새 문항의 difficulty는 반드시 '${difficulty}'로 매긴다.`,
    "- money-safety·듀얼훅(reversal/practical)·클리프행어 규칙은 그대로 유지한다.",
    "- 기존 문항은 다시 출력하지 말고, 새로 만든 문항만 questions 배열에 담는다.",
    "",
    `기존 coreAngle: ${existing?.coreAngle ?? ""}`,
    "기존 문항 prompt 목록(중복 금지·연속성 근거):",
    existingPrompts,
  ].join("\n");

  const system = ONBOARDER_SYSTEM + "\n" + moreDirective;
  const r = await callLLM<unknown>(
    { roleId: "onboarder", system, input, schema: ONBOARDER_SCHEMA, runId, maxTokens: 6000 },
    llm,
  );
  const normalized = normalizeArc(r.data);
  return normalized?.questions ?? [];
}
