"use server";
// 카피 학습 입력 저장(copy-learning-admin step0) — 김짠부가 입력한 영상별 썸네일·제목 A/B + CTR(24h)를
//   DB에 멱등 저장하는 백엔드 데이터 계층. UI는 step2, 학습은 step1. 이 step은 저장만.
//   ★ ingest.ts/ingest-ab.ts 미러: judgeComponent 재계산(rank·winner)·같은 onConflict·pickContentVerdict→contents.ab_* 파생.
//   ★ requireOwner() 후에만 service-role 사용(RLS 우회 노출·감사필드 위조 차단).
//   ★ 순수 매핑(mapCopyAbToRows·mapCtr24hToMetricRow)은 copyLearnMap.ts(server-only 무관)에 — 테스트가 DB 없이 import.

import { createAdminClient } from "../../lib/supabase/admin.js";
import { requireOwner } from "./auth.js";
import { auditLog } from "../../lib/observability/auditLog.js";
import { loadConfig } from "../../llm/config.js";
import { pickContentVerdict, type AbThresholds } from "../../performance/abVerdict.js";
import { mapCopyAbToRows, mapCtr24hToMetricRow, type CopyAbInput } from "./copyLearnMap.js";
import type { Json } from "../../lib/supabase/database.types.js";

/** youtubeVideoId/contentId → contents.id 해석(content_id 우선). 못 찾으면 null. */
async function resolveContentId(
  supa: ReturnType<typeof createAdminClient>,
  input: CopyAbInput,
): Promise<string | null> {
  if (input.contentId) {
    const { data } = await supa.from("contents").select("id").eq("id", input.contentId).maybeSingle();
    return data?.id ?? null;
  }
  if (input.youtubeVideoId) {
    const { data } = await supa.from("contents").select("id").eq("youtube_video_id", input.youtubeVideoId).maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

/**
 * 영상별 카피 A/B + CTR(24h) 멱등 저장. requireOwner 후 service-role.
 *   - ab_variants(썸네일·제목) 멱등 upsert(onConflict content_id,component_type,variant).
 *   - performance_metrics d1 overall 멱등 upsert(onConflict content_id,metric_window,ab_variant).
 *   - contents.ab_* 캐시 갱신(썸네일 기준 pickContentVerdict).
 *   - 같은 입력 2회 → 행 수 불변.
 */
export async function saveCopyAbResults(input: CopyAbInput): Promise<{ savedThumbnail: number; savedTitle: number; decided: boolean }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const thresholds: AbThresholds = loadConfig().ab;

  const contentId = await resolveContentId(supa, input);
  if (!contentId) throw new Error("영상을 찾지 못했습니다(contentId/youtubeVideoId 확인).");

  const { abRows, thumbnailVerdict } = mapCopyAbToRows(input, contentId, thresholds);
  const savedThumbnail = abRows.filter((r) => r.component_type === "thumbnail").length;
  const savedTitle = abRows.filter((r) => r.component_type === "title").length;

  if (abRows.length) {
    const { error } = await supa.from("ab_variants").upsert(abRows, { onConflict: "content_id,component_type,variant" });
    if (error) throw new Error(`ab_variants 저장 실패: ${error.message}`);
  }

  // performance_metrics d1 overall 멱등 upsert.
  const metricRow = mapCtr24hToMetricRow(input, contentId, new Date().toISOString());
  const { error: me } = await supa.from("performance_metrics").upsert([metricRow], { onConflict: "content_id,metric_window,ab_variant" });
  if (me) throw new Error(`performance_metrics 저장 실패: ${me.message}`);

  // contents.ab_* = ab_variants 파생 캐시(썸네일 기준). 제목 단일은 판정 없음 → 영향 없음.
  const pick = thumbnailVerdict ? pickContentVerdict([thumbnailVerdict]) : null;
  const patch = pick
    ? { ab_margin: pick.margin, ab_decisiveness: pick.decisiveness, ab_result_status: "decided" as const }
    : { ab_margin: null, ab_decisiveness: null, ab_result_status: "pending" as const };
  const { error: ce } = await supa.from("contents").update(patch).eq("id", contentId);
  if (ce) throw new Error(`contents ab_* 갱신 실패: ${ce.message}`);

  const detail: Json = {
    thumb: savedThumbnail,
    titleMode: input.title.hasAbTest ? "ab" : "single",
    ctr24h: input.ctr24h,
  };
  await auditLog(supa, { actorId: ownerId, action: "copy_ab_saved", targetType: "content", targetId: contentId, detail });

  return { savedThumbnail, savedTitle, decided: pick !== null };
}
