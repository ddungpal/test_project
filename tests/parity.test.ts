// Phase 0 parity 스파이크 (§17 P1) — $0로 어댑터/비용가드/fixtures/parity를 증명.
// 라이브(claude-p vs api 실호출) parity는 scripts/parity-live.ts (크레덴셜 있을 때).

import { describe, expect, it } from "vitest";
import { extractJson } from "../src/llm/backends/claudeP.js";
import { callLLM } from "../src/llm/callLLM.js";
import { CostGuard, HardCapExceededError, InMemoryCostLedger, SoftCapPause } from "../src/llm/costGuard.js";
import { promptHash } from "../src/llm/promptHash.js";
import { saveFixture } from "../src/llm/fixtures.js";
import { SchemaValidationError } from "../src/llm/schema.js";
import type { LlmBackendDriver, LlmConfig, LlmRequest } from "../src/llm/index.js";

const SCHEMA = {
  type: "object",
  required: ["title", "reason"],
  additionalProperties: false,
  properties: { title: { type: "string" }, reason: { type: "string" } },
} as const;

const BASE_REQ: LlmRequest = {
  roleId: "topic_scout",
  system: "너는 촉이다. 주제 후보를 낸다.",
  input: { recentTopics: ["ISA", "ETF"] },
  schema: SCHEMA as Record<string, unknown>,
  model: "sonnet",
  runId: "run-test-1",
};

function fakeDriver(name: "claude-p" | "api", payload: object): LlmBackendDriver {
  return {
    name,
    async invoke() {
      return { rawJson: JSON.stringify(payload), usage: { inTok: 1000, outTok: 200, cachedInTok: 0 } };
    },
  };
}

function cfg(over: Partial<LlmConfig> = {}): LlmConfig {
  return { backend: "claude-p", fixtures: "off", softCapUsd: 7, hardCapUsd: 10, maxRework: 2, research: { maxClaims: 4, maxConcepts: 4, koreanOfficialDomains: [] }, search: { defaultTtlSeconds: 86_400, volatilityTtlSeconds: { static: 2_592_000, slow: 604_800, fast: 3_600 } }, ab: { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3 }, ...over };
}

describe("promptHash 결정성", () => {
  it("키 순서·공백과 무관하게 동일 해시", () => {
    const a = promptHash({ roleId: "r", system: "s", input: { a: 1, b: 2 }, schema: SCHEMA as Record<string, unknown>, model: "sonnet", maxTokens: 4096 });
    const b = promptHash({ roleId: "r", system: "s", input: { b: 2, a: 1 }, schema: SCHEMA as Record<string, unknown>, model: "sonnet", maxTokens: 4096 });
    expect(a).toBe(b);
  });
  it("maxTokens가 다르면 해시가 다르다 (코드리뷰 E)", () => {
    const base = { roleId: "r", system: "s", input: { a: 1 }, schema: SCHEMA as Record<string, unknown>, model: "sonnet" as const };
    expect(promptHash({ ...base, maxTokens: 1024 })).not.toBe(promptHash({ ...base, maxTokens: 4096 }));
  });
});

describe("extractJson 문자열-인지 파서 (claude-p)", () => {
  it("문자열 안의 닫는 브레이스를 무시하고 균형 JSON 추출", () => {
    const out = '여기 결과:\n{"title":"이건 } 닫는 예시","reason":"중첩 {\\"k\\":1}"}\n끝';
    const json = extractJson(out);
    expect(JSON.parse(json)).toEqual({ title: "이건 } 닫는 예시", reason: '중첩 {"k":1}' });
  });
  it("코드펜스를 벗겨낸다", () => {
    const json = extractJson('```json\n{"a":1}\n```');
    expect(JSON.parse(json)).toEqual({ a: 1 });
  });
  it("이스케이프된 따옴표를 문자열 종료로 오인하지 않음", () => {
    const json = extractJson('{"q":"그는 \\"안녕\\" 이라 했다 }"}');
    expect(JSON.parse(json)).toEqual({ q: '그는 "안녕" 이라 했다 }' });
  });
});

