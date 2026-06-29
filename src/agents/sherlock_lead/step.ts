// 셜록 step — 검증 대상 분해(scope). callLLM 1회. 셀은 이 함수만 부른다(로직 격리, §8.1).
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import { SHERLOCK_SCOPE_SCHEMA, SHERLOCK_SCOPE_SYSTEM, type SherlockScopeOutput } from "./schema.js";

export async function scopeStep(
  llm: CallLLMDeps,
  runId: string,
  // ★ reason·existing은 재생성(regenerateResearchScope) 전용 옵셔널 필드. 값이 있을 때만 input에 담아야
  //   기존 호출(둘 다 없음)이 byte-identical → promptHash·parity 픽스처 불변.
  input: {
    topic: string;
    title: string;
    outline: unknown;
    budget?: { claims: number; concepts: number };
    reason?: string;
    existing?: { claims: string[]; concepts: string[] };
  },
): Promise<SherlockScopeOutput> {
  const r = await callLLM<SherlockScopeOutput>(
    { roleId: "sherlock_lead", system: SHERLOCK_SCOPE_SYSTEM, input, schema: SHERLOCK_SCOPE_SCHEMA, runId, maxTokens: 2048 },
    llm,
  );
  return r.data;
}
