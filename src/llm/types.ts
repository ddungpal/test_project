// callLLM 어댑터 계약 (tech.md §2). dev=claude-p / prod=api 를 호출부 코드 동일하게 스위치.

export type ModelTier = "haiku" | "sonnet" | "opus";
// claude-p=개발($0), api=Anthropic 운영(종량), openai=GPT(골든 A/B 비교용·종량).
export type LlmBackend = "claude-p" | "api" | "openai";
export type CacheMode = "system" | "context" | "none";
export type FixtureMode = "replay" | "record" | "off";

/** 출력 강제용 JSON Schema (구조는 ajv가 검증). */
export type JsonSchema = Record<string, unknown>;

export interface LlmRequest<TInput = unknown> {
  /** 에이전트 stable id (로그·라우팅·fixture 키). src/agents/roles.ts */
  roleId: string;
  system: string;
  input: TInput;
  /** 출력 강제 스키마. 응답은 반드시 이 스키마를 통과해야 함. */
  schema: JsonSchema;
  /** 미지정 시 roles.ts 기본 티어 → 라우팅표(§14). */
  model?: ModelTier;
  maxTokens?: number;
  cache?: CacheMode;
  /** production_runs.id — lineage·비용 귀속. */
  runId: string;
}

export interface LlmUsage {
  inTok: number;
  outTok: number;
  cachedInTok: number;
}

export interface LlmResponse<T> {
  /** 스키마 검증 통과 객체. */
  data: T;
  usage: LlmUsage;
  costUsd: number;
  latencyMs: number;
  provider: LlmBackend | "fixture";
  /** 재현성: {roleId, system, input, schema, model} 의 결정적 해시. */
  promptHash: string;
}

/** 백엔드(claude-p|api)가 구현하는 저수준 호출. 비용가드·fixtures·스키마검증의 바깥 계층은 callLLM이 담당. */
export interface LlmBackendDriver {
  readonly name: LlmBackend;
  /** 원시 호출: 스키마-강제 JSON 텍스트를 반환. 파싱·검증은 호출자(callLLM)가 수행. */
  invoke(args: {
    roleId: string;
    system: string;
    input: unknown;
    schema: JsonSchema;
    model: ModelTier;
    maxTokens: number;
    cache: CacheMode;
  }): Promise<{ rawJson: string; usage: LlmUsage }>;
}
