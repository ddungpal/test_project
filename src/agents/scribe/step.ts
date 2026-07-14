// 짠펜 step — 대본 작성(callLLM 1회). 표절 가드·lineage 저장은 셀(scriptCell)의 결정적 로직.
//   web/fetch 없음(§10). 미검증 fact는 호출부가 caution 라벨을 붙여 전달한다.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import {
  SCRIBE_SCHEMA,
  SCRIBE_SYSTEM,
  SCRIBE_LENGTH_DIRECTIVE,
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
  // 목표 분량 지시는 full 모드에 항상 append(대본이 너무 짧은 근본 문제 대응 — 깊이로 채운다).
  //   target_persona는 있을 때만 그 뒤에 추가 append + input에 키 포함.
  //   ★ 길이 지시가 항상 붙으므로 full 모드 promptHash는 바뀐다(의도된 것 — 짠펜 골든/replay 재기록됨).
  const base = `${SCRIBE_SYSTEM}\n${SCRIBE_LENGTH_DIRECTIVE}`;
  const system = input.target_persona ? `${base}\n${SCRIBE_PERSONA_DIRECTIVE}` : base;
  const llmInput: Record<string, unknown> = { tone: input.tone, outline: input.outline, facts: input.facts, assets: input.assets };
  if (input.target_persona) llmInput.target_persona = input.target_persona;

  // 목표(≈12분)로 올리면 8192 토큰은 truncate → 16384로 상향. 부분 모드(4096)는 그대로.
  const r = await callLLM<ScribeOutput>(
    { roleId: "scribe", system, input: llmInput, schema: SCRIBE_SCHEMA, runId, maxTokens: 16384 },
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
