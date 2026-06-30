// 짠펜 step — 대본 작성(callLLM 1회). 표절 가드·lineage 저장은 셀(scriptCell)의 결정적 로직.
//   web/fetch 없음(§10). 미검증 fact는 호출부가 caution 라벨을 붙여 전달한다.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import { SCRIBE_SCHEMA, SCRIBE_SYSTEM, SCRIBE_PERSONA_DIRECTIVE, type ScribeOutput } from "./schema.js";

export async function scribeStep(
  llm: CallLLMDeps,
  runId: string,
  input: { tone: unknown; outline: unknown; facts: unknown; assets: unknown; target_persona?: string },
): Promise<ScribeOutput> {
  // target_persona 조건부 주입 — persona 있을 때만 system에 지시 append + input에 키 포함.
  //   없으면(옛 주제/런) system도 input도 기존과 바이트 동일 → promptHash 보존 → 골든 픽스처 안 깨짐.
  const system = input.target_persona ? `${SCRIBE_SYSTEM}\n${SCRIBE_PERSONA_DIRECTIVE}` : SCRIBE_SYSTEM;
  const llmInput: Record<string, unknown> = { tone: input.tone, outline: input.outline, facts: input.facts, assets: input.assets };
  if (input.target_persona) llmInput.target_persona = input.target_persona;

  const r = await callLLM<ScribeOutput>(
    { roleId: "scribe", system, input: llmInput, schema: SCRIBE_SCHEMA, runId, maxTokens: 8192 },
    llm,
  );
  return r.data;
}
