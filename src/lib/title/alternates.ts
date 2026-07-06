// 제목 후보 보관(title-shortlist) 순수 로직 — 부수효과·I/O·DB·Date.now 0.
//   설계: docs/specs/2026-07-06-title-shortlist-design.md "순수 헬퍼".
//   ★ 순수 헬퍼는 src/lib/title/에 둔다(vitest @/ alias 없음 함정 — 컴포넌트는 호출만).
import type { TitlePayload } from "../dashboard/proposalTypes.js";

// 후보 상한: 대표 1 + 추가 2 = A/B/C 3후보 화면 기준. 상한 넘겨 저장할 이유 없음(YAGNI).
const MAX_ALTERNATES = 2;

/**
 * 대표 payload에 추가 후보 제목들을 alternates로 부착한다.
 * - extraTitles를 정제: 트림, 빈문자 제거, 대표 title과 중복 제거, 서로간 중복 제거.
 * - 정제 후 상한 2개(초과분은 버린다).
 * - 정제 결과가 0개면 alternates 키를 넣지 않는다(원본과 형태 동일).
 * ★ 불변식: extraTitles가 실질적으로 비면 반환값은 primary와 deep-equal 이어야 한다
 *   (alternates 키가 undefined도 아니고 아예 없음). 이유: 다운스트림 promptHash/fixture 보존.
 * 순수·throw 0. 입력 비변형.
 */
export function mergeAlternates(primary: TitlePayload, extraTitles: string[]): TitlePayload {
  const list = Array.isArray(extraTitles) ? extraTitles : [];
  const primaryTitle = (primary?.title ?? "").trim(); // 대표 중복 비교는 양쪽 트림 기준

  const cleaned: string[] = [];
  for (const raw of list) {
    const t = typeof raw === "string" ? raw.trim() : "";
    if (t === "") continue; // 빈문자·공백 제거
    if (t === primaryTitle) continue; // 대표와 중복 제거
    if (cleaned.includes(t)) continue; // 후보 서로간 중복 제거
    cleaned.push(t); // 저장은 트림된 값으로
    if (cleaned.length >= MAX_ALTERNATES) break; // 상한 초과분 버림
  }

  if (cleaned.length === 0) return { ...primary }; // 불변식: alternates 키 자체를 넣지 않음
  return { ...primary, alternates: cleaned };
}

/**
 * 대표 title과 alternates[altIndex]를 맞교환한 새 payload를 반환한다.
 * - 나머지 필드(thumbnail_layout 등)는 스프레드로 그대로 보존.
 * - altIndex가 범위를 벗어나거나 alternates가 없으면 payload를 변경 없이 반환.
 * - 교환 후 이전 대표 title이 alternates의 같은 자리에 들어간다(목록 길이 유지).
 * 순수·throw 0. 입력 비변형.
 */
export function promotePrimary(payload: TitlePayload, altIndex: number): TitlePayload {
  const alternates = payload?.alternates;
  if (!Array.isArray(alternates)) return payload; // alternates 없음 → 무변경
  if (!Number.isInteger(altIndex) || altIndex < 0 || altIndex >= alternates.length) return payload; // 범위 밖 → 무변경

  const newPrimary = alternates[altIndex]!;
  const nextAlternates = alternates.slice(); // 입력 비변형
  nextAlternates[altIndex] = payload.title; // 이전 대표를 같은 자리에(길이 유지)

  return { ...payload, title: newPrimary, alternates: nextAlternates };
}
