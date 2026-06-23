// 짠펜 step — 대본 작성(callLLM 1회). 표절 가드·lineage 저장은 셀(scriptCell)의 결정적 로직.
//   web/fetch 없음(§10). 미검증 fact는 호출부가 caution 라벨을 붙여 전달한다.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import { SCRIBE_SCHEMA, SCRIBE_SYSTEM, type ScribeOutput } from "./schema.js";

export async function scribeStep(
  llm: CallLLMDeps,
  runId: string,
  input: { tone: unknown; outline: unknown; facts: unknown; assets: unknown },
): Promise<ScribeOutput> {
  const r = await callLLM<ScribeOutput>(
    { roleId: "scribe", system: SCRIBE_SYSTEM, input, schema: SCRIBE_SCHEMA, runId, maxTokens: 8192 },
    llm,
  );
  return r.data;
}
