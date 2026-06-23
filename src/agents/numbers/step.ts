// 셈이 step — 체감 숫자 자산 생성(callLLM 1회). 검산은 셀의 리콘실(checkArithmetic)이 코드로 재확인.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import type { ScopeConcept } from "../sherlock_lead/schema.js";
import { NUMBERS_SCHEMA, NUMBERS_SYSTEM, type NumbersOutput } from "./schema.js";

/** 셈이·유이가 받는 '검증된 사실' 맥락(팩트검증가+리콘실 산출). verification_status로 확정 여부 판단. */
export interface ResearchFactContext {
  claim: string;
  verification_status: string;
  quote_excerpt: string | null;
}

export async function numbersStep(
  llm: CallLLMDeps,
  runId: string,
  input: { concepts: ScopeConcept[]; facts: ResearchFactContext[] },
): Promise<NumbersOutput["assets"]> {
  const r = await callLLM<NumbersOutput>(
    { roleId: "numbers", system: NUMBERS_SYSTEM, input, schema: NUMBERS_SCHEMA, runId, maxTokens: 2048 },
    llm,
  );
  return r.data.assets;
}
