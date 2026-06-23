// 성과 수집 자동화(① Sub-B) 단위 테스트 — 순수 윈도우 로직 + mock 백엔드 결정성. 라이브는 mock 주입.
import { describe, it, expect } from "vitest";
import { dueWindows, windowDateRange, WINDOW_DAYS } from "../src/performance/collect.js";
import { mockYtBackend, pickYtBackend } from "../src/performance/youtubeAnalytics.js";

describe("윈도우 기간(windowDateRange)", () => {
  it("업로드 후 첫 N일(inclusive end = start + N-1)", () => {
    expect(windowDateRange("2026-06-01", "d1")).toEqual({ startDate: "2026-06-01", endDate: "2026-06-01" }); // 1일
    expect(windowDateRange("2026-06-01", "d7")).toEqual({ startDate: "2026-06-01", endDate: "2026-06-07" }); // 7일
    expect(windowDateRange("2026-06-01", "d30")).toEqual({ startDate: "2026-06-01", endDate: "2026-06-30" }); // 30일
  });
});

describe("도래 윈도우(dueWindows)", () => {
  it("경과일 ≥ 윈도우일수인 것만", () => {
    // 업로드 후 10일 → d1·d7 도래, d14·d30 미도래.
    expect(dueWindows("2026-06-01", "2026-06-11", [])).toEqual(["d1", "d7"]);
  });
  it("이미 수집된 윈도우 제외(멱등)", () => {
    expect(dueWindows("2026-06-01", "2026-06-11", ["d1"])).toEqual(["d7"]);
  });
  it("업로드 당일 → 도래 없음", () => {
    expect(dueWindows("2026-06-01", "2026-06-01", [])).toEqual([]);
  });
  it("30일+ 경과 → 전 윈도우 도래", () => {
    expect(dueWindows("2026-05-01", "2026-06-11", [])).toEqual(["d1", "d7", "d14", "d30"]);
  });
  it("WINDOW_DAYS 매핑", () => {
    expect(WINDOW_DAYS).toEqual({ d1: 1, d7: 7, d14: 14, d30: 30 });
  });
});

describe("mock 백엔드(mockYtBackend)", () => {
  it("결정적 — 같은 입력 같은 출력", async () => {
    const a = await mockYtBackend.run({ videoId: "abc", window: "d7", startDate: "2026-06-01", endDate: "2026-06-08" });
    const b = await mockYtBackend.run({ videoId: "abc", window: "d7", startDate: "2026-06-01", endDate: "2026-06-08" });
    expect(a).toEqual(b);
    expect(a.ctr).toBeGreaterThanOrEqual(3);
    expect(a.ctr).toBeLessThan(8);
    expect(a.avgViewPct).toBeGreaterThanOrEqual(30);
  });
  it("윈도우 클수록 조회수 증가(d1<d30)", async () => {
    const d1 = await mockYtBackend.run({ videoId: "x", window: "d1", startDate: "2026-06-01", endDate: "2026-06-02" });
    const d30 = await mockYtBackend.run({ videoId: "x", window: "d30", startDate: "2026-06-01", endDate: "2026-07-01" });
    expect((d30.views ?? 0)).toBeGreaterThan(d1.views ?? 0);
  });
});

describe("자동 수집 게이트(pickYtBackend)", () => {
  it("PERFORMANCE_SOURCE 미설정/manual → null(자동 수집 비활성)", () => {
    const prev = process.env.PERFORMANCE_SOURCE;
    delete process.env.PERFORMANCE_SOURCE;
    expect(pickYtBackend()).toBeNull();
    process.env.PERFORMANCE_SOURCE = "manual";
    expect(pickYtBackend()).toBeNull();
    if (prev === undefined) delete process.env.PERFORMANCE_SOURCE;
    else process.env.PERFORMANCE_SOURCE = prev;
  });
});
