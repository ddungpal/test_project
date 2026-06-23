// 성과 수집 자동화(① Sub-B) 단위 테스트 — 순수 윈도우 로직 + mock 백엔드 결정성. 라이브는 mock 주입.
//   + OAuth 토큰 파싱(순수) + collectPerformance end-to-end(인메모리 fake Supa·멱등). 네트워크·실 OAuth·실 DB 0.
import { describe, it, expect } from "vitest";
import { collectPerformance, dueWindows, windowDateRange, WINDOW_DAYS } from "../src/performance/collect.js";
import { mockYtBackend, pickYtBackend, parseTokenResponse, requireOauthEnv } from "../src/performance/youtubeAnalytics.js";
import type { LlmConfig } from "../src/llm/config.js";
import type { Supa } from "../src/pipeline/runState.js";

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

describe("OAuth 토큰 응답(parseTokenResponse·requireOauthEnv 순수)", () => {
  it("access_token(비빈 string) 있으면 반환", () => {
    expect(parseTokenResponse({ access_token: "ya29.fake" })).toBe("ya29.fake");
  });
  it("없음·빈문자·타입오류·비객체 → throw(실토큰 무관)", () => {
    expect(() => parseTokenResponse({})).toThrow("access_token 없음");
    expect(() => parseTokenResponse({ access_token: "" })).toThrow();
    expect(() => parseTokenResponse({ access_token: 123 })).toThrow();
    expect(() => parseTokenResponse(null)).toThrow();
  });
  it("env 셋 다 있으면 반환 / 누락 시 throw(process.env 비오염 — 가짜 env 주입)", () => {
    expect(
      requireOauthEnv({ YT_OAUTH_CLIENT_ID: "i", YT_OAUTH_CLIENT_SECRET: "s", YT_OAUTH_REFRESH_TOKEN: "r" }),
    ).toEqual({ clientId: "i", clientSecret: "s", refreshToken: "r" });
    expect(() => requireOauthEnv({ YT_OAUTH_CLIENT_ID: "i" })).toThrow("OAuth 미설정");
  });
});

// --- collectPerformance end-to-end: 인메모리 fake Supa(네트워크·실 DB 0) ---
interface ContentRow {
  id: string;
  youtube_video_id: string;
  upload_date: string;
}
interface PerfRow {
  content_id: string;
  metric_window: string;
  ab_variant: string;
}

/** collect/ingest가 부르는 supa 호출만 흉내내는 최소 fake. upsert는 perf 배열에 반영 → 다음 read에서 멱등 성립. */
function makeFakeSupa(contents: ContentRow[], perf: PerfRow[]): Supa {
  const builder = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let op: "select" | "upsert" | "update" | "delete" = "select";
    let payload: unknown = null;
    const findFilter = (col: string): unknown => filters.find((f) => f[0] === col)?.[1];

    const resolveSingle = () => {
      if (table === "contents") {
        const id = findFilter("id");
        const yt = findFilter("youtube_video_id");
        const row = contents.find(
          (c) => (id !== undefined && c.id === id) || (yt !== undefined && c.youtube_video_id === yt),
        );
        return { data: row ? { id: row.id } : null, error: null };
      }
      return { data: null, error: null };
    };
    const resolveMany = () => {
      if (op === "upsert" && table === "performance_metrics") {
        for (const r of (payload as PerfRow[]) ?? []) {
          const dup = perf.some(
            (p) => p.content_id === r.content_id && p.metric_window === r.metric_window && p.ab_variant === r.ab_variant,
          );
          if (!dup) perf.push({ content_id: r.content_id, metric_window: r.metric_window, ab_variant: r.ab_variant });
        }
        return { data: null, error: null };
      }
      if (op === "update" || op === "delete") return { data: null, error: null };
      if (table === "contents") {
        return {
          data: contents.map((c) => ({ id: c.id, youtube_video_id: c.youtube_video_id, upload_date: c.upload_date })),
          error: null,
        };
      }
      if (table === "performance_metrics") {
        const cid = findFilter("content_id");
        const av = findFilter("ab_variant");
        const rows = perf
          .filter((p) => p.content_id === cid && (av === undefined || p.ab_variant === av))
          .map((p) => ({ metric_window: p.metric_window }));
        return { data: rows, error: null };
      }
      return { data: [], error: null };
    };

    const api = {
      select: () => api,
      not: () => api,
      order: () => api,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return api;
      },
      upsert: (rows: unknown) => {
        op = "upsert";
        payload = rows;
        return api;
      },
      update: (patch: unknown) => {
        op = "update";
        payload = patch;
        return api;
      },
      delete: () => {
        op = "delete";
        return api;
      },
      maybeSingle: () => Promise.resolve(resolveSingle()),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(resolveMany()).then(res, rej),
    };
    return api;
  };
  return { from: (t: string) => builder(t) } as unknown as Supa;
}

