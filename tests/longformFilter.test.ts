// parseISODurationSec·isLongform 순수함수 단위테스트(longform-refs step0).
//   YouTube API엔 Shorts 플래그가 없어 영상 길이(contentDetails.duration, ISO 8601)로만 판별.
//   롱폼 최소 길이(SHORTS_MAX_SEC) 이하면 숏폼/짧은 클립으로 보고 제외.
//   길이 미상(null)은 반드시 통과 — stats가 quota 실패로 비면 전부 null이 되는데 여기서 드롭하면 풀 전멸.
//   네트워크(videos.list)는 단위테스트 생략 — 순수 파싱/판별부만 검증.

import { describe, expect, it } from "vitest";
import { SHORTS_MAX_SEC, isLongform, parseISODurationSec } from "../src/agents/topic_scout/externalSignals.js";

describe("parseISODurationSec", () => {
  it("초만: PT45S = 45", () => {
    expect(parseISODurationSec("PT45S")).toBe(45);
  });

  it("분초: PT1M30S = 90", () => {
    expect(parseISODurationSec("PT1M30S")).toBe(90);
  });

  it("분만: PT15M = 900", () => {
    expect(parseISODurationSec("PT15M")).toBe(900);
  });

  it("시분초: PT1H2M3S = 3723", () => {
    expect(parseISODurationSec("PT1H2M3S")).toBe(3723);
  });

  it("시만: PT2H = 7200", () => {
    expect(parseISODurationSec("PT2H")).toBe(7200);
  });

  it("빈 문자열 → null", () => {
    expect(parseISODurationSec("")).toBeNull();
  });

  it("null/undefined → null", () => {
    expect(parseISODurationSec(null)).toBeNull();
    expect(parseISODurationSec(undefined)).toBeNull();
  });

  it('깨진 형식("PT") → null', () => {
    expect(parseISODurationSec("PT")).toBeNull();
  });

  it('깨진 형식("15:00") → null', () => {
    expect(parseISODurationSec("15:00")).toBeNull();
  });
});

describe("isLongform", () => {
  it("기준 이하(30) → false(숏폼)", () => {
    expect(isLongform(30)).toBe(false);
  });

  it("기준 이하(60) → false(숏폼)", () => {
    expect(isLongform(60)).toBe(false);
  });

  it("정확히 SHORTS_MAX_SEC → false(이하 제외)", () => {
    expect(isLongform(SHORTS_MAX_SEC)).toBe(false);
  });

  it("기준 초과(SHORTS_MAX_SEC+1) → true(롱폼)", () => {
    expect(isLongform(SHORTS_MAX_SEC + 1)).toBe(true);
  });

  it("기준 초과(900) → true(롱폼)", () => {
    expect(isLongform(900)).toBe(true);
  });

  it("null → true(길이 미상은 통과 — 풀 전멸 방지)", () => {
    expect(isLongform(null)).toBe(true);
  });
});
