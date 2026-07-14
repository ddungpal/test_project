// 짠펜(scribe) target_persona 조건부 주입 배선 — step2(전파).
//   핵심: ① persona 있으면 scribeStep이 callLLM(driver)에 넘기는 input에 target_persona 포함 + system에 페르소나 지시 append.
//        ② persona 없으면 input에 target_persona 키 없음 + system이 SCRIBE_SYSTEM과 바이트 동일(회귀 가드 = 픽스처 해시 보존).
//        ③ scriptCell이 topic payload에서 persona를 읽어 scribeStep에 전달하는지도 잠근다(end-to-end 배선).
//   fake driver로 LlmRequest(system/input)를 캡처. structurerPrepareWiring 미러(짠펜은 system 합성이 step.ts라 driver 캡처).
import { describe, it, expect } from "vitest";
import { scribeStep } from "../src/agents/scribe/step.js";
import { SCRIBE_SYSTEM, SCRIBE_LENGTH_DIRECTIVE, SCRIBE_PERSONA_DIRECTIVE } from "../src/agents/scribe/schema.js";
import { CostGuard } from "../src/llm/costGuard.js";
import type { LlmConfig } from "../src/llm/config.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";

const PERSONA = "2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람";

// scribeStep이 callLLM에 넘긴 system/input을 캡처하는 driver(claude-p=$0, fixtures off에서 실호출 경로).
function makeCapturingDriver() {
  const captured: { system?: string; input?: unknown } = {};
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke({ system, input }) {
      captured.system = system;
      captured.input = input;
      // 스키마 통과용 최소 출력(segments minItems:3).
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

const BASE_INPUT = { tone: { vocab: ["짠"] }, outline: { sections: [] }, facts: [], assets: [] };

describe("scribeStep 배선 — target_persona 조건부 주입", () => {
  it("케이스 A: target_persona가 있으면 callLLM input에 그 값이 실리고, system에 페르소나 지시가 append된다", async () => {
    const { driver, captured } = makeCapturingDriver();
    await scribeStep(makeLlm(driver), "run-A", { ...BASE_INPUT, target_persona: PERSONA });

    expect((captured.input as { target_persona?: string }).target_persona).toBe(PERSONA);
    expect(captured.system).toContain(SCRIBE_PERSONA_DIRECTIVE);
    expect(captured.system).toContain(SCRIBE_SYSTEM); // 기존 본문은 보존되고 뒤에 지시가 붙는다.
    expect(captured.system).not.toBe(SCRIBE_SYSTEM); // append되어 더 길다.
  });

  it("케이스 B(회귀 가드): target_persona가 없으면 input에 키 자체가 없고 system이 SCRIBE_SYSTEM과 바이트 동일(promptHash 보존)", async () => {
    const { driver, captured } = makeCapturingDriver();
    await scribeStep(makeLlm(driver), "run-B", { ...BASE_INPUT });

    expect("target_persona" in (captured.input as object)).toBe(false);
    // persona 없으면 system = SCRIBE_SYSTEM + LENGTH_DIRECTIVE(길이 지시는 full 모드에 항상 붙음). PERSONA_DIRECTIVE는 미포함.
    expect(captured.system).toBe(`${SCRIBE_SYSTEM}\n${SCRIBE_LENGTH_DIRECTIVE}`);
    expect(captured.system).not.toContain(SCRIBE_PERSONA_DIRECTIVE);
  });

  it("케이스 C: target_persona가 빈 문자열이면 주입하지 않는다(truthy일 때만 — persona 미주입)", async () => {
    const { driver, captured } = makeCapturingDriver();
    await scribeStep(makeLlm(driver), "run-C", { ...BASE_INPUT, target_persona: "" });

    expect("target_persona" in (captured.input as object)).toBe(false);
    expect(captured.system).toBe(`${SCRIBE_SYSTEM}\n${SCRIBE_LENGTH_DIRECTIVE}`);
    expect(captured.system).not.toContain(SCRIBE_PERSONA_DIRECTIVE);
  });

  it("케이스 D: SCRIBE_PERSONA_DIRECTIVE는 SCRIBE_SYSTEM 본문에 포함되어 있지 않다(별도 상수 — 본문 미오염)", () => {
    expect(SCRIBE_SYSTEM).not.toContain(SCRIBE_PERSONA_DIRECTIVE);
    expect(SCRIBE_PERSONA_DIRECTIVE).toContain("target_persona");
  });
});
