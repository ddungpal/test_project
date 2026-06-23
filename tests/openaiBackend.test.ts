// OpenAI 백엔드 배선 — 골든 A/B(GPT 비교)용. config 수용 + backend별 단가 라우팅.
import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "../src/llm/config.js";
import { computeCostUsd, estimateMaxCostUsd } from "../src/llm/pricing.js";

const SAVED = { ...process.env };
afterEach(() => {
  process.env = { ...SAVED };
});

describe("config: LLM_BACKEND=openai 수용", () => {
  it("openai 백엔드를 허용한다", () => {
    process.env.LLM_BACKEND = "openai";
    expect(loadConfig().backend).toBe("openai");
  });
  it("알 수 없는 백엔드는 거부한다", () => {
    process.env.LLM_BACKEND = "gemini";
    expect(() => loadConfig()).toThrow(/LLM_BACKEND/);
  });
});

describe("pricing: backend별 단가 라우팅", () => {
  it("openai는 env 단가(OPENAI_IN/OUT_PER_M)를 쓴다", () => {
    process.env.OPENAI_IN_PER_M = "10";
    process.env.OPENAI_OUT_PER_M = "30";
    // 1000 in · 1000 out → (1000*10 + 1000*30)/1e6 = 0.04
    const cost = computeCostUsd("opus", { inTok: 1000, outTok: 1000, cachedInTok: 0 }, "openai");
    expect(cost).toBeCloseTo(0.04, 6);
  });
  it("anthropic(api) 단가는 티어(opus)표를 쓴다 — openai와 다르다", () => {
    process.env.OPENAI_IN_PER_M = "10";
    process.env.OPENAI_OUT_PER_M = "30";
    // opus: in 15 / out 75 → (1000*15 + 1000*75)/1e6 = 0.09
    const cost = computeCostUsd("opus", { inTok: 1000, outTok: 1000, cachedInTok: 0 }, "api");
    expect(cost).toBeCloseTo(0.09, 6);
  });
  it("기본 backend 인자 생략 시 anthropic 동작(하위호환)", () => {
    const a = computeCostUsd("sonnet", { inTok: 1000, outTok: 0, cachedInTok: 0 });
    // sonnet in 3 → 0.003
    expect(a).toBeCloseTo(0.003, 6);
  });
  it("estimateMaxCostUsd도 openai 단가 + 안전계수(1.25)를 반영", () => {
    process.env.OPENAI_IN_PER_M = "10";
    process.env.OPENAI_OUT_PER_M = "30";
    // (1000*10 + 1000*30)/1e6 = 0.04 → *1.25 = 0.05
    const est = estimateMaxCostUsd("opus", 1000, 1000, "openai");
    expect(est).toBeCloseTo(0.05, 6);
  });
});
