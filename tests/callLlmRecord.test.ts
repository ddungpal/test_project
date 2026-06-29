// record-after-validate 회귀 가드 — callLLM의 record 모드는 스키마 검증을 통과한 출력만 녹화해야 한다.
//   과거 버그: 검증 *전*에 saveFixture가 불려 불량 rawJson이 박제 → record가 그걸 리플레이해 영구 실패,
//   claude-p 2회 재시도도 무력화. ★ '불량 출력은 saveFixture 0회'가 이 step의 핵심 회귀 가드.
//   fixtures 모듈을 모킹해 실제 파일 쓰기를 막는다(fixtures/parity/* stray 파일 생성 금지 — rules.md).
import { describe, it, expect, vi, beforeEach } from "vitest";

// fixtures 모듈 모킹: saveFixture는 spy(파일 안 씀), loadFixture는 null(픽스처 없음 → 실호출 경로),
//   FixtureMissError는 실제 클래스 유지(replay 경로 의미 보존).
const saveFixtureSpy = vi.fn();
const loadFixtureSpy = vi.fn(() => null);
vi.mock("../src/llm/fixtures.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    saveFixture: (...args: unknown[]) => saveFixtureSpy(...args),
    loadFixture: (...args: unknown[]) => loadFixtureSpy(...(args as [])),
  };
});

import { callLLM } from "../src/llm/callLLM.js";
import { CostGuard } from "../src/llm/costGuard.js";
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
  runId: "run-record-1",
};

// parity.test.ts 패턴 미러: 단일 페이로드를 매번 반환하는 드라이버.
function fakeDriver(name: "claude-p" | "api", payload: object): LlmBackendDriver {
  return {
    name,
    async invoke() {
      return { rawJson: JSON.stringify(payload), usage: { inTok: 1000, outTok: 200, cachedInTok: 0 } };
    },
  };
}

// invoke 호출 횟수에 따라 다른 페이로드를 내는 드라이버(1차 불량 → 2차 유효 시나리오용).
function sequenceDriver(name: "claude-p" | "api", payloads: object[]): LlmBackendDriver {
  let n = 0;
  return {
    name,
    async invoke() {
      const payload = payloads[Math.min(n, payloads.length - 1)]!;
      n += 1;
      return { rawJson: JSON.stringify(payload), usage: { inTok: 1000, outTok: 200, cachedInTok: 0 } };
    },
  };
}

function cfg(over: Partial<LlmConfig> = {}): LlmConfig {
  return { backend: "claude-p", fixtures: "off", copyGenMode: "hybrid", softCapUsd: 7, hardCapUsd: 10, maxRework: 2, research: { maxClaims: 4, maxConcepts: 4, koreanOfficialDomains: [], claimsPerSection: 1.5, conceptsPerSection: 1, floor: 2, ceiling: 8 }, search: { defaultTtlSeconds: 86_400, volatilityTtlSeconds: { static: 2_592_000, slow: 604_800, fast: 3_600 } }, ab: { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3, viewsConfFloor: 0.5 }, ...over };
}

describe("callLLM record 모드 — 검증 통과분만 녹화", () => {
  beforeEach(() => {
    saveFixtureSpy.mockClear();
    loadFixtureSpy.mockClear();
    loadFixtureSpy.mockReturnValue(null); // 픽스처 없음 → 실호출 경로
  });

  it("불량 출력은 박제하지 않는다 — claude-p 2회 시도 후 SchemaValidationError + saveFixture 0회 (회귀 가드)", async () => {
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
    await expect(
      callLLM(BASE_REQ, {
        config: cfg({ fixtures: "record" }),
        costGuard: guard,
        driver: fakeDriver("claude-p", { title: "제목만", missing: "reason" }), // reason 누락 → 스키마 위반
      }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
    expect(saveFixtureSpy).not.toHaveBeenCalled();
  });

  it("유효 출력은 record 모드에서 saveFixture 1회 + 정상 반환", async () => {
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
    const res = await callLLM<{ title: string; reason: string }>(BASE_REQ, {
      config: cfg({ fixtures: "record" }),
      costGuard: guard,
      driver: fakeDriver("claude-p", { title: "파킹통장 200%", reason: "검색 급증" }),
    });
    expect(res.data.title).toBe("파킹통장 200%");
    expect(res.provider).toBe("claude-p");
    expect(saveFixtureSpy).toHaveBeenCalledTimes(1);
    // 녹화 페이로드는 검증 통과한 유효 rawJson이어야 한다.
    const rec = saveFixtureSpy.mock.calls[0]![0] as { rawJson: string };
    expect(JSON.parse(rec.rawJson)).toEqual({ title: "파킹통장 200%", reason: "검색 급증" });
  });

  it("claude-p 1차 불량·2차 유효 → 최종 성공 + saveFixture 1회(유효분만)", async () => {
    const guard = new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
    const res = await callLLM<{ title: string; reason: string }>(BASE_REQ, {
      config: cfg({ fixtures: "record" }),
      costGuard: guard,
      driver: sequenceDriver("claude-p", [
        { title: "1차 불량" }, // reason 누락 → 위반
        { title: "2차 유효", reason: "재시도 성공" },
      ]),
    });
    expect(res.data.reason).toBe("재시도 성공");
    expect(saveFixtureSpy).toHaveBeenCalledTimes(1);
    const rec = saveFixtureSpy.mock.calls[0]![0] as { rawJson: string };
    expect(JSON.parse(rec.rawJson)).toEqual({ title: "2차 유효", reason: "재시도 성공" });
  });
});
