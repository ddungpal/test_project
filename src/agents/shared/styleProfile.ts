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

/** patterns가 실질 내용을 가졌는지(빈/깨진 가드). 비-객체·null·빈 객체면 false.
 *  ★ analogyStyle.ts(비유 환류)가 이 가드를 그대로 재사용하려고 export한다(중복 정의 금지). export만 추가, 동작 불변. */
export function hasUsablePatterns(patterns: unknown): patterns is Record<string, unknown> {
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

/** 제목 스켈레톤 1개를 사람이 읽는 한 줄로 렌더. template 비-문자열/공백이면 null(폐기).
 *   slots(있으면)는 괄호로 덧붙여 LLM이 무엇을 채우는지 보이게 한다(배열 아님/비면 생략). */
function renderTitleSkeleton(entry: unknown): string | null {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
  const e = entry as Record<string, unknown>;
  const template = typeof e.template === "string" ? e.template.trim() : "";
  if (template.length === 0) return null;
  const slots = Array.isArray(e.slots) ? e.slots.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
  return slots.length > 0 ? `${template}   (슬롯: ${slots.join(", ")})` : template;
}

/** skeletons.title(unknown)을 강제 템플릿 블록으로. 유효 항목만 입력 순서대로. 유효 0개면 null(블록 생략). */
function renderTitleSkeletons(skeletons: unknown): string | null {
  if (typeof skeletons !== "object" || skeletons === null || Array.isArray(skeletons)) return null;
  const title = (skeletons as Record<string, unknown>).title;
  if (!Array.isArray(title) || title.length === 0) return null;
  const lines = title.map(renderTitleSkeleton).filter((l): l is string => l !== null);
  if (lines.length === 0) return null;
  return [
    "── 김짠부 제목 골격(슬롯을 채워 실제로 써라) ──",
    "아래는 김짠부 제목의 실제 골격이다. 슬롯({number}·{target}·{keyword}·{topic} 등)을 이 주제에 맞게 채워 제목을 만든다.",
    "★ 후보 3개 중 최소 1~2개는 이 골격을 실제로 채워 쓴다(주제에 안 맞는 골격은 억지로 쓰지 말 것).",
    ...lines.map((l) => ` - ${l}`),
  ].join("\n");
}

/** signature_words(unknown)를 가독 한 줄로. 문자열 배열 중 비지 않은 것만. 유효 0개면 null. */
function renderSignatureWords(words: unknown): string | null {
  if (!Array.isArray(words)) return null;
  const valid = words.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim());
  if (valid.length === 0) return null;
  return [
    "── 김짠부 시그니처 워딩 ──",
    `다음 표현을 적극 활용해 김짠부다운 제목을 만든다: ${valid.join(", ")}`,
  ].join("\n");
}

/** banned(unknown)를 가독 한 줄로. 문자열 배열 중 비지 않은 것만. 유효 0개면 null. */
function renderBannedWords(words: unknown): string | null {
  if (!Array.isArray(words)) return null;
  const valid = words.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim());
  if (valid.length === 0) return null;
  return `── 피하라(김짠부가 안 쓰는 표현) ──\n다음은 피한다: ${valid.join(", ")}`;
}

/** 시스템 프롬프트에 제목 스타일 지시 섹션을 덧붙인다(순수). 프로필 null/빈 patterns면 원본 그대로(해시 불변). */
export function appendTitleStyle(system: string, profile: ActiveTitleStyle | null): string {
  if (!profile || !hasUsablePatterns(profile.patterns)) return system;
  // ★ 중복 노출 방지: skeletons·signature_words·banned 3키는 아래 가독 블록으로만 렌더하고 JSON 덤프에선 제외한다.
  //   replacer 로 그 키만 건너뛰므로 이 3키가 없던 기존 프로필은 덤프 결과가 바이트 동일하다(해시 보존).
  const stripped = new Set(["skeletons", "signature_words", "banned"]);
  const patternsJson = JSON.stringify(
    profile.patterns,
    (key, value) => (stripped.has(key) ? undefined : value),
    2,
  );
  const p = profile.patterns as Record<string, unknown>;
  const skeletonsBlock = renderTitleSkeletons(p.skeletons);
  const signatureBlock = renderSignatureWords(p.signature_words);
  const bannedBlock = renderBannedWords(p.banned);
  return [
    system,
    "",
    "── 김짠부 제목 스타일 사양(반드시 따라 쓰기) ──",
    "김짠부 채널 제목들에서 추출한 '따라 쓸 수 있는 제목 스타일 사양'이다.",
    "제목 후보를 아래 패턴(후킹·강조어·길이)에 맞춰 제안하라. 낚시·과장은 금지(김짠부의 직설·정직한 표현만).",
    `이 사양을 따른 후보는 evidence_ids에 그 id(${profile.id})를 포함하라.`,
    patternsJson,
    // 강조 블록 — skeletons·signature_words·banned 가 유효하면 가독 렌더로 덧붙인다. 없으면 생략(바이트 불변).
    ...(skeletonsBlock ? ["", skeletonsBlock] : []),
    ...(signatureBlock ? ["", signatureBlock] : []),
    ...(bannedBlock ? ["", bannedBlock] : []),
  ].join("\n");
}

