import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import type { AbVariantKey } from "../../performance/types.js";

// 카피 학습 입력 폼 프리필(copy-learning-admin step0) 읽기 — 서버 전용. admin 클라이언트(읽기전용).
//   contents 영상 목록 + 각 영상의 기존 ab_variants(thumbnail·title) + performance_metrics(d1·overall)를
//   코드 조인해 폼이 기존 입력을 다시 보여줄 수 있게 한다. insightsView.ts 패턴(코드 조인) 미러.

export interface CopyLearnVariant {
  variant: AbVariantKey;
  text: string[];
  watchShare: number | null;
  isWinner: boolean;
}

export interface CopyLearnVideo {
  id: string;
  youtubeVideoId: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  uploadDate: string | null;
  ctr24h: number | null; // performance_metrics d1 overall
  thumbnail: CopyLearnVariant[]; // component_type='thumbnail'
  titleHasAbTest: boolean; // 제목 A/B 입력 모드(변형 ≥2면 true)
  titleVariants: CopyLearnVariant[]; // component_type='title' (A/B면 3개, 단일이면 1개)
}

/** payload(Json)에서 변형 표시용 text[] 복원. 썸네일=copy_main+copy_boxes, 제목=title. */
function payloadToText(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return [];
  const p = payload as Record<string, unknown>;
  const out: string[] = [];
  if (typeof p.title === "string" && p.title.trim()) out.push(p.title.trim());
  if (Array.isArray(p.copy_main)) {
    for (const m of p.copy_main) if (typeof m === "string" && m.trim()) out.push(m.trim());
  } else if (typeof p.copy_main === "string" && p.copy_main.trim()) {
    out.push(p.copy_main.trim());
  }
  if (Array.isArray(p.copy_boxes)) {
    for (const b of p.copy_boxes) if (typeof b === "string" && b.trim()) out.push(b.trim());
  }
  return out;
}

export async function getCopyLearnVideos(): Promise<CopyLearnVideo[]> {
  const supa = createAdminClient();
  const { data: contents, error } = await supa
    .from("contents")
    .select("id, youtube_video_id, thumbnail_url, title, upload_date")
    .order("upload_date", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`콘텐츠 조회 실패: ${error.message}`);

  const ids = (contents ?? []).map((c) => c.id);
  if (ids.length === 0) return [];

  // ab_variants(thumbnail·title) 코드 조인.
  const { data: abRows, error: abErr } = await supa
    .from("ab_variants")
    .select("content_id, component_type, variant, payload, ctr_pct, is_winner, rank")
    .in("content_id", ids);
  if (abErr) throw new Error(`ab_variants 조회 실패: ${abErr.message}`);

  // performance_metrics d1 overall 코드 조인.
  const { data: perfRows, error: perfErr } = await supa
    .from("performance_metrics")
    .select("content_id, ctr")
    .in("content_id", ids)
    .eq("metric_window", "d1")
    .eq("ab_variant", "overall");
  if (perfErr) throw new Error(`performance_metrics 조회 실패: ${perfErr.message}`);

  const ctrById = new Map<string, number | null>();
  for (const r of perfRows ?? []) ctrById.set(r.content_id, r.ctr);

  const thumbByContent = new Map<string, CopyLearnVariant[]>();
  const titleByContent = new Map<string, CopyLearnVariant[]>();
  for (const r of abRows ?? []) {
    const v: CopyLearnVariant = {
      variant: r.variant,
      text: payloadToText(r.payload),
      watchShare: r.ctr_pct,
      isWinner: r.is_winner,
    };
    const bucket = r.component_type === "thumbnail" ? thumbByContent : titleByContent;
    const arr = bucket.get(r.content_id) ?? [];
    arr.push(v);
    bucket.set(r.content_id, arr);
  }

  const byVariant = (a: CopyLearnVariant, b: CopyLearnVariant): number => a.variant.localeCompare(b.variant);

  return (contents ?? []).map((c) => {
    const thumbnail = (thumbByContent.get(c.id) ?? []).sort(byVariant);
    const titleVariants = (titleByContent.get(c.id) ?? []).sort(byVariant);
    return {
      id: c.id,
      youtubeVideoId: c.youtube_video_id,
      thumbnailUrl: c.thumbnail_url,
      title: c.title,
      uploadDate: c.upload_date,
      ctr24h: ctrById.get(c.id) ?? null,
      thumbnail,
      titleHasAbTest: titleVariants.length >= 2,
      titleVariants,
    };
  });
}
