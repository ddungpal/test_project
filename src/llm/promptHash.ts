// 결정적 프롬프트 해시 — 재현성(LlmResponse.promptHash) + fixture 키 + parity 비교 기준.
// 같은 의미의 요청은 키 순서·공백과 무관하게 같은 해시를 내야 한다(canonical JSON).

import { createHash } from "node:crypto";
import type { JsonSchema, ModelTier } from "./types.js";

/**
 * 객체를 키 정렬 기준으로 직렬화(canonical) — 해시 안정성 보장.
 * ★ 먼저 JSON roundtrip으로 정규화: Date→ISO·undefined 제거 등 백엔드의 JSON.stringify와
 *   동일 의미로 맞춘다(아니면 Date가 {}로 손상돼 해시 충돌). 비순수 값도 JSON 규칙으로 수렴.
 */
export function canonicalize(value: unknown): string {
  const normalized = value === undefined ? null : JSON.parse(JSON.stringify(value));
  return JSON.stringify(sortDeep(normalized));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function promptHash(args: {
  roleId: string;
  system: string;
  input: unknown;
  schema: JsonSchema;
  model: ModelTier;
  maxTokens: number; // 출력 예산이 다르면 fixture도 달라야 함(잘림 거동 차이)
}): string {
  const canonical = canonicalize({
    roleId: args.roleId,
    system: args.system,
    input: args.input,
    schema: args.schema,
    model: args.model,
    maxTokens: args.maxTokens,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
