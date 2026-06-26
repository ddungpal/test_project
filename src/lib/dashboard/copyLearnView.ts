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
  views24h: number | null; // performance_metrics d1 overall
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

// ── 최근 스타일 draft/active 조회(copy-learning-admin step2) — UI "최근 draft 보기"용. ──

export type CopyStyleComponentType = "thumbnail_copy" | "title";
export type CopyStyleStatus = "draft" | "active" | "retired";

export interface CopyStyleDraft {
  id: string;
  componentType: CopyStyleComponentType;
  version: number | null;
  status: CopyStyleStatus;
  createdAt: string;
  patternKeys: string[]; // patterns(jsonb) 최상위 키 목록(요약). 빈/비객체면 [].
  patterns: unknown; // patterns(jsonb) 원본 — UI 상세 펼치기용. 임의 구조라 렌더러가 안전 처리.
}

/** patterns(jsonb)에서 최상위 키만 추출(요약용). 비객체·null·배열이면 []. */
function patternKeysOf(patterns: unknown): string[] {
  if (patterns === null || typeof patterns !== "object" || Array.isArray(patterns)) return [];
  return Object.keys(patterns as Record<string, unknown>);
}

/**
 * thumbnail_copy·title 의 최근 draft/active 프로필을 component별 최신순(version desc)으로 조회.
 *   각 component 최대 `perComponent`개(기본 5). UI가 검수·활성화 후보로 쓴다.
 */
export async function getCopyStyleDrafts(perComponent = 5): Promise<CopyStyleDraft[]> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("style_profiles")
    .select("id, component_type, version, status, patterns, created_at")
    .in("component_type", ["thumbnail_copy", "title"])
    .order("version", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`style_profiles 조회 실패: ${error.message}`);

  const counts = new Map<string, number>();
  const out: CopyStyleDraft[] = [];
  for (const r of data ?? []) {
    const ct = r.component_type as CopyStyleComponentType;
    const n = counts.get(ct) ?? 0;
    if (n >= perComponent) continue;
    counts.set(ct, n + 1);
    out.push({
      id: r.id,
      componentType: ct,
      version: r.version,
      status: r.status as CopyStyleStatus,
      createdAt: r.created_at,
      patternKeys: patternKeysOf(r.patterns),
      patterns: r.patterns,
    });
  }
  return out;
}

// ── 교정쌍(생성↔이상 카피) 조회(correction-learning UI) — thumbnail_corrections 전부 최신순. ──
//   getCopyStyleDrafts 조회 패턴(admin client·error throw) 미러. payloadToText 재사용(드리프트 0).

export type CorrectionComponentType = "thumbnail" | "title";

export interface CorrectionRow {
  id: string;
  componentType: CorrectionComponentType;
  topic: string | null;
  genText: string[]; // gen_payload 평탄화(썸네일 copy_main+copy_boxes · 제목 title)
  idealText: string[]; // ideal_payload 평탄화(동일 규칙)
  diff: unknown; // diff(jsonb) 원본 — UI 가 안전 렌더(임의 구조). null 가능.
  learnedAt: string | null; // 재학습에 반영된 시각(미반영이면 null)
  createdAt: string;
}

/** thumbnail_corrections 전부 created_at 최신순 조회. 표시·검수용(읽기전용). */
export async function getCorrections(): Promise<CorrectionRow[]> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("thumbnail_corrections")
    .select("id, component_type, topic, gen_payload, ideal_payload, diff, learned_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`thumbnail_corrections 조회 실패: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    componentType: r.component_type as CorrectionComponentType,
    topic: r.topic,
    genText: payloadToText(r.gen_payload),
    idealText: payloadToText(r.ideal_payload),
    diff: r.diff,
    learnedAt: r.learned_at,
    createdAt: r.created_at,
  }));
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
    .select("content_id, ctr, views")
    .in("content_id", ids)
    .eq("metric_window", "d1")
    .eq("ab_variant", "overall");
  if (perfErr) throw new Error(`performance_metrics 조회 실패: ${perfErr.message}`);

  const ctrById = new Map<string, number | null>();
  const viewsById = new Map<string, number | null>();
  for (const r of perfRows ?? []) {
    ctrById.set(r.content_id, r.ctr);
    viewsById.set(r.content_id, r.views);
  }

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
      views24h: viewsById.get(c.id) ?? null,
      thumbnail,
      titleHasAbTest: titleVariants.length >= 2,
      titleVariants,
    };
  });
}
