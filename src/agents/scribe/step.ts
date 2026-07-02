// 짠펜 step — 대본 작성(callLLM 1회). 표절 가드·lineage 저장은 셀(scriptCell)의 결정적 로직.
//   web/fetch 없음(§10). 미검증 fact는 호출부가 caution 라벨을 붙여 전달한다.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import {
  SCRIBE_SCHEMA,
  SCRIBE_SYSTEM,
  SCRIBE_PERSONA_DIRECTIVE,
  SCRIBE_SEGMENT_SCHEMA,
  SCRIBE_SEGMENT_DIRECTIVE,
  type ScribeOutput,
  type ScribeSegmentOutput,
} from "./schema.js";

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

// 짠펜 부분 모드 — 단일 세그먼트 하나만 사유를 반영해 다시 쓴다(전체 대본 재작성 없음).
//   system = SCRIBE_SYSTEM + SCRIBE_SEGMENT_DIRECTIVE(항상 append — 부분 모드 전용 함수라 promptHash 무관).
//   target_persona는 있을 때만 지시(SCRIBE_PERSONA_DIRECTIVE)·input 키를 조건부로 더한다.
export async function scribeSegmentStep(
  llm: CallLLMDeps,
  runId: string,
  input: {
    tone: unknown;
    reason: string;
    target: string; // 현재 이 세그먼트 텍스트
    neighbors: { prev?: string; next?: string };
    facts: unknown;
    assets: unknown;
    target_persona?: string;
  },
): Promise<ScribeSegmentOutput> {
  const base = `${SCRIBE_SYSTEM}\n${SCRIBE_SEGMENT_DIRECTIVE}`;
  const system = input.target_persona ? `${base}\n${SCRIBE_PERSONA_DIRECTIVE}` : base;

  const llmInput: Record<string, unknown> = {
    tone: input.tone,
    reason: input.reason,
    target: input.target,
    neighbors: input.neighbors,
    facts: input.facts,
    assets: input.assets,
  };
  if (input.target_persona) llmInput.target_persona = input.target_persona;

  const r = await callLLM<ScribeSegmentOutput>(
    { roleId: "scribe", system, input: llmInput, schema: SCRIBE_SEGMENT_SCHEMA, runId, maxTokens: 4096 },
    llm,
  );
  return r.data;
}
