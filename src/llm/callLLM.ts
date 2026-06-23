// callLLM() — tech.md §2 어댑터. 호출부는 백엔드를 모른 채 동일 코드로 호출한다.
// 계층: promptHash → 비용 preflight 예약(§17) → fixtures 리플레이 or 백엔드 → 정산 → 스키마 검증.
//
// 코드리뷰(GPT-5.5) 반영:
//  B) claude-p(구독 정액)는 $0 — API 단가로 과금/예약하지 않는다(개발 $0).
//  C) preflight 추정에 schema 크기 포함 + 안전계수(pricing) — 캡 누수 차단.
//  E) promptHash에 maxTokens 포함.
//  G) claude-p는 스키마 강제가 아니므로(프롬프트+사후검증) 검증 실패 시 무료 재시도 1회.

import { resolveModel } from "../agents/roles.js";
import { apiDriver } from "./backends/api.js";
import { claudePDriver } from "./backends/claudeP.js";
import { openaiDriver } from "./backends/openai.js";
import { loadConfig, type LlmConfig } from "./config.js";
import { CostGuard } from "./costGuard.js";
import { loadFixture, saveFixture, FixtureMissError } from "./fixtures.js";
import { computeCostUsd, estimateMaxCostUsd } from "./pricing.js";
import { promptHash } from "./promptHash.js";
import { parseAndValidate, SchemaValidationError } from "./schema.js";
import type { LlmBackendDriver, LlmRequest, LlmResponse, ModelTier } from "./types.js";

export interface CallLLMDeps {
  config?: LlmConfig;
  costGuard: CostGuard;
  /** 테스트·spike용 백엔드 주입(미지정 시 config.backend로 선택). */
  driver?: LlmBackendDriver;
}

function pickDriver(config: LlmConfig, override?: LlmBackendDriver): LlmBackendDriver {
  if (override) return override;
  if (config.backend === "api") return apiDriver;
  if (config.backend === "openai") return openaiDriver;
  return claudePDriver;
}

export async function callLLM<T>(req: LlmRequest, deps: CallLLMDeps): Promise<LlmResponse<T>> {
  const config = deps.config ?? loadConfig();
  const model: ModelTier = req.model ?? resolveModel(req.roleId);
  const maxTokens = req.maxTokens ?? 4096;
  const cache = req.cache ?? "none";
  const hash = promptHash({ roleId: req.roleId, system: req.system, input: req.input, schema: req.schema, model, maxTokens });

  // 1) fixtures 리플레이 — 과금 0 경로. 비용 예약 불필요(실호출 아님).
  if (config.fixtures === "replay") {
    const fx = loadFixture(req.roleId, hash);
    if (!fx) throw new FixtureMissError(req.roleId, hash);
    const data = parseAndValidate<T>(req.roleId, req.schema, fx.rawJson);
    return { data, usage: fx.usage, costUsd: 0, latencyMs: 0, provider: "fixture", promptHash: hash };
  }
  if (config.fixtures === "record") {
    const fx = loadFixture(req.roleId, hash);
    if (fx) {
      const data = parseAndValidate<T>(req.roleId, req.schema, fx.rawJson);
      return { data, usage: fx.usage, costUsd: 0, latencyMs: 0, provider: "fixture", promptHash: hash };
    }
  }

  // 2) 실호출 — preflight 비용 예약(§17 병렬 누수 차단).
  const driver = pickDriver(config, deps.driver);
  const isFree = driver.name === "claude-p"; // claude-p = 구독 정액 → $0 (B)
  const estimate = isFree ? 0 : estimateMaxCostUsd(model, approxInputTokens(req.system, req.input, req.schema), maxTokens, driver.name);
  deps.costGuard.reserve(req.runId, estimate); // HardCapExceededError / SoftCapPause 가능

  // claude-p는 스키마 강제가 아니라 무료 재시도 허용(G), api는 1회(유료).
  const maxAttempts = isFree ? 2 : 1;
  const started = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let rawJson: string;
    let usage: LlmResponse<T>["usage"];
    try {
      const out = await driver.invoke({ roleId: req.roleId, system: req.system, input: req.input, schema: req.schema, model, maxTokens, cache });
      rawJson = out.rawJson;
      usage = out.usage;
    } catch (e) {
      deps.costGuard.release(req.runId, estimate); // 호출 실패 → 예약 해제(실비 없음)
      throw e;
    }

    const latencyMs = Date.now() - started;
    const costUsd = isFree ? 0 : computeCostUsd(model, usage, driver.name);
    // 정산을 검증보다 먼저: 유료 호출은 출력이 틀려도 비용이 이미 발생(api). 예약→실비 교체는 1회만.
    deps.costGuard.reconcile(req.runId, estimate, costUsd, {
      label: `${req.roleId}:${driver.name}:${model}`,
      tokens: usage.inTok + usage.outTok,
      latencyMs,
    });
    if (config.fixtures === "record") {
      saveFixture({ promptHash: hash, roleId: req.roleId, model, rawJson, usage, recordedAt: new Date(started).toISOString() });
    }

    try {
      const data = parseAndValidate<T>(req.roleId, req.schema, rawJson);
      return { data, usage, costUsd, latencyMs, provider: driver.name, promptHash: hash };
    } catch (e) {
      // claude-p 무료 재시도 여지가 남았으면 재호출(예약은 이미 정산됨 → 다음 시도는 $0이라 추가 예약 불필요).
      if (isFree && e instanceof SchemaValidationError && attempt < maxAttempts) continue;
      throw e; // api거나 마지막 시도 → 검증 실패 그대로(비용은 이미 정산됨)
    }
  }
  // 도달 불가(루프는 return 또는 throw로 종료).
  throw new Error(`[${req.roleId}] callLLM 비정상 종료`);
}

/** 입력 토큰 근사(문자/4) — preflight 예약용 보수 추정. schema 프레이밍 포함(C). */
function approxInputTokens(system: string, input: unknown, schema: unknown): number {
  return Math.ceil((system.length + JSON.stringify(input).length + JSON.stringify(schema).length) / 4);
}
