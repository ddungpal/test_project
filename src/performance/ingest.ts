// 성과 적재(Phase 4) — performance_metrics·ab_variants 멱등 upsert + contents.ab_* 캐시 파생.
//   코드 전용·LLM 0회(거버넌스 C). 개발=수동 입력 파일, 운영=YouTube Analytics → 동일 진입점.
//   ★ 멱등: performance_metrics(content_id,metric_window,ab_variant) / ab_variants(content_id,component_type,variant)
//     의 unique 제약으로 upsert → 같은 입력 N회 적재해도 행 수 불변(재실행 안전).

import type { Supa } from "../pipeline/runState.js";
import type { TablesInsert } from "../lib/supabase/database.types.js";
import type { AbThresholds } from "./abVerdict.js";
import { judgeComponent, pickContentVerdict } from "./abVerdict.js";
import { AB_COMPONENTS, type AbComponent, type PerformanceEntry } from "./types.js";

export interface IngestResult {
  contents: number; // 처리한 영상 수
  metrics: number; // upsert 한 performance_metrics 행 수
  abVariants: number; // upsert 한 ab_variants 행 수
  decided: number; // A/B 결과 확정된 영상 수
  skipped: { ref: string; reason: string }[]; // content 미해석 등
}

/**
 * 입력(개발=수동 파일 / 운영=Analytics)을 받아 성과를 적재. supa = service-role(admin).
 *   - performance_metrics: 윈도우별 종합 성과(ab_variant='overall').
 *   - ab_variants: 썸네일/제목 변형 CTR + 판정(rank·is_winner). contents.ab_* 는 여기서 파생.
 */
export async function ingestPerformance(
  supa: Supa,
  entries: PerformanceEntry[],
  thresholds: AbThresholds,
  opts: { nowIso?: string } = {},
): Promise<IngestResult> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const result: IngestResult = { contents: 0, metrics: 0, abVariants: 0, decided: 0, skipped: [] };

  for (const entry of entries) {
    const ref = entry.content_id ?? entry.youtube_video_id ?? "(미상)";
    const contentId = await resolveContentId(supa, entry);
    if (!contentId) {
      result.skipped.push({ ref, reason: "contents 에서 영상을 찾지 못함(content_id/youtube_video_id 확인)" });
      continue;
    }
    result.contents += 1;

    // 1) 종합 성과(performance_metrics) — 윈도우별 1행, ab_variant='overall'.
    const metricRows: TablesInsert<"performance_metrics">[] = entry.metrics.map((m) => ({
      content_id: contentId,
      metric_window: m.window,
      views: m.views ?? null,
      ctr: m.ctr ?? null,
      avg_view_pct: m.avg_view_pct ?? null,
      traffic_source: m.traffic_source ?? null,
      ab_variant: "overall",
      recorded_at: nowIso,
    }));
    if (metricRows.length) {
      const { error } = await supa.from("performance_metrics").upsert(metricRows, { onConflict: "content_id,metric_window,ab_variant" });
      if (error) throw new Error(`performance_metrics upsert 실패(${ref}): ${error.message}`);
      result.metrics += metricRows.length;
    }

    // 2) A/B 회수(ab_variants) + contents.ab_* 캐시 파생.
    if (entry.ab && entry.ab.length) {
      const verdicts = AB_COMPONENTS.map((component: AbComponent) => {
        const vs = entry
          .ab!.filter((a) => a.component === component)
          .map((a) => ({ variant: a.variant, ctr_pct: a.ctr_pct ?? null, impressions: a.impressions ?? null }));
        return vs.length ? judgeComponent(component, vs, thresholds) : null;
      }).filter((v): v is NonNullable<typeof v> => v !== null);

      const abRows: TablesInsert<"ab_variants">[] = [];
      for (const v of verdicts) {
        for (const rv of v.ranked) {
          const src = entry.ab!.find((a) => a.component === v.component && a.variant === rv.variant);
          abRows.push({
            content_id: contentId,
            component_type: v.component,
            variant: rv.variant,
            payload: src?.payload ?? null,
            ctr_pct: rv.ctr_pct ?? null,
            impressions: src?.impressions ?? null,
            weight: null,
            rank: rv.rank,
            is_winner: rv.is_winner,
          });
        }
      }
      if (abRows.length) {
        const { error } = await supa.from("ab_variants").upsert(abRows, { onConflict: "content_id,component_type,variant" });
        if (error) throw new Error(`ab_variants upsert 실패(${ref}): ${error.message}`);
        result.abVariants += abRows.length;
      }

      // contents.ab_* = ab_variants 에서 파생되는 캐시(단일 출처 → 드리프트 차단).
      const pick = pickContentVerdict(verdicts);
      const patch = pick
        ? { ab_margin: pick.margin, ab_decisiveness: pick.decisiveness, ab_result_status: "decided" as const }
        : { ab_margin: null, ab_decisiveness: null, ab_result_status: "pending" as const };
      const { error: ce } = await supa.from("contents").update(patch).eq("id", contentId);
      if (ce) throw new Error(`contents ab_* 갱신 실패(${ref}): ${ce.message}`);
      if (pick) result.decided += 1;
    }
  }
  return result;
}

/** 적재 역연산(스모크 검증·실수 복구용) — 입력 영상의 성과·A/B 행 삭제 + contents.ab_* 초기화. */
export async function cleanupPerformance(supa: Supa, entries: PerformanceEntry[]): Promise<{ contents: number }> {
  let n = 0;
  for (const entry of entries) {
    const contentId = await resolveContentId(supa, entry);
    if (!contentId) continue;
    await supa.from("performance_metrics").delete().eq("content_id", contentId);
    await supa.from("ab_variants").delete().eq("content_id", contentId);
    await supa.from("contents").update({ ab_margin: null, ab_decisiveness: null, ab_result_status: "pending" }).eq("id", contentId);
    n += 1;
  }
  return { contents: n };
}

/** content_id 직접 지정 우선, 없으면 youtube_video_id → contents 조회. */
async function resolveContentId(supa: Supa, entry: PerformanceEntry): Promise<string | null> {
  if (entry.content_id) {
    const { data } = await supa.from("contents").select("id").eq("id", entry.content_id).maybeSingle();
    return data?.id ?? null;
  }
  if (entry.youtube_video_id) {
    const { data } = await supa.from("contents").select("id").eq("youtube_video_id", entry.youtube_video_id).maybeSingle();
    return data?.id ?? null;
  }
  return null;
}
