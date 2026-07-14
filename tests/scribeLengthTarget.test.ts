// 짠펜 목표 분량 지시(scribe-length-directive) 회귀 가드.
//   배경: 대본이 너무 짧다(≈5.8분, 김짠부 평균 12.5분의 절반). 세그먼트 품질은 정상, 오직 '양'만 문제.
//   ① SCRIBE_LENGTH_DIRECTIVE에 목표 분량·깊이·중복금지 양립 문구가 존재.
//   ② 스코핑 불변식: full 모드(scribeStep) system엔 길이 지시 포함 / 단일 세그먼트 모드(scribeSegmentStep) system엔 미포함.
//   scribePersonaWiring 미러 — fake driver로 callLLM에 넘어가는 system 문자열을 캡처한다(step.ts가 system을 합성하므로).
import { describe, it, expect } from "vitest";
import { scribeStep, scribeSegmentStep } from "../src/agents/scribe/step.js";
import { SCRIBE_SYSTEM, SCRIBE_LENGTH_DIRECTIVE } from "../src/agents/scribe/schema.js";
import { CostGuard } from "../src/llm/costGuard.js";
import type { LlmConfig } from "../src/llm/config.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";

// full 모드 출력(segments minItems:3)을 반환하는 캡처 driver.
function makeFullDriver() {
  const captured: { system?: string } = {};
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke({ system }) {
      captured.system = system;
      return {
        rawJson: JSON.stringify({
          segments: [
            { ord: 0, text: "도입", used_fact_idxs: [], used_asset_idxs: [] },
            { ord: 1, text: "본문", used_fact_idxs: [], used_asset_idxs: [] },
            { ord: 2, text: "마무리", used_fact_idxs: [], used_asset_idxs: [] },
          ],
        }),
        usage,
      };
    },
  };
  return { driver, captured };
}

// 단일 세그먼트 모드 출력(세그먼트 1개)을 반환하는 캡처 driver.
function makeSegmentDriver() {
  const captured: { system?: string } = {};
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke({ system }) {
      captured.system = system;
      return { rawJson: JSON.stringify({ text: "다시 쓴 본문", used_fact_idxs: [], used_asset_idxs: [] }), usage };
    },
  };
  return { driver, captured };
}

function makeConfig(): LlmConfig {
  return {
    backend: "claude-p", fixtures: "off", copyGenMode: "hybrid",
    softCapUsd: 7, hardCapUsd: 10, maxRework: 2,
    research: { maxClaims: 4, maxConcepts: 4, koreanOfficialDomains: ["nts.go.kr"], claimsPerSection: 1.5, conceptsPerSection: 1, floor: 2, ceiling: 8 },
    search: { defaultTtlSeconds: 86400, volatilityTtlSeconds: { static: 1, slow: 1, fast: 1 } },
    ab: { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3, viewsConfFloor: 0.5 },
  };
}

function makeLlm(driver: LlmBackendDriver) {
  return { config: makeConfig(), costGuard: new CostGuard({ softCapUsd: 7, hardCapUsd: 10 }), driver };
}

describe("SCRIBE_LENGTH_DIRECTIVE 문구", () => {
  it("목표 분량 문구가 있다(10~15분·최소 7,000자)", () => {
    expect(SCRIBE_LENGTH_DIRECTIVE).toContain("목표 분량");
    expect(SCRIBE_LENGTH_DIRECTIVE).toContain("7,000");
    expect(SCRIBE_LENGTH_DIRECTIVE).toContain("10~15분");
  });

  it("깊이로 채운다·중복금지 양립·억지 금지 문구가 있다", () => {
    expect(SCRIBE_LENGTH_DIRECTIVE).toContain("깊이로 채운다");
    expect(SCRIBE_LENGTH_DIRECTIVE).toContain("중복 금지");
    expect(SCRIBE_LENGTH_DIRECTIVE).toContain("억지 금지");
  });

  it("SCRIBE_SYSTEM 본문엔 길이 지시가 포함돼 있지 않다(별도 상수 — 본문 미오염)", () => {
    expect(SCRIBE_SYSTEM).not.toContain(SCRIBE_LENGTH_DIRECTIVE);
  });
});

describe("스코핑 불변식 — full 모드에만 길이 지시", () => {
  it("full 모드(scribeStep) system엔 길이 지시가 포함된다", async () => {
    const { driver, captured } = makeFullDriver();
    await scribeStep(makeLlm(driver), "run-full", { tone: {}, outline: {}, facts: [], assets: [] });
    expect(captured.system).toContain(SCRIBE_LENGTH_DIRECTIVE);
  });

  it("단일 세그먼트 모드(scribeSegmentStep) system엔 길이 지시가 없다(promptHash 불변)", async () => {
    const { driver, captured } = makeSegmentDriver();
    await scribeSegmentStep(makeLlm(driver), "run-seg", {
      tone: {},
      reason: "예시를 더 쉽게",
      target: "원래 본문",
      neighbors: { prev: "앞", next: "뒤" },
      facts: [],
      assets: [],
    });
    expect(captured.system).not.toContain(SCRIBE_LENGTH_DIRECTIVE);
  });
});
