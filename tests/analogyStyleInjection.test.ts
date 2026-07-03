// 비유 스타일 환류(analogy-learning Step3) — active 비유 프로필을 유이(analogist) system 에 주입.
//   (1) appendAnalogyStyle(순수): 프로필 null → 원본 그대로(바이트 동일 → promptHash 불변).
//   (2) patterns 비었음(빈 객체/필드 없음) → 원본 그대로.
//   (3) 정상 patterns → 반환에 "비유 기법" 섹션·techniques 값·style: id 표기 포함.
//   (4) 유이 step 회귀: analogyStyle 미전달({concepts,facts}만) → callLLM 에 넘어간 system == ANALOGIST_SYSTEM,
//       input == {concepts,facts}(analogyStyle 미포함). driver 스텁으로 캡처(vi.fn 지양 — 캡처 변수).
import { describe, it, expect } from "vitest";
import { appendAnalogyStyle, type ActiveAnalogyStyle } from "../src/agents/shared/analogyStyle.js";
import { analogyStep } from "../src/agents/analogist/step.js";
import { ANALOGIST_SYSTEM } from "../src/agents/analogist/schema.js";
import { CostGuard } from "../src/llm/costGuard.js";
import type { LlmConfig } from "../src/llm/config.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";

const SYS = "너는 유이다. 비유 자산을 만든다.";

describe("appendAnalogyStyle — 비면 원본(해시 불변)", () => {
  it("프로필 null 이면 system 원본 그대로(바이트 동일)", () => {
    expect(appendAnalogyStyle(SYS, null)).toBe(SYS);
  });

  it("patterns 가 빈 객체면 원본 그대로", () => {
    const profile: ActiveAnalogyStyle = { id: "style:abc", version: 1, patterns: {} };
    expect(appendAnalogyStyle(SYS, profile)).toBe(SYS);
  });

  it("patterns 가 null/배열/문자열이면 원본 그대로(깨진 입력 방어)", () => {
    expect(appendAnalogyStyle(SYS, { id: "style:a", version: 1, patterns: null })).toBe(SYS);
    expect(appendAnalogyStyle(SYS, { id: "style:a", version: 1, patterns: [] })).toBe(SYS);
    expect(appendAnalogyStyle(SYS, { id: "style:a", version: 1, patterns: "nope" })).toBe(SYS);
  });
});

describe("appendAnalogyStyle — 정상 patterns면 지시 섹션 append", () => {
  const profile: ActiveAnalogyStyle = {
    id: "style:uuid-123",
    version: 3,
    patterns: {
      techniques: ["추상 수치를 눈에 보이는 물리량으로 대입"],
      target_domains: ["음식", "몸"],
      do: ["규모 변화를 동작으로 보여줌"],
      banned: ["또 다른 전문용어로 비유"],
      distortion_guard: "쉽게 만들되 사실을 왜곡하지 마라",
    },
  };

  it("반환은 원본 system 으로 시작하고 뒤에 비유 기법 섹션이 붙는다", () => {
    const out = appendAnalogyStyle(SYS, profile);
    expect(out.startsWith(SYS)).toBe(true);
    expect(out).not.toBe(SYS);
    expect(out).toContain("비유 기법");
  });

  it("techniques 값·친숙 영역·장치·금지·왜곡 방지·style: id 표기를 포함한다", () => {
    const out = appendAnalogyStyle(SYS, profile);
    expect(out).toContain("추상 수치를 눈에 보이는 물리량으로 대입");
    expect(out).toContain("음식");
    expect(out).toContain("규모 변화를 동작으로 보여줌");
    expect(out).toContain("또 다른 전문용어로 비유");
    expect(out).toContain("쉽게 만들되 사실을 왜곡하지 마라");
    expect(out).toContain("style:uuid-123");
  });

  it("★ 예시 소재 재사용 금지 가드를 반드시 포함한다(기법만 배우고 소재는 새로)", () => {
    const out = appendAnalogyStyle(SYS, profile);
    // 유이가 레퍼런스의 구체 소재(바나나·물 등)를 그대로 베끼지 못하게 하는 명시적 금지 문구.
    expect(out).toContain("배우는 것은 '기법'이지 '소재'가 아니다");
    expect(out).toContain("그대로 가져다 쓰지 마라");
    expect(out).toContain("완전히 새로운 비유를 직접 만들어라");
  });
});

