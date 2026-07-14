// 짠펜 부분 모드(scribeSegmentStep) 배선 — step2(단일 세그먼트 재생성).
//   핵심: ① 부분 모드 input에 reason·target·neighbors가 실리고, system에 SCRIBE_SEGMENT_DIRECTIVE가 append된다.
//        ② SCRIBE_SYSTEM 본문은 SEGMENT_DIRECTIVE를 포함하지 않는다(별도 상수 — 본문 미오염·promptHash 보존).
//        ③ target_persona는 있을 때만 input 키 + PERSONA_DIRECTIVE append.
//   scribePersonaWiring 미러(fake driver로 LlmRequest system/input 캡처).
import { describe, it, expect } from "vitest";
import { scribeSegmentStep } from "../src/agents/scribe/step.js";
import { SCRIBE_SYSTEM, SCRIBE_LENGTH_DIRECTIVE, SCRIBE_SEGMENT_DIRECTIVE, SCRIBE_PERSONA_DIRECTIVE } from "../src/agents/scribe/schema.js";
import { CostGuard } from "../src/llm/costGuard.js";
import type { LlmConfig } from "../src/llm/config.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";

const PERSONA = "2030 사회초년생, 첫 월급 굴리는 법 막막한 사람";

function makeCapturingDriver() {
  const captured: { system?: string; input?: unknown } = {};
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke({ system, input }) {
      captured.system = system;
      captured.input = input;
      // SCRIBE_SEGMENT_SCHEMA 통과용 최소 출력(세그먼트 1개).
      return {
        rawJson: JSON.stringify({ text: "다시 쓴 본문", used_fact_idxs: [], used_asset_idxs: [] }),
        usage,
      };
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

const BASE_INPUT = {
  tone: { vocab: ["짠"] },
  reason: "예시를 좀 더 쉽게",
  target: "원래 이 세그먼트 본문",
  neighbors: { prev: "앞 세그먼트", next: "뒤 세그먼트" },
  facts: [],
  assets: [],
};

describe("scribeSegmentStep 배선 — 부분 모드", () => {
  it("input에 reason·target·neighbors가 실리고 system에 SEGMENT_DIRECTIVE가 append된다", async () => {
    const { driver, captured } = makeCapturingDriver();
    await scribeSegmentStep(makeLlm(driver), "run-A", { ...BASE_INPUT });

    const input = captured.input as { reason: string; target: string; neighbors: { prev?: string; next?: string } };
    expect(input.reason).toBe("예시를 좀 더 쉽게");
    expect(input.target).toBe("원래 이 세그먼트 본문");
    expect(input.neighbors).toEqual({ prev: "앞 세그먼트", next: "뒤 세그먼트" });
    // system = SCRIBE_SYSTEM 본문 보존 + SEGMENT_DIRECTIVE append
    expect(captured.system).toContain(SCRIBE_SYSTEM);
    expect(captured.system).toContain(SCRIBE_SEGMENT_DIRECTIVE);
  });

  it("persona 없으면 input에 target_persona 키 없음·PERSONA_DIRECTIVE 미포함", async () => {
    const { driver, captured } = makeCapturingDriver();
    await scribeSegmentStep(makeLlm(driver), "run-B", { ...BASE_INPUT });
    expect("target_persona" in (captured.input as object)).toBe(false);
    expect(captured.system).not.toContain(SCRIBE_PERSONA_DIRECTIVE);
  });

  it("persona 있으면 input 키 + PERSONA_DIRECTIVE append(SEGMENT_DIRECTIVE와 병존)", async () => {
    const { driver, captured } = makeCapturingDriver();
    await scribeSegmentStep(makeLlm(driver), "run-C", { ...BASE_INPUT, target_persona: PERSONA });
    expect((captured.input as { target_persona?: string }).target_persona).toBe(PERSONA);
    expect(captured.system).toContain(SCRIBE_SEGMENT_DIRECTIVE);
    expect(captured.system).toContain(SCRIBE_PERSONA_DIRECTIVE);
  });
});

describe("SCRIBE_SYSTEM 본문 불변(promptHash 보존)", () => {
  it("SCRIBE_SYSTEM 본문에 SEGMENT_DIRECTIVE가 포함되어 있지 않다(별도 상수)", () => {
    expect(SCRIBE_SYSTEM).not.toContain(SCRIBE_SEGMENT_DIRECTIVE);
    expect(SCRIBE_SEGMENT_DIRECTIVE).toContain("부분 모드");
  });

  it("full-mode scribeStep의 system은 SCRIBE_SYSTEM + LENGTH_DIRECTIVE이고 SEGMENT_DIRECTIVE는 미포함(persona 없을 때)", async () => {
    // full-mode 회귀 가드 — 부분 모드 상수 추가가 full-mode system을 오염시키지 않았는지.
    //   (길이 지시는 full 모드에 항상 붙는다 → 더는 SCRIBE_SYSTEM과 바이트 동일이 아니다. 스코핑은 scribeLengthTarget.test에서 잠근다.)
    const { scribeStep } = await import("../src/agents/scribe/step.js");
    const { driver, captured } = makeCapturingDriver();
    // full-mode driver는 segments 배열을 반환해야 한다(SCRIBE_SCHEMA).
    const fullDriver: LlmBackendDriver = {
      name: "claude-p",
      async invoke({ system, input }) {
        captured.system = system;
        captured.input = input;
        return {
          rawJson: JSON.stringify({
            segments: [
              { ord: 0, text: "도입", used_fact_idxs: [], used_asset_idxs: [] },
              { ord: 1, text: "본문", used_fact_idxs: [], used_asset_idxs: [] },
              { ord: 2, text: "마무리", used_fact_idxs: [], used_asset_idxs: [] },
            ],
          }),
          usage: { inTok: 10, outTok: 10, cachedInTok: 0 },
        };
      },
    };
    void driver;
    await scribeStep(makeLlm(fullDriver), "run-full", { tone: {}, outline: {}, facts: [], assets: [] });
    expect(captured.system).toBe(`${SCRIBE_SYSTEM}\n${SCRIBE_LENGTH_DIRECTIVE}`);
    expect(captured.system).not.toContain(SCRIBE_SEGMENT_DIRECTIVE); // 부분 모드 지시는 full-mode에 새지 않는다.
  });
});
