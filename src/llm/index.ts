// LLM 모듈 공개 표면.
export { callLLM, type CallLLMDeps } from "./callLLM.js";
export { CostGuard, InMemoryCostLedger, HardCapExceededError, SoftCapPause, type CostLedgerSink } from "./costGuard.js";
export { loadConfig, type LlmConfig } from "./config.js";
export { promptHash, canonicalize } from "./promptHash.js";
export { parseAndValidate, SchemaValidationError } from "./schema.js";
export { loadFixture, saveFixture, FixtureMissError, type FixtureRecord } from "./fixtures.js";
export { computeCostUsd, estimateMaxCostUsd } from "./pricing.js";
export { claudePDriver } from "./backends/claudeP.js";
export { apiDriver } from "./backends/api.js";
export type {
  LlmRequest,
  LlmResponse,
  LlmUsage,
  LlmBackend,
  LlmBackendDriver,
  ModelTier,
  CacheMode,
  FixtureMode,
  JsonSchema,
} from "./types.js";