// ── 구성 스타일 환류(structure-style-learning step1) — 썸네일/제목 미러. 구다리(structurer)에 active 'structure' 스타일을 주입. ──
//   ★ thumbnail/title 과 동일 규칙: 프로필 없거나 patterns 비면 system 불변(해시·픽스처 보존). 조건부 주입.

/** active 구성 스타일 프로필(component_type='structure')의 형태. ActiveThumbnailStyle 미러. */
export type ActiveStructureStyle = ActiveThumbnailStyle;

/** active 구성 스타일 프로필을 로드(최신 version 1행). 없으면 null. */
export async function loadActiveStructureStyle(supa: Supa): Promise<ActiveStructureStyle | null> {
  const { data, error } = await supa
    .from("style_profiles")
    .select("id, version, patterns")
    .eq("component_type", "structure")
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`active 구성 스타일 조회 실패: ${error.message}`);
  if (!data) return null;
  return { id: `style:${data.id}`, version: data.version ?? 0, patterns: data.patterns };
}

/** 한 편의 reference_outline(topic + outline 섹션 배열)을 사람이 읽는 블록으로 렌더. 유효 항목만, 없으면 null.
 *   방어: patterns는 unknown 기반 → topic이 비-문자열/공백이거나 outline이 배열 아니면 폐기.
 *   섹션은 {section} 필수(비-문자열/공백 폐기), note는 옵셔널(있으면 " — note"로 덧붙임). 유효 섹션 0개면 폐기. */
function renderReferenceOutline(entry: unknown): string | null {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
  const e = entry as Record<string, unknown>;
  const topic = typeof e.topic === "string" ? e.topic.trim() : "";
  if (topic.length === 0) return null;
  if (!Array.isArray(e.outline)) return null;
  const lines: string[] = [];
  for (const raw of e.outline) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const s = raw as Record<string, unknown>;
    const section = typeof s.section === "string" ? s.section.trim() : "";
    if (section.length === 0) continue;
    const note = typeof s.note === "string" ? s.note.trim() : "";
    const n = lines.length + 1;
    lines.push(note.length > 0 ? ` ${n}. ${section} — ${note}` : ` ${n}. ${section}`);
  }
  if (lines.length === 0) return null;
  return [`[${topic}]`, ...lines].join("\n");
}

/** reference_outlines(unknown)를 유효 항목만 입력 순서대로 가독 few-shot 블록으로. 유효 0개면 null(블록 생략). */
function renderReferenceOutlines(refs: unknown): string | null {
  if (!Array.isArray(refs) || refs.length === 0) return null;
  const blocks = refs.map(renderReferenceOutline).filter((b): b is string => b !== null);
  if (blocks.length === 0) return null;
  return [
    "── 김짠부 실제 목차 예시 ──",
    "아래는 김짠부 과거 영상의 실제 목차다. 이 전개 흐름을 참고해 이 주제에 맞는 목차를 재창작하라(섹션을 그대로 베끼지 마라).",
    ...blocks,
  ].join("\n");
}

/** 시스템 프롬프트에 구성 스타일 지시 섹션을 덧붙인다(순수). 프로필 null/빈 patterns면 원본 그대로(해시 불변). */
export function appendStructureStyle(system: string, profile: ActiveStructureStyle | null): string {
  if (!profile || !hasUsablePatterns(profile.patterns)) return system;
  // ★ 중복 노출 방지: reference_outlines 는 아래 가독 블록으로만 렌더하고 JSON 덤프에선 제외한다.
  //   replacer 로 그 키만 건너뛰므로 reference_outlines 가 없던 기존 프로필은 덤프 결과가 바이트 동일하다.
  const patternsJson = JSON.stringify(
    profile.patterns,
    (key, value) => (key === "reference_outlines" ? undefined : value),
    2,
  );
  const refsBlock = renderReferenceOutlines((profile.patterns as Record<string, unknown>).reference_outlines);
  return [
    system,
    "",
    "── 김짠부 구성 사양 ──",
    "아래는 김짠부 과거 영상에서 학습한 구성 패턴이다 — 이 흐름을 따라 목차를 설계하라(베끼지 말고 이 주제에 맞게 재구성).",
    "section_archetypes·flow_principles·hook_placement·anxiety_relief·misconception_handling 을 이 주제에 맞춰 적용하고, banned 항목은 피하라.",
    `이 사양을 따른 후보는 evidence_ids에 그 id(${profile.id})를 포함하라.`,
    patternsJson,
    // reference_outlines 가 유효하면 가독 few-shot 블록을 system 뒤에 덧붙인다. 없으면 생략(바이트 불변).
    ...(refsBlock ? ["", refsBlock] : []),
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
