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
  // 마이그레이션 20260626120024 미적용 시 테이블 부재 → 빈 목록으로 우아하게(/copy-learn 전체가 막히지 않게).
  //   auditLog best-effort 패턴 미러. 적용 후엔 정상 조회.
  if (error) {
    console.warn(`[corrections] 조회 실패(빈 목록으로 처리 — 마이그레이션 미적용 가능): ${error.message}`);
    return [];
  }

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

// ── 구성(structure) 스타일 프로필 조회(structure-style 뷰) — component_type='structure'만 분리 로드. ──
//   썸네일/제목(getCopyStyleDrafts)과 다른 독립 타입. CopyStyleComponentType union 에 'structure'를 넣지 않는다
//   (그러면 CopyLearningForm 의 Record<CopyStyleComponentType,...>={thumbnail_copy:[],title:[]} typecheck 가 깨짐).
//   active 1개 + (있으면) 최신 draft 1개만 싣는다. patterns 는 jsonb 원본(UI 재귀 렌더). 조회 실패해도
//   /copy-learn 전체가 막히지 않게 best-effort(getCorrections 의 try/warn→빈/null 폴백 패턴 미러).

/** 구성 스타일 프로필 1건(version·status·patterns 원본). patterns 는 jsonb 그대로 — UI 가 안전 재귀 렌더. */
export interface StructureProfile {
  version: number | null;
  status: CopyStyleStatus;
  patterns: unknown; // patterns(jsonb) 원본 — 임의 구조라 렌더러가 안전 처리.
}

/** 구성(structure) active 프로필 + 최신 draft. 각각 없으면 null. */
export interface StructureProfiles {
  active: StructureProfile | null;
  latestDraft: StructureProfile | null;
}

/**
 * style_profiles 에서 component_type='structure' 만 조회해 active 1개 + 최신 draft 1개를 싣는다.
 *   version desc 정렬로 각 status 첫 건을 채택. 조회 실패/테이블 이슈 시 빈(null) 폴백(/copy-learn 보호).
 */
export async function getStructureProfiles(): Promise<StructureProfiles> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("style_profiles")
    .select("version, status, patterns")
    .eq("component_type", "structure")
    .order("version", { ascending: false, nullsFirst: false });
  if (error) {
    // 마이그레이션 미적용·테이블 이슈에도 페이지가 막히지 않게 빈값 폴백(getCorrections 패턴 미러).
    console.warn(`[structure] style_profiles 조회 실패(빈값으로 처리): ${error.message}`);
    return { active: null, latestDraft: null };
  }

  let active: StructureProfile | null = null;
  let latestDraft: StructureProfile | null = null;
  for (const r of data ?? []) {
    const prof: StructureProfile = { version: r.version, status: r.status as CopyStyleStatus, patterns: r.patterns };
    if (!active && prof.status === "active") active = prof;
    if (!latestDraft && prof.status === "draft") latestDraft = prof;
    if (active && latestDraft) break;
  }
  return { active, latestDraft };
}

// ── 비유(analogy_style) 스타일 draft 조회(analogy 뷰) — component_type='analogy_style'만 분리 로드. ──
//   썸네일/제목(getCopyStyleDrafts)·구성(getStructureProfiles)과 다른 독립 타입. ⚠️ CopyStyleComponentType
//   union 에 'analogy_style'을 넣지 않는다(넣으면 CopyLearningForm 의 Record<CopyStyleComponentType,...>
//   typecheck 가 깨짐 — getStructureProfiles 가 이 이유로 분리된 것과 동일). getCopyStyleDrafts 의 최신순·
//   perComponent 패턴 + getStructureProfiles/getCorrections 의 best-effort(try/warn→[]) 폴백 미러.
//   (analogy_style CHECK 마이그 미적용 시에도 /copy-learn 전체가 막히지 않게.)

export interface AnalogyDraft {
  id: string;
  version: number | null;
  status: CopyStyleStatus;
  createdAt: string;
  patternKeys: string[]; // patterns(jsonb) 최상위 키 목록(요약). 빈/비객체면 [].
  patterns: unknown; // patterns(jsonb) 원본 — UI 상세/요약 렌더용. 임의 구조라 렌더러가 안전 처리.
}

/**
 * style_profiles 에서 component_type='analogy_style' 만 최신순(version desc)으로 최대 `limit`개(기본 5) 조회.
 *   UI 가 검수·활성화 후보로 쓴다. 조회 실패(마이그 미적용·테이블 이슈)면 빈 목록 폴백(/copy-learn 보호).
 */
