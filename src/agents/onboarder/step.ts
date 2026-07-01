// 쏙이 step — '궁금증 아크' 생성(callLLM 1회). 비교가(comparator) 골격 미러.
//   입력은 prepare가 공급한 topic+자막+영상사실. normalizeArc로 방어(stray 버림·불량 문항 드랍) 후 반환.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import { ONBOARDER_SCHEMA, ONBOARDER_SYSTEM, normalizeArc, type OnboarderInput, type OnboardingArc } from "./schema.js";

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
