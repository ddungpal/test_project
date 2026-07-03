// 두 썸네일 메인문구의 어미가 둘 다 '요'로 끝나는지 사후 판정(순수·결정적·방어적).
//   step0 THUMBNAIL_MAKER_SYSTEM 규칙(두 메인문구 어미를 대비 — 둘 다 '~요' 종결 금지)의 관측용 소프트 체크.
//   topicMissing.ts 미러: 외부 의존·DB·네트워크 없음, 입력 깨져도 크래시 금지·중립(false) 반환.
//
// ⚠ 강제 거부 아님 — 로깅(관측)용 휴리스틱. 어미는 코드로 의미적 자동수정이 불가하므로 프롬프트 규칙이 주 레버.

// 후행 정리 대상: 문장부호(?!.)·말줄임(…)·틸드(~)·공백류. 문구 끝의 이 문자들을 벗겨낸 뒤 마지막 글자를 본다.
const TRAILING = /[?!.…~\s]+$/u;

/** 각 문구 trimEnd + 후행 문장부호/틸드/공백 제거 후 마지막 글자가 '요'인지. */
function endsWithYo(s: string): boolean {
  if (typeof s !== "string") return false;
  const stripped = s.trimEnd().replace(TRAILING, "");
  if (stripped.length === 0) return false;
  return stripped[stripped.length - 1] === "요";
}

/**
 * 두 메인문구가 둘 다 '요'로 끝나는가(어미 단조 검출). 후행 공백·문장부호(?!.…~) 제거 후 판정.
 *   main이 2개 미만이거나 빈 문자열이면 false(방어). 순수·throw 0.
 *  - 정확히 2개가 **모두** '요' 종결일 때만 true.
 *  - 하나만/둘 다 아님/2개 미만/빈칸/배열 아님/원소 문자열 아님 → false.
 */
export function bothMainEndWithYo(main: string[]): boolean {
  if (!Array.isArray(main) || main.length !== 2) return false;
  return main.every(endsWithYo);
}