export async function getAnalogyDrafts(limit = 5): Promise<AnalogyDraft[]> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("style_profiles")
    .select("id, version, status, patterns, created_at")
    .eq("component_type", "analogy_style")
    .order("version", { ascending: false, nullsFirst: false });
  if (error) {
    // analogy_style CHECK 마이그 미적용·테이블 이슈에도 페이지가 막히지 않게 빈 목록 폴백(getStructureProfiles 패턴 미러).
    console.warn(`[analogy] style_profiles 조회 실패(빈 목록으로 처리 — 마이그레이션 미적용 가능): ${error.message}`);
    return [];
  }

  const out: AnalogyDraft[] = [];
  for (const r of data ?? []) {
    if (out.length >= limit) break;
    out.push({
      id: r.id,
      version: r.version,
      status: r.status as CopyStyleStatus,
      createdAt: r.created_at,
      patternKeys: patternKeysOf(r.patterns),
      patterns: r.patterns,
    });
  }
  return out;
}

// ── 김짠부 직접 피드백 최우선 규칙(owner rules) draft 조회 — component_type='title_owner_rules'|'thumbnail_owner_rules'. ──
//   썸네일/제목(getCopyStyleDrafts)·구성·비유와 다른 독립 타입. ⚠️ CopyStyleComponentType union 에 owner 타입을
//   넣지 않는다(넣으면 CopyLearningForm 의 Record<CopyStyleComponentType,...> typecheck 가 깨짐 — getStructureProfiles/
//   getAnalogyDrafts 가 분리된 이유와 동일). getAnalogyDrafts 의 최신순·limit 패턴 + best-effort(try/warn→[]) 폴백 미러
//   (마이그 034 미적용·테이블 이슈에도 /copy-learn 전체가 막히지 않게).

export type OwnerRulesComponentType = "title_owner_rules" | "thumbnail_owner_rules";

/** owner rules draft 1건 — 증류 규칙(rules) + provenance 근거 수(sourcesCount). patterns 는 임의 구조라 방어적으로 뽑는다. */
export interface OwnerRulesDraft {
  id: string;
  version: number | null;
  status: CopyStyleStatus;
  createdAt: string;
  rules: string[]; // patterns.rules(비배열/누락이면 [])
  sourcesCount: number; // patterns.sources 길이(비배열/누락이면 0)
}

/** patterns(jsonb)에서 rules(string[])만 안전 추출. 비객체·null·배열·rules 비배열이면 []. */
function ownerRulesOf(patterns: unknown): string[] {
  if (patterns === null || typeof patterns !== "object" || Array.isArray(patterns)) return [];
  const rules = (patterns as Record<string, unknown>).rules;
  if (!Array.isArray(rules)) return [];
  return rules.filter((r): r is string => typeof r === "string" && r.trim().length > 0);
}

/** patterns(jsonb)에서 sources 길이만 안전 추출. 비객체·sources 비배열이면 0. */
function ownerSourcesCountOf(patterns: unknown): number {
  if (patterns === null || typeof patterns !== "object" || Array.isArray(patterns)) return 0;
  const sources = (patterns as Record<string, unknown>).sources;
  return Array.isArray(sources) ? sources.length : 0;
}

/**
 * style_profiles 에서 owner rules(title_owner_rules|thumbnail_owner_rules)를 component별 최신순(version desc)으로
 *   최대 `limit`개(기본 5) 조회. UI 가 검수·활성화 후보로 쓴다. 조회 실패(마이그 034 미적용·테이블 이슈)면 빈 목록 폴백.
 */
export async function getOwnerRulesDrafts(
  component: OwnerRulesComponentType,
  limit = 5,
): Promise<OwnerRulesDraft[]> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("style_profiles")
    .select("id, version, status, patterns, created_at")
    .eq("component_type", component)
    .order("version", { ascending: false, nullsFirst: false });
  if (error) {
    // 마이그 034 미적용·테이블 이슈에도 페이지가 막히지 않게 빈 목록 폴백(getAnalogyDrafts 패턴 미러).
    console.warn(`[owner-rules:${component}] style_profiles 조회 실패(빈 목록으로 처리 — 마이그레이션 미적용 가능): ${error.message}`);
    return [];
  }

  const out: OwnerRulesDraft[] = [];
  for (const r of data ?? []) {
    if (out.length >= limit) break;
    out.push({
      id: r.id,
      version: r.version,
      status: r.status as CopyStyleStatus,
      createdAt: r.created_at,
      rules: ownerRulesOf(r.patterns),
      sourcesCount: ownerSourcesCountOf(r.patterns),
    });
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
