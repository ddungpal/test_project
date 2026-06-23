// 성과 수집 오케스트레이션(운영 자동화 ① Sub-B) — 발행 영상의 '도래한' 윈도우 성과를 모아 적재.
//   순수 로직(dueWindows·windowDateRange)은 테스트, 라이브는 YouTube Analytics 어댑터(개발은 mock/$0).
//   ★ 멱등: 이미 적재된 윈도우는 다시 안 부른다(API 호출·과금 절약). performance_metrics가 진실.

import type { Supa } from "../pipeline/runState.js";
import { loadConfig, type LlmConfig } from "../llm/config.js";
import { METRIC_WINDOWS, type MetricWindow, type PerformanceEntry } from "./types.js";
import { ingestPerformance } from "./ingest.js";
import { fetchYtMetrics, pickYtBackend, type YtBackend } from "./youtubeAnalytics.js";

export const WINDOW_DAYS: Record<MetricWindow, number> = { d1: 1, d7: 7, d14: 14, d30: 30 };

/** 'YYYY-MM-DD' → UTC epoch days(정수). 시간대 비의존(날짜만). */
function toDays(ymd: string): number {
  return Math.floor(Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`) / 86_400_000);
}
function fromDays(days: number): string {
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

/** 윈도우의 수집 기간 = 업로드 후 첫 N일. YouTube Analytics start/endDate는 둘 다 inclusive →
 *  endDate = 업로드일 + (N-1) 이어야 정확히 N일(예: d7 = day0~day6). +N이면 N+1일로 하루 과집계. */
export function windowDateRange(uploadDate: string, window: MetricWindow): { startDate: string; endDate: string } {
  const start = toDays(uploadDate);
  return { startDate: fromDays(start), endDate: fromDays(start + WINDOW_DAYS[window] - 1) };
}

/** 도래한 윈도우(순수) — 업로드 후 충분히 지났고(asOf-업로드 ≥ 일수) 아직 적재 안 된 것만. */
export function dueWindows(uploadDate: string, asOf: string, alreadyCollected: string[]): MetricWindow[] {
  const elapsed = toDays(asOf) - toDays(uploadDate);
  const done = new Set(alreadyCollected);
  return METRIC_WINDOWS.filter((w) => elapsed >= WINDOW_DAYS[w] && !done.has(w));
}

export interface CollectResult {
  contents: number; // 처리(수집 발생)한 콘텐츠 수
  fetches: number; // 어댑터 호출(윈도우) 수
  collectedContentIds: string[];
}

/**
 * 발행 영상(youtube_video_id + upload_date)의 도래 윈도우 성과를 수집→적재.
 *   supa=admin. backend 미지정 시 env(PERFORMANCE_SOURCE)로 선택. asOf 미지정 시 오늘.
 *   limit=1회 처리 콘텐츠 상한(운영 API 비용 가드).
 */
export async function collectPerformance(
  supa: Supa,
  deps: { backend?: YtBackend; asOf?: string; limit?: number; config?: LlmConfig } = {},
): Promise<CollectResult> {
  const config = deps.config ?? loadConfig();
  const asOf = deps.asOf ?? new Date().toISOString().slice(0, 10);
  const limit = deps.limit ?? 50;

  // 백엔드 결정 — 미주입 시 env. null(개발 기본=manual)이면 자동 수집 비활성 → no-op($0·수동 입력 보존).
  const backend = deps.backend ?? pickYtBackend();
  if (!backend) return { contents: 0, fetches: 0, collectedContentIds: [] };

  const { data: contents, error } = await supa
    .from("contents")
    .select("id, youtube_video_id, upload_date")
    .not("youtube_video_id", "is", null)
    .not("upload_date", "is", null)
    // 안정 정렬(오래된 영상 먼저) — limit 하에서 결정적·공정 처리. 없으면 매 실행 다른 부분집합을 집는다.
    .order("upload_date", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`contents 조회 실패: ${error.message}`);

  const result: CollectResult = { contents: 0, fetches: 0, collectedContentIds: [] };

  for (const c of contents ?? []) {
    if (result.contents >= limit) break;
    const uploadDate = c.upload_date as string;

    // 이미 적재된 overall 윈도우.
    const { data: existing, error: ee } = await supa
      .from("performance_metrics")
      .select("metric_window")
      .eq("content_id", c.id)
      .eq("ab_variant", "overall");
    if (ee) throw new Error(`performance_metrics 조회 실패: ${ee.message}`);
    const collected = (existing ?? []).map((r) => r.metric_window as string);

    const due = dueWindows(uploadDate, asOf, collected);
    if (due.length === 0) continue;

    const metrics = [];
    for (const window of due) {
      const { startDate, endDate } = windowDateRange(uploadDate, window);
      const m = await fetchYtMetrics({ videoId: c.youtube_video_id as string, window, startDate, endDate }, { backend });
      result.fetches += 1;
      metrics.push({ window, views: m.views, ctr: m.ctr, avg_view_pct: m.avgViewPct });
    }

    // A/B 변형 CTR은 Analytics API 미제공 → overall 윈도우만(A/B는 수동 입력 유지).
    const entry: PerformanceEntry = { content_id: c.id, metrics };
    await ingestPerformance(supa, [entry], config.ab, { nowIso: `${asOf}T00:00:00Z` });
    result.contents += 1;
    result.collectedContentIds.push(c.id);
  }

  return result;
}
