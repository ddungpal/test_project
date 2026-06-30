// viewsPerSubscriber 순수함수 단위테스트(outlier-refs step0).
//   배수 = viewCount / subscriberCount. 데이터 부족·비유한·≤0·구독자 바닥 미만이면 null.
//   thumbnailUrl 수집은 네트워크(searchYouTube)라 단위테스트 생략 — 순수 헬퍼만 검증.

import { describe, expect, it } from "vitest";
import { viewsPerSubscriber } from "../src/agents/topic_scout/externalSignals.js";

describe("viewsPerSubscriber", () => {
  it("정상 배수: 조회 50만 / 구독 1만 = 50", () => {
    expect(viewsPerSubscriber(500_000, 10_000)).toBe(50);
  });

  it("구독자 null → null", () => {
    expect(viewsPerSubscriber(500_000, null)).toBeNull();
  });

  it("구독자 0 → null(0 나눗셈 방지)", () => {
    expect(viewsPerSubscriber(500_000, 0)).toBeNull();
  });

  it("조회수 null → null", () => {
    expect(viewsPerSubscriber(null, 10_000)).toBeNull();
  });

  it("조회수 0/음수 → null", () => {
    expect(viewsPerSubscriber(0, 10_000)).toBeNull();
    expect(viewsPerSubscriber(-100, 10_000)).toBeNull();
  });

  it("undefined·NaN·Infinity → null(비유한 방어)", () => {
    expect(viewsPerSubscriber(undefined, 10_000)).toBeNull();
    expect(viewsPerSubscriber(500_000, undefined)).toBeNull();
    expect(viewsPerSubscriber(NaN, 10_000)).toBeNull();
    expect(viewsPerSubscriber(Infinity, 10_000)).toBeNull();
    expect(viewsPerSubscriber(500_000, NaN)).toBeNull();
  });

  it("floorSubs 미만 채널 → null(초소형 채널 과장 배수 노이즈 컷)", () => {
    // 구독 10명·조회 1만 = 1000배지만 floorSubs 1000 미만이라 컷.
    expect(viewsPerSubscriber(10_000, 10, 1000)).toBeNull();
  });

  it("floorSubs 이상이면 정상 계산", () => {
    expect(viewsPerSubscriber(500_000, 10_000, 1000)).toBe(50);
    // 경계: 정확히 floorSubs면 통과(< 만 컷).
    expect(viewsPerSubscriber(2000, 1000, 1000)).toBe(2);
  });
});
