// 출력 스키마 강제 — tech.md §10 "출력은 schema 강제라 자유서술 탈취 면적 축소".
// 모든 LLM 응답은 호출자가 정의한 JSON Schema를 통과해야 한다(미통과 시 throw).

import Ajv, { type ValidateFunction } from "ajv";
import type { JsonSchema } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const cache = new Map<string, ValidateFunction>();

export class SchemaValidationError extends Error {
  constructor(
    readonly roleId: string,
    readonly errors: string,
    readonly rawJson: string,
  ) {
    super(`[${roleId}] 출력이 스키마를 통과하지 못함: ${errors}`);
    this.name = "SchemaValidationError";
  }
}

function compile(schema: JsonSchema): ValidateFunction {
  const key = JSON.stringify(schema);
  let fn = cache.get(key);
  if (!fn) {
    fn = ajv.compile(schema);
    cache.set(key, fn);
  }
  return fn;
}

/** rawJson 파싱 + 스키마 검증. 통과 시 타입 T로 반환, 실패 시 SchemaValidationError. */
export function parseAndValidate<T>(roleId: string, schema: JsonSchema, rawJson: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    throw new SchemaValidationError(roleId, `JSON 파싱 실패: ${(e as Error).message}`, rawJson);
  }
  const validate = compile(schema);
  if (!validate(parsed)) {
    const msg = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
    throw new SchemaValidationError(roleId, msg, rawJson);
  }
  return parsed as T;
}
