// 반론 step — 확증편향 차단(callLLM 1회). 검증된 fact 요약 + 구성을 받아 누락·반증을 찾는다.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import { CRITIC_SCHEMA, CRITIC_SYSTEM, type CriticOutput } from "./schema.js";

export async function criticStep(
  llm: CallLLMDeps,
  runId: string,
  input: { facts: string[]; outline: unknown },
): Promise<CriticOutput> {
  const r = await callLLM<CriticOutput>(
    { roleId: "critic", system: CRITIC_SYSTEM, input, schema: CRITIC_SCHEMA, runId, maxTokens: 1536 },
    llm,
  );
  // 빈 배열 가능 필드 — 모델이 누락하면(빈틈 없음) []로 정규화(스키마 required 미지정과 짝).
  return { missing: r.data.missing ?? [], counter_evidence: r.data.counter_evidence ?? [] };
}