// ── (4) 유이 step 회귀: analogyStyle 미전달 시 system/input 불변 ──────────────
function makeConfig(): LlmConfig {
  return {
    backend: "claude-p", fixtures: "off", copyGenMode: "hybrid",
    softCapUsd: 7, hardCapUsd: 10, maxRework: 2,
    research: { maxClaims: 4, maxConcepts: 4, koreanOfficialDomains: [], claimsPerSection: 1.5, conceptsPerSection: 1, floor: 2, ceiling: 8 },
    search: { defaultTtlSeconds: 86400, volatilityTtlSeconds: { static: 1, slow: 1, fast: 1 } },
    ab: { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3, viewsConfFloor: 0.5 },
  };
}

// driver.invoke 가 받은 req 를 캡처하는 스텁(vi.fn 대신 캡처 변수 — rules.md).
function makeCapturingDriver() {
  const captured: { system?: string; input?: unknown }[] = [];
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke({ system, input }) {
      captured.push({ system, input });
      // 스키마상 assets 최소 1개 필요 — 캡처만 목적이므로 최소 유효 자산 1개 반환.
      return { rawJson: JSON.stringify({ assets: [{ concept: "복리", analogy: "눈덩이", distortion_note: "없음" }] }), usage };
    },
  };
  return { driver, captured };
}

describe("analogyStep — analogyStyle 미전달 시 회귀(system/input 불변)", () => {
  const cfg = makeConfig();
  const llmBase = { config: cfg, costGuard: new CostGuard({ softCapUsd: cfg.softCapUsd, hardCapUsd: cfg.hardCapUsd }) };
  const input = {
    concepts: [{ name: "복리", needs_number: false, needs_analogy: true }],
    facts: [{ claim: "주장", verification_status: "verified" as const, quote_excerpt: null }],
  };

  it("analogyStyle 을 넘기지 않으면 system == ANALOGIST_SYSTEM, input == {concepts,facts}", async () => {
    const { driver, captured } = makeCapturingDriver();
    await analogyStep({ ...llmBase, driver }, "run1", input);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.system).toBe(ANALOGIST_SYSTEM);
    expect(captured[0]!.input).toEqual({ concepts: input.concepts, facts: input.facts });
  });

  it("analogyStyle=null 이어도 system == ANALOGIST_SYSTEM(명시적 null 도 불변)", async () => {
    const { driver, captured } = makeCapturingDriver();
    await analogyStep({ ...llmBase, driver }, "run1", { ...input, analogyStyle: null });
    expect(captured[0]!.system).toBe(ANALOGIST_SYSTEM);
    expect(captured[0]!.input).toEqual({ concepts: input.concepts, facts: input.facts });
  });

  it("active 프로필을 넘기면 system 에 비유 기법 섹션이 실린다(주입 경로)", async () => {
    const { driver, captured } = makeCapturingDriver();
    const analogyStyle: ActiveAnalogyStyle = {
      id: "style:xyz", version: 1, patterns: { techniques: ["대입"], distortion_guard: "왜곡 금지" },
    };
    await analogyStep({ ...llmBase, driver }, "run1", { ...input, analogyStyle });
    expect(captured[0]!.system).toContain("비유 기법");
    expect(captured[0]!.system).toContain("style:xyz");
    // ★ input 은 여전히 concepts/facts 만 — analogyStyle 은 system 에만 반영(input 오염 금지).
    expect(captured[0]!.input).toEqual({ concepts: input.concepts, facts: input.facts });
  });
});