const FAKE_CONFIG = { ab: { decisiveMargin: 0.1, marginalMargin: 0.03 } } as unknown as LlmConfig;

describe("수집 오케스트레이션(collectPerformance · mock 백엔드 · fake Supa)", () => {
  it("도래 윈도우 전부 수집·적재(d1·d7·d14·d30)", async () => {
    const perf: PerfRow[] = [];
    const supa = makeFakeSupa([{ id: "c1", youtube_video_id: "v1", upload_date: "2026-05-01" }], perf);
    const r = await collectPerformance(supa, { backend: mockYtBackend, asOf: "2026-06-11", config: FAKE_CONFIG });
    expect(r.fetches).toBe(4);
    expect(r.contents).toBe(1);
    expect(r.collectedContentIds).toEqual(["c1"]);
    expect(perf.map((p) => p.metric_window).sort()).toEqual(["d1", "d14", "d30", "d7"]);
  });

  it("멱등 — 같은 supa로 2회차는 0 fetch(이미 적재 전부 스킵)", async () => {
    const perf: PerfRow[] = [];
    const supa = makeFakeSupa([{ id: "c1", youtube_video_id: "v1", upload_date: "2026-05-01" }], perf);
    await collectPerformance(supa, { backend: mockYtBackend, asOf: "2026-06-11", config: FAKE_CONFIG });
    const r2 = await collectPerformance(supa, { backend: mockYtBackend, asOf: "2026-06-11", config: FAKE_CONFIG });
    expect(r2.fetches).toBe(0);
    expect(r2.contents).toBe(0);
  });

  it("부분 도래 — 7일 경과 시 d1·d7만(d14·d30 미도래)", async () => {
    const perf: PerfRow[] = [];
    const supa = makeFakeSupa([{ id: "c1", youtube_video_id: "v1", upload_date: "2026-06-01" }], perf);
    const r = await collectPerformance(supa, { backend: mockYtBackend, asOf: "2026-06-08", config: FAKE_CONFIG });
    expect(r.fetches).toBe(2);
    expect(perf.map((p) => p.metric_window).sort()).toEqual(["d1", "d7"]);
  });

  it("limit 존중 — 3편·limit 1 → 1편만 처리", async () => {
    const perf: PerfRow[] = [];
    const supa = makeFakeSupa(
      [
        { id: "c1", youtube_video_id: "v1", upload_date: "2026-05-01" },
        { id: "c2", youtube_video_id: "v2", upload_date: "2026-05-01" },
        { id: "c3", youtube_video_id: "v3", upload_date: "2026-05-01" },
      ],
      perf,
    );
    const r = await collectPerformance(supa, { backend: mockYtBackend, asOf: "2026-06-11", limit: 1, config: FAKE_CONFIG });
    expect(r.contents).toBe(1);
  });

  it("자동수집 비활성(PERFORMANCE_SOURCE 미설정·backend 미주입) → no-op($0)", async () => {
    const prev = process.env.PERFORMANCE_SOURCE;
    delete process.env.PERFORMANCE_SOURCE;
    const perf: PerfRow[] = [];
    const supa = makeFakeSupa([{ id: "c1", youtube_video_id: "v1", upload_date: "2026-05-01" }], perf);
    const r = await collectPerformance(supa, { asOf: "2026-06-11", config: FAKE_CONFIG });
    expect(r).toEqual({ contents: 0, fetches: 0, collectedContentIds: [] });
    expect(perf.length).toBe(0);
    if (prev === undefined) delete process.env.PERFORMANCE_SOURCE;
    else process.env.PERFORMANCE_SOURCE = prev;
  });
});
