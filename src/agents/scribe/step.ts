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
  SCRIBE_SECTION_SCHEMA,
  SCRIBE_SECTION_DIRECTIVE,
  type ScribeOutput,
  type ScribeSegmentOutput,
  type ScriptSegmentOut,
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

// 짠펜 섹션 모드 — outline의 한 섹션에 해당하는 세그먼트들만 격리 생성한다(전체 대본을 한 번에 쓰지 않음).
//   가설: 섹션을 하나씩 격리 생성하면 경쟁 섹션이 없어 dev(claude-p, maxTokens 미사용) 천장 아래에서 더 길게 전개된다.
//   system = SCRIBE_SYSTEM + SCRIBE_SECTION_DIRECTIVE(항상 append — 섹션 모드 전용 함수).
//   ★ SCRIBE_LENGTH_DIRECTIVE는 붙이지 않는다(전체 분량 목표 vs 섹션 분량 목표 충돌 방지 — 섹션 지시가 섹션 분량을 다룬다).
//   target_persona는 있을 때만 지시(SCRIBE_PERSONA_DIRECTIVE)·input 키를 조건부로 더한다.
//   출력 세그먼트 ord는 이 호출 안의 상대 순번(전역 ord는 파이프라인 배선 step이 다시 매긴다).
export async function scribeSectionStep(
  llm: CallLLMDeps,
  runId: string,
  input: {
    tone: unknown;
    section: unknown; // outline의 섹션 1개 { section, goal, why, format }
    sectionIndex: number; // 0부터
    totalSections: number;
    prior_tail: string; // 직전까지 대본 끝부분. 첫 섹션이면 빈 문자열.
    facts: unknown; // 전역 facts(인덱스 전역 유지)
    assets: unknown; // 전역 assets(인덱스 전역 유지)
    target_persona?: string;
  },
): Promise<{ segments: ScriptSegmentOut[] }> {
  const base = `${SCRIBE_SYSTEM}\n${SCRIBE_SECTION_DIRECTIVE}`;
  const system = input.target_persona ? `${base}\n${SCRIBE_PERSONA_DIRECTIVE}` : base;

  const llmInput: Record<string, unknown> = {
    tone: input.tone,
    section: input.section,
    sectionIndex: input.sectionIndex,
    totalSections: input.totalSections,
    prior_tail: input.prior_tail,
    facts: input.facts,
    assets: input.assets,
  };
  if (input.target_persona) llmInput.target_persona = input.target_persona;

  const r = await callLLM<{ segments: ScriptSegmentOut[] }>(
    { roleId: "scribe", system, input: llmInput, schema: SCRIBE_SECTION_SCHEMA, runId, maxTokens: 6144 },
    llm,
  );
  return r.data;
}
