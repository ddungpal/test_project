// YouTube Analytics 어댑터(운영 자동화 ① Sub-B) — 영상별 윈도우 성과(조회수·CTR·시청지속률)를 수집.
//   ★ CTR·평균시청률은 '채널 소유자' 비공개 지표 → API 키 불가, OAuth2 필수(youtubeAnalytics.readonly).
//   ★ 개발 $0: search()와 동일한 record/replay fixture. 라이브(record)는 OAuth 필요 → 추후 연결.
//   ★ A/B 썸네일/제목 변형 CTR은 Analytics API가 노출하지 않음 → overall 지표만. A/B는 수동 입력 유지.

import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import type { MetricWindow } from "./types.js";

const FIX_DIR = "fixtures/performance/youtube";
const ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2/reports";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface YtMetrics {
  views: number | null;
  ctr: number | null; // 노출 클릭률 %(impressionsClickThroughRate × 100)
  avgViewPct: number | null; // 평균 시청 지속률 %(averageViewPercentage)
}

export interface YtFetchReq {
  videoId: string;
  window: MetricWindow;
  startDate: string; // YYYY-MM-DD (업로드일)
  endDate: string; // YYYY-MM-DD (업로드일 + 윈도우 일수)
}

export interface YtBackend {
  name: string;
  run(req: YtFetchReq): Promise<YtMetrics>;
}

/** fixture 키 — videoId+window+기간. */
function ytHash(req: YtFetchReq): string {
  return createHash("sha256")
    .update(JSON.stringify({ v: req.videoId, w: req.window, s: req.startDate, e: req.endDate }))
    .digest("hex")
    .slice(0, 16);
}

/** 결정적 mock 백엔드($0) — 라이브 OAuth 없이 오케스트레이션을 검증할 때 주입. videoId 해시로 그럴듯한 수치. */
export const mockYtBackend: YtBackend = {
  name: "mock",
  run: async (req) => {
    const h = parseInt(createHash("sha256").update(req.videoId + req.window).digest("hex").slice(0, 8), 16);
    const windowMul: Record<MetricWindow, number> = { d1: 1, d7: 4, d14: 6, d30: 8 };
    return {
      views: (1000 + (h % 9000)) * windowMul[req.window],
      ctr: Number((3 + (h % 50) / 10).toFixed(1)), // 3.0~7.9%
      avgViewPct: Number((30 + (h % 200) / 10).toFixed(1)), // 30~49.9%
    };
  },
};

/** 운영 백엔드 — YouTube Analytics reports.query. OAuth access token 필요(record/live). */
export const youtubeAnalyticsBackend: YtBackend = {
  name: "youtube",
  run: async (req) => {
    const token = await getYoutubeAccessToken();
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate: req.startDate,
      endDate: req.endDate,
      metrics: "views,averageViewPercentage,impressions,impressionsClickThroughRate",
      filters: `video==${req.videoId}`,
    });
    const res = await fetch(`${ANALYTICS_API}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`YouTube Analytics ${res.status}: ${(await res.text()).slice(0, 300)}`); // 응답 본문 절단(영속 로그 유출 최소화)
    const json = (await res.json()) as { columnHeaders?: { name: string }[]; rows?: number[][] };
    const cols = (json.columnHeaders ?? []).map((c) => c.name);
    const row = json.rows?.[0] ?? [];
    const get = (name: string): number | null => {
      const i = cols.indexOf(name);
      return i >= 0 && typeof row[i] === "number" ? (row[i] as number) : null;
    };
    const ctrRatio = get("impressionsClickThroughRate"); // 0~1
    return {
      views: get("views"),
      ctr: ctrRatio !== null ? Number((ctrRatio * 100).toFixed(2)) : null,
      avgViewPct: get("averageViewPercentage"),
    };
  },
};

/** 자동 수집 백엔드 — PERFORMANCE_SOURCE=youtube 일 때만 실수집. 그 외(개발 기본=manual)는 null=자동 수집 비활성.
 *  ★ 개발은 '수동 입력' 원칙 → cron이 mock 데이터를 DB에 박지 않게 null. mock 백엔드는 테스트/스크립트가 명시 주입. */
export function pickYtBackend(): YtBackend | null {
  return process.env.PERFORMANCE_SOURCE === "youtube" ? youtubeAnalyticsBackend : null;
}

/**
 * 영상 윈도우 성과 1건 — record/replay fixture로 감싼다(개발 $0·결정적).
 *   replay: fixture만(없으면 에러). record: 없으면 backend 호출 후 저장. mock 백엔드는 항상 라이브($0).
 */
export async function fetchYtMetrics(req: YtFetchReq, deps: { backend: YtBackend }): Promise<YtMetrics> {
  const backend = deps.backend;
  const fixtures = process.env.PERFORMANCE_FIXTURES ?? "record";

  // mock은 결정적·$0 → fixture 불필요. youtube(실 API)만 캐시.
  const useFixture = backend.name === "youtube" && fixtures !== "off";
  if (useFixture) {
    const path = join(FIX_DIR, `${ytHash(req)}.json`);
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as YtMetrics;
    if (fixtures === "replay") throw new Error(`YT 성과 fixture 없음(replay): ${path} — PERFORMANCE_FIXTURES=record로 먼저 녹화`);
    const metrics = await backend.run(req);
    mkdirSync(FIX_DIR, { recursive: true });
    const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(tmp, JSON.stringify(metrics, null, 2));
    renameSync(tmp, path);
    return metrics;
  }
  return backend.run(req);
}

/** refresh token → access token 교환(운영 record/live 전용). env: YT_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN. */
export async function getYoutubeAccessToken(): Promise<string> {
  const clientId = process.env.YT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YT_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YT_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YouTube Analytics OAuth 미설정(YT_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN) — 채널 인증 1회 필요.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error(`OAuth 토큰 교환 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`); // 응답 본문 절단
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("OAuth 응답에 access_token 없음.");
  return json.access_token;
}
