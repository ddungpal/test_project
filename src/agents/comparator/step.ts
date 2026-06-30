// 비교가 step — 비교표 자산 생성(callLLM 1회). 검증된 사실'만' 받아 entity×dimension×cell로 구조화.
//   정규화·grounded→verified 매핑·드랍은 리콘실(researchReconcile.buildAssetRows)이 코드로 처리. 여기는 호출만.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import type { ResearchFactContext } from "../numbers/step.js";
import { COMPARATOR_SCHEMA, COMPARATOR_SYSTEM, type ComparatorOutput } from "./schema.js";

/** 비교가가 받는 'table 형식 섹션' 메타(구다리 outline의 format='table' 섹션). */
export interface CompareSection {
  section: string;
  goal: string;
}

export async function comparatorStep(
  llm: CallLLMDeps,
  runId: string,
  input: { sections: CompareSection[]; facts: ResearchFactContext[] },
): Promise<ComparatorOutput["assets"]> {
  const r = await callLLM<ComparatorOutput>(
    { roleId: "comparator", system: COMPARATOR_SYSTEM, input, schema: COMPARATOR_SCHEMA, runId, maxTokens: 4096 },
    llm,
  );
  return r.data.assets;
}