describe("callLLM 어댑터 happy path", () => {
  it("api: 스키마 검증 통과 + 비용 계산 + ledger 적재", async () => {
    const ledger = new InMemoryCostLedger();
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10, sink: ledger });
    const res = await callLLM<{ title: string; reason: string }>(BASE_REQ, {
      config: cfg({ backend: "api" }),
      costGuard: guard,
      driver: fakeDriver("api", { title: "파킹통장 200%", reason: "검색 급증" }),
    });
    expect(res.data.title).toBe("파킹통장 200%");
    expect(res.provider).toBe("api");
    expect(res.costUsd).toBeGreaterThan(0);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]!.runId).toBe("run-test-1");
  });

  it("claude-p는 $0 — API 단가 과금 안 함 (코드리뷰 B)", async () => {
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
    const res = await callLLM<{ title: string; reason: string }>(BASE_REQ, {
      config: cfg(),
      costGuard: guard,
      driver: fakeDriver("claude-p", { title: "무료", reason: "구독 정액" }),
    });
    expect(res.provider).toBe("claude-p");
    expect(res.costUsd).toBe(0);
    expect(guard.spentUsd("run-test-1")).toBe(0);
  });

  it("스키마 위반 출력은 SchemaValidationError", async () => {
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
    await expect(
      callLLM(BASE_REQ, { config: cfg(), costGuard: guard, driver: fakeDriver("claude-p", { title: "제목만", missing: "reason" }) }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });
});

describe("fixtures 리플레이 = $0", () => {
  it("녹화분 replay 시 provider=fixture, costUsd=0", async () => {
    const hash = promptHash({ roleId: BASE_REQ.roleId, system: BASE_REQ.system, input: BASE_REQ.input, schema: BASE_REQ.schema, model: "sonnet", maxTokens: 4096 });
    saveFixture({
      promptHash: hash,
      roleId: BASE_REQ.roleId,
      model: "sonnet",
      rawJson: JSON.stringify({ title: "리플레이 제목", reason: "fixture" }),
      usage: { inTok: 10, outTok: 5, cachedInTok: 0 },
      recordedAt: "2026-06-18T00:00:00.000Z",
    });
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
    const res = await callLLM<{ title: string }>(BASE_REQ, { config: cfg({ fixtures: "replay" }), costGuard: guard });
    expect(res.provider).toBe("fixture");
    expect(res.costUsd).toBe(0);
    expect(res.data.title).toBe("리플레이 제목");
  });
});

describe("비용 2단 캡 + 병렬 누수 차단 (§17)", () => {
  it("HARD 캡 초과 시 호출 거부", () => {
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
    guard.acknowledgeSoftCap("r");
    guard.reserve("r", 6);
    expect(() => guard.reserve("r", 5)).toThrow(HardCapExceededError); // 6+5 > 10
  });

  it("SOFT 캡 미승인 시 일시정지(SoftCapPause)", () => {
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
    let paused: unknown;
    try {
      guard.reserve("r", 8); // > 7, 미승인
    } catch (e) {
      paused = e;
    }
    expect(paused).toBeInstanceOf(SoftCapPause);
  });

  it("병렬 예약 합산으로 동시 초과를 막는다", () => {
    const guard = new CostGuard({ softCapUsd: 100, hardCapUsd: 10 });
    guard.reserve("r", 4); // 예약 4
    guard.reserve("r", 4); // 예약 8
    expect(() => guard.reserve("r", 4)).toThrow(HardCapExceededError); // 12 > 10 (사후정산 전에도 차단)
  });

  it("실패한 호출은 예약 해제로 예산 회복", () => {
    const guard = new CostGuard({ softCapUsd: 100, hardCapUsd: 10 });
    guard.reserve("r", 9);
    guard.release("r", 9);
    expect(() => guard.reserve("r", 9)).not.toThrow();
  });
});

describe("parity 하니스 — claude-p vs api 동형 출력", () => {
  it("두 백엔드가 스키마-동형 출력을 내면 파싱 결과가 동일", async () => {
    const payload = { title: "동일 제목", reason: "동일 근거" };
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
    const a = await callLLM<{ title: string; reason: string }>(BASE_REQ, { config: cfg({ backend: "claude-p" }), costGuard: guard, driver: fakeDriver("claude-p", payload) });
    const b = await callLLM<{ title: string; reason: string }>({ ...BASE_REQ, runId: "run-test-2" }, { config: cfg({ backend: "api" }), costGuard: guard, driver: fakeDriver("api", payload) });
    expect(a.data).toEqual(b.data); // parity: 동일 입력 → 동일 스키마-통과 결과
    expect(a.promptHash).toBe(b.promptHash); // 동일 프롬프트 해시(재현성)
  });
});
