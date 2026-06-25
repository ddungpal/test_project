// 썸네일 스타일 환류(PhaseA Step1) — active 썸네일 스타일 프로필을 훅이 prepare에 주입하는 공유 헬퍼.
//   style_extractor가 뽑은 style_profiles(component_type='thumbnail_copy')의 'active' 1행을 읽어,
//   훅이가 김짠부 썸네일 스타일을 따라 쓰도록 시스템 프롬프트에 짧은 지시 섹션을 덧붙인다.
//   ★ 결정성/픽스처 보존: 프로필이 '없으면'(또는 patterns가 비었으면) input/system을 건드리지 않는다(해시 불변).
//   ★ appendLearnedInsights(환류 슬라이스 4) 패턴을 그대로 미러링한다.

import type { Supa } from "../../pipeline/runState.js";

export interface ActiveThumbnailStyle {
  id: string; // "style:<uuid>" — evidence 링크용
  version: number;
  patterns: unknown; // style_profiles.patterns(jsonb) 원형(ThumbnailStylePatterns 기대, 검증 없이 전달)
}

/** active 썸네일 스타일 프로필을 로드(최신 version 1행). 없으면 null. */
export async function loadActiveThumbnailStyle(supa: Supa): Promise<ActiveThumbnailStyle | null> {
  const { data, error } = await supa
    .from("style_profiles")
    .select("id, version, patterns")
    .eq("component_type", "thumbnail_copy")
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`active 썸네일 스타일 조회 실패: ${error.message}`);
  if (!data) return null;
  return { id: `style:${data.id}`, version: data.version ?? 0, patterns: data.patterns };
}

/** patterns가 실질 내용을 가졌는지(빈/깨진 가드). 비-객체·null·빈 객체면 false. */
function hasUsablePatterns(patterns: unknown): patterns is Record<string, unknown> {
  return (
    typeof patterns === "object" &&
    patterns !== null &&
    !Array.isArray(patterns) &&
    Object.keys(patterns as Record<string, unknown>).length > 0
  );
}

/** 시스템 프롬프트에 썸네일 스타일 지시 섹션을 덧붙인다(순수). 프로필 null/빈 patterns면 원본 그대로(해시 불변). */
export function appendThumbnailStyle(system: string, profile: ActiveThumbnailStyle | null): string {
  if (!profile || !hasUsablePatterns(profile.patterns)) return system;
  // patterns(jsonb)는 형태가 보장되지 않으므로 안정 직렬화로 그대로 전달(훅이가 읽고 따라 쓴다).
  const patternsJson = JSON.stringify(profile.patterns, null, 2);
  return [
    system,
    "",
    "── 김짠부 썸네일 스타일 사양(반드시 따라 쓰기) ──",
    "과거 썸네일을 분석해 추출한 '따라 만들 수 있는 스타일 사양'이다.",
    "thumbnail_copy·thumbnail_layout을 아래 copy/visual 패턴에 맞춰 제안하고, banned 항목은 피하라.",
    `이 사양을 따른 후보는 evidence_ids에 그 id(${profile.id})를 포함하라.`,
    patternsJson,
  ].join("\n");
}

// ── 제목 스타일 환류(copy-learning-admin step1) — 썸네일 미러. 훅이(제목)에 active 'title' 스타일을 주입. ──
//   ★ thumbnail 과 동일 규칙: 프로필 없거나 patterns 비면 input/system 불변(해시·픽스처 보존). 조건부 주입.

/** active 제목 스타일 프로필(component_type='title')의 형태. ActiveThumbnailStyle 미러. */
export type ActiveTitleStyle = ActiveThumbnailStyle;

/** active 제목 스타일 프로필을 로드(최신 version 1행). 없으면 null. */
export async function loadActiveTitleStyle(supa: Supa): Promise<ActiveTitleStyle | null> {
  const { data, error } = await supa
    .from("style_profiles")
    .select("id, version, patterns")
    .eq("component_type", "title")
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`active 제목 스타일 조회 실패: ${error.message}`);
  if (!data) return null;
  return { id: `style:${data.id}`, version: data.version ?? 0, patterns: data.patterns };
}

/** 시스템 프롬프트에 제목 스타일 지시 섹션을 덧붙인다(순수). 프로필 null/빈 patterns면 원본 그대로(해시 불변). */
export function appendTitleStyle(system: string, profile: ActiveTitleStyle | null): string {
  if (!profile || !hasUsablePatterns(profile.patterns)) return system;
  const patternsJson = JSON.stringify(profile.patterns, null, 2);
  return [
    system,
    "",
    "── 김짠부 제목 스타일 사양(반드시 따라 쓰기) ──",
    "CTR(클릭률)로 성과가 검증된 제목들을 분석해 추출한 '따라 쓸 수 있는 제목 스타일 사양'이다.",
    "제목 후보를 아래 copy 패턴(후킹·강조어·길이)에 맞춰 제안하고, banned 항목은 피하라. 낚시·과장은 금지(CTR 이 높았던 정직한 표현만).",
    `이 사양을 따른 후보는 evidence_ids에 그 id(${profile.id})를 포함하라.`,
    patternsJson,
  ].join("\n");
}
