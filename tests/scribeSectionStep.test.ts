// 짠펜 섹션 격리 생성(scribeSectionStep) 회귀 가드.
//   배경: 8개 섹션을 한 번에 쓰면 (dev claude-p는 maxTokens 미사용) 섹션당 ~675자에서 천장을 친다.
//   섹션을 하나씩 격리 생성하면 경쟁 섹션이 없어 더 길게 전개된다는 가설 → 섹션 하나만 쓰는 스텝.
//   ① SCRIBE_SECTION_DIRECTIVE에 연속성(prior_tail 이어받기)·섹션 분량(900~1,200자) 문구가 존재.
//   ② 스코핑 불변식: 섹션 모드(scribeSectionStep) system엔 SECTION_DIRECTIVE 포함 & LENGTH_DIRECTIVE 미포함.
//      persona 있을 때 PERSONA_DIRECTIVE도 포함.
//   scribeLengthTarget 미러 — fake driver로 callLLM에 넘어가는 system 문자열을 캡처한다(step.ts가 system을 합성).
import { describe, it, expect } from "vitest";
import { scribeSectionStep } from "../src/agents/scribe/step.js";
import {
  SCRIBE_SYSTEM,
  SCRIBE_SECTION_DIRECTIVE,
  SCRIBE_LENGTH_DIRECTIVE,
  SCRIBE_PERSONA_DIRECTIVE,
} from "../src/agents/scribe/schema.js";
import { CostGuard } from "../src/llm/costGuard.js";
import type { LlmConfig } from "../src/llm/config.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";

// 섹션 모드 출력(segments 배열, minItems:1 허용)을 반환하는 캡처 driver.
function makeSectionDriver() {
  const captured: { system?: string; input?: unknown } = {};
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke({ system, input }) {
      captured.system = system;
      captured.input = input;
      return {
        rawJson: JSON.stringify({
          segments: [
            { ord: 0, text: "섹션 도입", used_fact_idxs: [], used_asset_idxs: [] },
            { ord: 1, text: "섹션 본문", used_fact_idxs: [], used_asset_idxs: [] },
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

const sectionInput = {
  tone: {},
  section: { section: "이 섹션 제목", goal: "목표", why: "이유", format: "explain" },
  sectionIndex: 1,
  totalSections: 8,
  prior_tail: "직전까지 작성된 대본의 마지막 문장.",
  facts: [],
  assets: [],
};

describe("SCRIBE_SECTION_DIRECTIVE 문구", () => {
  it("연속성(prior_tail 이어받기) 문구가 있다", () => {
    expect(SCRIBE_SECTION_DIRECTIVE).toContain("연속성");
    expect(SCRIBE_SECTION_DIRECTIVE).toContain("prior_tail");
    expect(SCRIBE_SECTION_DIRECTIVE).toContain("이어서 시작");
  });

  it("섹션 분량(900~1,200자) 문구가 있다", () => {
    expect(SCRIBE_SECTION_DIRECTIVE).toContain("섹션 분량");
    expect(SCRIBE_SECTION_DIRECTIVE).toContain("900~1,200자");
  });

  it("부분 생성 선언·규칙 승계 문구가 있다", () => {
    expect(SCRIBE_SECTION_DIRECTIVE).toContain("섹션 부분 생성");
    expect(SCRIBE_SECTION_DIRECTIVE).toContain("규칙 승계");
    expect(SCRIBE_SECTION_DIRECTIVE).toContain("전역 인덱스");
  });

  it("SCRIBE_SYSTEM 본문엔 섹션 지시가 포함돼 있지 않다(별도 상수 — 본문 미오염)", () => {
    expect(SCRIBE_SYSTEM).not.toContain(SCRIBE_SECTION_DIRECTIVE);
  });
});

describe("스코핑 불변식 — 섹션 모드 system", () => {
  it("섹션 모드(scribeSectionStep) system엔 SECTION_DIRECTIVE가 포함된다", async () => {
    const { driver, captured } = makeSectionDriver();
    await scribeSectionStep(makeLlm(driver), "run-sec", sectionInput);
    expect(captured.system).toContain(SCRIBE_SECTION_DIRECTIVE);
  });

  it("섹션 모드 system엔 LENGTH_DIRECTIVE가 없다(전체 vs 섹션 분량 목표 충돌 방지)", async () => {
    const { driver, captured } = makeSectionDriver();
    await scribeSectionStep(makeLlm(driver), "run-sec", sectionInput);
    expect(captured.system).not.toContain(SCRIBE_LENGTH_DIRECTIVE);
  });

  it("persona 없으면 PERSONA_DIRECTIVE가 없다", async () => {
    const { driver, captured } = makeSectionDriver();
    await scribeSectionStep(makeLlm(driver), "run-sec", sectionInput);
    expect(captured.system).not.toContain(SCRIBE_PERSONA_DIRECTIVE);
  });

  it("persona 있으면 PERSONA_DIRECTIVE도 포함된다", async () => {
    const { driver, captured } = makeSectionDriver();
    await scribeSectionStep(makeLlm(driver), "run-sec", {
      ...sectionInput,
      target_persona: "2030 사회초년생, 첫 월급 굴리기 막막한 사람",
    });
    expect(captured.system).toContain(SCRIBE_SECTION_DIRECTIVE);
    expect(captured.system).toContain(SCRIBE_PERSONA_DIRECTIVE);
  });
});

describe("섹션 모드 입력 조립", () => {
  it("llmInput에 section·prior_tail·sectionIndex·totalSections가 담긴다", async () => {
    const { driver, captured } = makeSectionDriver();
    await scribeSectionStep(makeLlm(driver), "run-sec", sectionInput);
    const inp = captured.input as Record<string, unknown>;
    expect(inp.section).toEqual(sectionInput.section);
    expect(inp.prior_tail).toBe(sectionInput.prior_tail);
    expect(inp.sectionIndex).toBe(1);
    expect(inp.totalSections).toBe(8);
  });

  it("persona 없으면 llmInput에 target_persona 키가 없다", async () => {
    const { driver, captured } = makeSectionDriver();
    await scribeSectionStep(makeLlm(driver), "run-sec", sectionInput);
    const inp = captured.input as Record<string, unknown>;
    expect("target_persona" in inp).toBe(false);
  });
});
