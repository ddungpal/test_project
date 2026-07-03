// 비유 스타일 draft(analogy_style) patterns(jsonb) → 표시용 요약 라인 string[].
//   설계: docs/specs/2026-07-03-analogy-learning-design.md §4.5. 순수 함수(부작용 0).
//
// ⚠️ 클라이언트 컴포넌트(비유 패널)에서 단위테스트할 순수 헬퍼는 컴포넌트 파일이 아니라
//   src/lib/** 에 둔다(vitest @/ alias 부재로 컴포넌트 import 시 스위트 로드 실패 — rules.md).
//   Esther 의 패널이 여기서 import 한다.
//
// 입력은 unknown 으로 받아 런타임 방어한다(모델 누락·구버전 draft·깨진 jsonb 대비).
//   AnalogyStylePatterns 는 정상 형태 참고용으로만 import.

import type { AnalogyStylePatterns } from "../../agents/analogy_extractor/schema.js";

/** value 가 비지 않은 string[] 이면 길이, 아니면 null(라인 생략용). */
function nonEmptyStrArrayLen(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const n = value.filter((v) => typeof v === "string" && v.trim()).length;
  return n > 0 ? n : null;
}

/**
 * analogy_style patterns → 표시용 요약 라인들. 빈/깨진 입력은 [] 로 안전 처리.
 *   - null·비객체·배열 → [] (방어)
 *   - techniques → "기법 N개", target_domains → "친숙 영역 N개",
 *     do → "장치 N개", banned → "금지 N개",
 *     distortion_guard(비빈 문자열) → "왜곡 가드 ✓", confidence → "신뢰도: {값}"
 *   - 빈 배열/누락/타입 불일치 필드는 라인 생략.
 */
export function analogyDraftSummary(patterns: unknown): string[] {
  if (patterns === null || typeof patterns !== "object" || Array.isArray(patterns)) return [];
  const p = patterns as Partial<AnalogyStylePatterns> & Record<string, unknown>;
  const out: string[] = [];

  const techniques = nonEmptyStrArrayLen(p.techniques);
  if (techniques !== null) out.push(`기법 ${techniques}개`);

  const domains = nonEmptyStrArrayLen(p.target_domains);
  if (domains !== null) out.push(`친숙 영역 ${domains}개`);

  const doLen = nonEmptyStrArrayLen(p.do);
  if (doLen !== null) out.push(`장치 ${doLen}개`);

  const banned = nonEmptyStrArrayLen(p.banned);
  if (banned !== null) out.push(`금지 ${banned}개`);

  if (typeof p.distortion_guard === "string" && p.distortion_guard.trim()) {
    out.push("왜곡 가드 ✓");
  }

  if (typeof p.confidence === "string" && p.confidence.trim()) {
    out.push(`신뢰도: ${p.confidence.trim()}`);
  }

  return out;
}
