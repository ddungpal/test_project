// 유이 step — 일상 비유 자산 생성(callLLM 1회). 왜곡 점검은 셀의 리콘실이 distortion_note로 재확인.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import type { ScopeConcept } from "../sherlock_lead/schema.js";
import type { ResearchFactContext } from "../numbers/step.js";
import { appendAnalogyStyle, type ActiveAnalogyStyle } from "../shared/analogyStyle.js";
import { ANALOGIST_SCHEMA, ANALOGIST_SYSTEM, type AnalogistOutput } from "./schema.js";

export async function analogyStep(
  llm: CallLLMDeps,
  runId: string,
  input: { concepts: ScopeConcept[]; facts: ResearchFactContext[]; analogyStyle?: ActiveAnalogyStyle | null },
): Promise<AnalogistOutput["assets"]> {
  // ★ analogyStyle 은 system 에만 반영하고 LLM 구조화 input(concepts/facts)에서는 제외한다.
  //   프로필이 없으면 system 은 ANALOGIST_SYSTEM 과 바이트 동일 + input 도 기존과 동일 → 유이 fixture/promptHash 불변.
  const { concepts, facts, analogyStyle } = input;
  const system = appendAnalogyStyle(ANALOGIST_SYSTEM, analogyStyle ?? null);
  const r = await callLLM<AnalogistOutput>(
    { roleId: "analogist", system, input: { concepts, facts }, schema: ANALOGIST_SCHEMA, runId, maxTokens: 2048 },
    llm,
  );
  return r.data.assets;
}
