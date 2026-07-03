import { describe, it, expect } from "vitest";
import { isOnboardingArcStale } from "../src/lib/onboarding/staleness.js";

describe("isOnboardingArcStale", () => {
  it("소스 주제가 없으면(undefined/null/빈문자열) false — 구버전 아크 오경보 방지", () => {
    expect(isOnboardingArcStale(undefined, "커버드콜 ETF")).toBe(false);
    expect(isOnboardingArcStale(null, "커버드콜 ETF")).toBe(false);
    expect(isOnboardingArcStale("", "커버드콜 ETF")).toBe(false);
    expect(isOnboardingArcStale("   ", "커버드콜 ETF")).toBe(false);
  });

  it("현재 주제가 없으면(undefined/null/빈문자열) false", () => {
    expect(isOnboardingArcStale("커버드콜 ETF", undefined)).toBe(false);
    expect(isOnboardingArcStale("커버드콜 ETF", null)).toBe(false);
    expect(isOnboardingArcStale("커버드콜 ETF", "")).toBe(false);
    expect(isOnboardingArcStale("커버드콜 ETF", "   ")).toBe(false);
  });

  it("같은 제목이면 false", () => {
    expect(isOnboardingArcStale("커버드콜 ETF", "커버드콜 ETF")).toBe(false);
  });

  it("다른 제목이면 true", () => {
    expect(isOnboardingArcStale("커버드콜 ETF", "월배당 ETF")).toBe(true);
  });

  it("앞뒤 공백만 다르면 false — trim 후 비교", () => {
    expect(isOnboardingArcStale("  커버드콜 ETF  ", "커버드콜 ETF")).toBe(false);
    expect(isOnboardingArcStale("커버드콜 ETF", "  커버드콜 ETF  ")).toBe(false);
  });
});
