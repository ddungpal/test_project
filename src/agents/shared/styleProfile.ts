// 썸네일 스타일 환류(PhaseA Step1) — active 썸네일 스타일 프로필을 훅이 prepare에 주입하는 공유 헬퍼.
//   style_extractor가 뽑은 style_profiles(component_type='thumbnail_copy')의 'active' 1행을 읽어,
//   훅이가 김짠부 썸네일 스타일을 따라 쓰도록 시스템 프롬프트에 짧은 지시 섹션을 덧붙인다.
//   ★ 결정성/픽스처 보존: 프로필이 '없으면'(또는 patterns가 비었으면) input/system을 건드리지 않는다(해시 불변).
//   ★ appendLearnedInsights(환류 슬라이스 4) 패턴을 그대로 미러링한다.

import type { Supa } from "../../pipeline/runState.js";
import type { WinningThumbnailRef } from "../thumbnail_maker/winningRefs.js";

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

// ── 우승 썸네일 few-shot(thumbnail-winning-refs step1) — 썸네일메이커 prepare 에 주입하는 순수 합성. ──
//   ★ appendThumbnailStyle 미러: refs 없거나 빈 배열이면 원본 system 그대로 반환(바이트 불변 → promptHash 보존).
//   ★ 있을 때만 '실제 고성과 우승작' few-shot 섹션을 SYSTEM 뒤에 덧붙인다. 기존 SYSTEM 규칙은 덮어쓰지 않는다.

/** 빈 문자열/공백을 따옴표로 감싼 사람이 읽을 슬롯으로(없으면 빈칸). noUncheckedIndexedAccess 안전. */
function quoteSlot(v: string | undefined): string {
  return v && v.trim().length > 0 ? `"${v.trim()}"` : '""';
}

/** 우승 썸네일 한 줄: `- (id) 메인: "a" / "b"  · 박스: "c" / "d"`. main/boxes 0~2개 안전 처리. */
function winningRefLine(ref: WinningThumbnailRef): string {
  const main = `${quoteSlot(ref.main[0])} / ${quoteSlot(ref.main[1])}`;
  const boxes = `${quoteSlot(ref.boxes[0])} / ${quoteSlot(ref.boxes[1])}`;
  return `- (${ref.id}) 메인: ${main}  · 박스: ${boxes}`;
}

/** 시스템 프롬프트에 우승 썸네일 few-shot 섹션을 덧붙인다(순수). refs 없거나 빈 배열이면 원본 그대로(해시 불변). */
export function appendWinningThumbnailRefs(system: string, refs: WinningThumbnailRef[] | undefined): string {
  if (!refs || refs.length === 0) return system;
  return [
    system,
    "",
    "── 김짠부 실제 고성과 썸네일(점유율·CTR·조회수로 검증된 우승작) ──",
    "아래는 김짠부 채널에서 실제로 성과가 가장 좋았던 썸네일이다. 이 톤·구조·후킹 강도로 새 후보를 써라.",
    "★그대로 베끼지 마라 — 표현·단어를 재구성해 김짠부답되 매번 새롭게(거의 동일하면 anti-dup ref_similarity 가드에 걸린다).",
    "이 스타일을 따른 후보는 evidence_ids에 해당 id(style:winner:…)를 포함하라.",
    ...refs.map(winningRefLine),
  ].join("\n");
}
