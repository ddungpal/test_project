// 비유 스타일 환류(analogy-learning Step3) — active 비유 스타일 프로필을 유이(analogist) prepare에 주입하는 공유 헬퍼.
//   analogy_extractor가 뽑은 style_profiles(component_type='analogy_style')의 'active' 1행을 읽어,
//   유이가 김짠부다운 비유 기법을 따라 쓰도록 시스템 프롬프트에 짧은 지시 섹션을 덧붙인다.
//   ★ 결정성/픽스처 보존: 프로필이 '없으면'(또는 patterns가 비었으면) system을 건드리지 않는다(바이트 동일 → promptHash 불변).
//   ★ styleProfile.ts(appendThumbnailStyle/appendTitleStyle) 패턴을 그대로 미러링한다. hasUsablePatterns 재사용.

import type { Supa } from "../../pipeline/runState.js";
import type { AnalogyStylePatterns } from "../analogy_extractor/schema.js";
import { type ActiveThumbnailStyle, hasUsablePatterns } from "./styleProfile.js";

/** active 비유 스타일 프로필(component_type='analogy_style')의 형태. ActiveThumbnailStyle 미러. */
export type ActiveAnalogyStyle = ActiveThumbnailStyle;

/** active 비유 스타일 프로필을 로드(최신 version 1행). 없으면 null. loadActiveThumbnailStyle 미러. */
export async function loadActiveAnalogyStyle(supa: Supa): Promise<ActiveAnalogyStyle | null> {
  const { data, error } = await supa
    .from("style_profiles")
    .select("id, version, patterns")
    .eq("component_type", "analogy_style")
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`active 비유 스타일 조회 실패: ${error.message}`);
  if (!data) return null;
  return { id: `style:${data.id}`, version: data.version ?? 0, patterns: data.patterns };
}

/** string[] 후보(unknown)를 비지 않은 문자열만 다듬어 반환. 유효 0개면 null(라인 생략). */
function cleanStrArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
  return valid.length > 0 ? valid : null;
}

/** "── 제목 ──" + " - 항목" 블록 렌더. items 없으면 null. */
function bulletBlock(title: string, items: string[] | null): string | null {
  if (!items) return null;
  return [title, ...items.map((i) => ` - ${i}`)].join("\n");
}

/** 시스템 프롬프트에 비유 스타일 지시 섹션을 덧붙인다(순수). 프로필 null/빈 patterns면 원본 그대로(바이트 동일 → 해시 불변).
 *  ★ AnalogyStylePatterns 필드(techniques/target_domains/do/banned/distortion_guard)를 사람이 읽기 쉬운 짧은 블록으로 렌더한다. */
export function appendAnalogyStyle(system: string, profile: ActiveAnalogyStyle | null): string {
  if (!profile || !hasUsablePatterns(profile.patterns)) return system;
  const p = profile.patterns as Partial<AnalogyStylePatterns> & Record<string, unknown>;
  const techniques = bulletBlock("[비유 기법]", cleanStrArray(p.techniques));
  const domains = cleanStrArray(p.target_domains);
  const dos = bulletBlock("[잘 꽂히게 하는 장치]", cleanStrArray(p.do));
  const banned = bulletBlock("[피할 안티패턴]", cleanStrArray(p.banned));
  const distortion =
    typeof p.distortion_guard === "string" && p.distortion_guard.trim().length > 0
      ? `[왜곡 방지] ${p.distortion_guard.trim()}`
      : null;
  return [
    system,
    "",
    "── 레퍼런스에서 학습한 비유 기법(반영) ──",
    "비유를 특출나게 잘하는 레퍼런스 영상을 분석해 뽑은 '따라 쓸 수 있는 비유 기법'이다.",
    "아래 기법·장치를 이 주제의 비유에 적용하되, 안티패턴은 피하고 사실을 왜곡하지 마라.",
    `이 사양을 따른 자산은 evidence에 그 id(${profile.id})를 남겨라.`,
    ...(techniques ? ["", techniques] : []),
    ...(domains ? ["", `[친숙 영역] ${domains.join(", ")}`] : []),
    ...(dos ? ["", dos] : []),
    ...(banned ? ["", banned] : []),
    ...(distortion ? ["", distortion] : []),
  ].join("\n");
}
