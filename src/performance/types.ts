// 성과 수집(Phase 4) — 입력 스키마 + 파싱·검증. 코드 전용·LLM 0회(거버넌스 C).
//   개발: fixtures/performance/manual.json 을 사람이 직접 채움(이 타입이 계약).
//   운영: YouTube Analytics API 가 같은 PerformanceEntry[] 를 생성 → 동일 writer(ingest.ts) 재사용.

import type { Json } from "../lib/supabase/database.types.js";

export const METRIC_WINDOWS = ["d1", "d7", "d14", "d30"] as const;
export type MetricWindow = (typeof METRIC_WINDOWS)[number];

export const AB_COMPONENTS = ["title", "thumbnail"] as const;
export type AbComponent = (typeof AB_COMPONENTS)[number];

export const AB_VARIANTS = ["A", "B", "C"] as const;
export type AbVariantKey = (typeof AB_VARIANTS)[number];

/** 한 영상의 윈도우별 종합 성과(A/B 무관 — performance_metrics.ab_variant='overall'). */
export interface MetricInput {
  window: MetricWindow;
  views?: number | null;
  ctr?: number | null; // 노출 클릭률 % (예: 6.4)
  avg_view_pct?: number | null; // 평균 시청 지속률 % (예: 38.5)
  traffic_source?: Json | null;
}

/** 썸네일/제목 A·B·C 변형의 성과(회수 → 훅이 환류). */
export interface AbInput {
  component: AbComponent;
  variant: AbVariantKey;
  ctr_pct?: number | null;
  impressions?: number | null;
  payload?: Json | null; // 변형 식별용(예: { label: "직설형" })
}

/** 한 영상 단위 입력. content_id 또는 youtube_video_id 중 하나로 영상 지정(둘 다 있으면 content_id 우선). */
export interface PerformanceEntry {
  content_id?: string;
  youtube_video_id?: string;
  metrics: MetricInput[];
  ab?: AbInput[];
}

export interface PerformanceFile {
  entries: PerformanceEntry[];
}

/** 사람이 채운 파일(또는 운영 페이로드)을 검증. throw 대신 명확한 에러 메시지 모음 반환. */
export function parsePerformanceFile(raw: unknown): { entries: PerformanceEntry[]; errors: string[] } {
  const errors: string[] = [];
  if (raw === null || typeof raw !== "object" || !Array.isArray((raw as { entries?: unknown }).entries)) {
    return { entries: [], errors: ["최상위에 entries 배열이 필요합니다."] };
  }
  const entries: PerformanceEntry[] = [];
  (raw as { entries: unknown[] }).entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    if (e === null || typeof e !== "object") {
      errors.push(`${at}: 객체가 아닙니다.`);
      return;
    }
    const obj = e as Record<string, unknown>;
    const cid = typeof obj.content_id === "string" ? obj.content_id.trim() : "";
    const vid = typeof obj.youtube_video_id === "string" ? obj.youtube_video_id.trim() : "";
    if (!cid && !vid) {
      errors.push(`${at}: content_id 또는 youtube_video_id 중 하나가 필요합니다.`);
      return;
    }
    const metricsRaw = Array.isArray(obj.metrics) ? obj.metrics : [];
    const metrics: MetricInput[] = [];
    metricsRaw.forEach((m, j) => {
      const mo = m as Record<string, unknown>;
      const w = mo?.window;
      if (typeof w !== "string" || !(METRIC_WINDOWS as readonly string[]).includes(w)) {
        errors.push(`${at}.metrics[${j}]: window 는 ${METRIC_WINDOWS.join("|")} 중 하나여야 합니다(받음: ${String(w)}).`);
        return;
      }
      metrics.push({
        window: w as MetricWindow,
        views: numOrNull(mo.views),
        ctr: numOrNull(mo.ctr),
        avg_view_pct: numOrNull(mo.avg_view_pct),
        traffic_source: (mo.traffic_source ?? null) as Json | null,
      });
    });
    if (metrics.length === 0) errors.push(`${at}: metrics 가 비었습니다(최소 1개 윈도우).`);
    // 같은 window 중복은 멱등 upsert(onConflict)에서 "한 행 두 번 갱신" 에러를 낸다 → 파싱 단계에서 차단.
    const seenWindow = new Set<string>();
    for (const m of metrics) {
      if (seenWindow.has(m.window)) errors.push(`${at}: metric window 중복: ${m.window}`);
      seenWindow.add(m.window);
    }

    const abRaw = Array.isArray(obj.ab) ? obj.ab : [];
    const ab: AbInput[] = [];
    abRaw.forEach((a, j) => {
      const ao = a as Record<string, unknown>;
      const comp = ao?.component;
      const variant = ao?.variant;
      if (typeof comp !== "string" || !(AB_COMPONENTS as readonly string[]).includes(comp)) {
        errors.push(`${at}.ab[${j}]: component 는 ${AB_COMPONENTS.join("|")} 중 하나여야 합니다.`);
        return;
      }
      if (typeof variant !== "string" || !(AB_VARIANTS as readonly string[]).includes(variant)) {
        errors.push(`${at}.ab[${j}]: variant 는 ${AB_VARIANTS.join("|")} 중 하나여야 합니다.`);
        return;
      }
      ab.push({
        component: comp as AbComponent,
        variant: variant as AbVariantKey,
        ctr_pct: numOrNull(ao.ctr_pct),
        impressions: numOrNull(ao.impressions),
        payload: (ao.payload ?? null) as Json | null,
      });
    });

    // 같은 (component, variant) 중복도 upsert "한 행 두 번 갱신" 에러 → 차단.
    const seenAb = new Set<string>();
    for (const a of ab) {
      const k = `${a.component}:${a.variant}`;
      if (seenAb.has(k)) errors.push(`${at}: A/B 변형 중복: ${k}`);
      seenAb.add(k);
    }

    const parsed: PerformanceEntry = { metrics };
    if (cid) parsed.content_id = cid;
    if (vid) parsed.youtube_video_id = vid;
    if (ab.length) parsed.ab = ab;
    entries.push(parsed);
  });
  return { entries, errors };
}

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
