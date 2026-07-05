// 김짠부 직접 피드백 최우선 규칙 draft(title_owner_rules|thumbnail_owner_rules) patterns(jsonb)
//   → 표시용 요약 라인 string[]. 설계: docs/specs/2026-07-05-owner-feedback-rules-design.md. 순수 함수(부작용 0).
//
// ⚠️ 클라이언트 컴포넌트(오너 피드백 패널)에서 단위테스트할 순수 헬퍼는 컴포넌트 파일이 아니라
//   src/lib/** 에 둔다(vitest @/ alias 부재로 컴포넌트 import 시 스위트 로드 실패 — rules.md).
//   analogyDraftSummary 와 짝이 되는 패턴. CopyLearningForm 의 오너 draft 카드가 여기서 import 한다.
//
// 입력은 unknown 으로 받아 런타임 방어한다(모델 누락·구버전 draft·깨진 jsonb 대비).

/** value 가 비지 않은 string[] 이면 길이, 아니면 0. */
function nonEmptyStrArrayLen(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((v) => typeof v === "string" && v.trim()).length;
}

/**
 * owner rules patterns → 표시용 요약 라인들. 빈/깨진 입력은 [] 로 안전 처리.
 *   - null·비객체·배열 → [] (방어)
 *   - rules(비빈 string[]) → "규칙 N개", sources(배열) → "근거 N건"
 *   - 빈/누락/타입 불일치 필드는 라인 생략. 둘 다 없으면 [].
 */
export function ownerRulesDraftSummary(patterns: unknown): string[] {
  if (patterns === null || typeof patterns !== "object" || Array.isArray(patterns)) return [];
  const p = patterns as Record<string, unknown>;
  const out: string[] = [];

  const rules = nonEmptyStrArrayLen(p.rules);
  if (rules > 0) out.push(`규칙 ${rules}개`);

  if (Array.isArray(p.sources) && p.sources.length > 0) {
    out.push(`근거 ${p.sources.length}건`);
  }

  return out;
}
