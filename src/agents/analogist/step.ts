// 유이 step — 일상 비유 자산 생성(callLLM 1회). 왜곡 점검은 셀의 리콘실이 distortion_note로 재확인.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import type { ScopeConcept } from "../sherlock_lead/schema.js";
import type { ResearchFactContext } from "../numbers/step.js";
import { ANALOGIST_SCHEMA, ANALOGIST_SYSTEM, type AnalogistOutput } from "./schema.js";

export async function analogyStep(
  llm: CallLLMDeps,
  runId: string,
  input: { concepts: ScopeConcept[]; facts: ResearchFactContext[] },
): Promise<AnalogistOutput["assets"]> {
  const r = await callLLM<AnalogistOutput>(
    { roleId: "analogist", system: ANALOGIST_SYSTEM, input, schema: ANALOGIST_SCHEMA, runId, maxTokens: 2048 },
    llm,
  );
  return r.data.assets;
}
