// 훅이 출력 스타일 부합도 평가(순수·결정적·방어적) — A/B 학습한 banned(패배 패턴)·winning(emphasis_words)으로
//   훅이 제목+메인문구를 사후 검사. ref_similarity와 동일하게 LLM 호출 후 toCandidates에서 주석한다(promptHash 무관).
//
// 휴리스틱임 주의: banned_hits는 따옴표 예시구 substring 매칭이라 완전 의미판정 아님(거짓음성 가능).
//   완전판정=LLM judge는 후순위. winning_score가 더 신뢰.
import type { ThumbnailStylePatterns } from "../style_extractor/schema.js";

export interface StyleConformance {
  banned_hits: string[]; // 매칭된 banned 항목(원문 일부)
  winning_score: number; // 0~1, emphasis_words 부합도
}

/** banned_hits ≥ 이 값이면 ⚠ 표면화(UI step1). */
export const STYLE_CONFORMANCE_BANNED_FLAG = 1;

/** patterns가 unknown/깨졌을 수 있어 안전하게 string[]만 추려낸다. */
function safeStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** banned 항목에서 따옴표(" ' “ ” ‘ ’) 안 예시구를 추출. 여러 개면 전부. 없으면 빈 배열. */
function quotedExamples(banned: string): string[] {
  const out: string[] = [];
  const re = /["'“”‘’]([^"'“”‘’]+)["'“”‘’]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(banned)) !== null) {
    const ex = m[1]?.trim();
    if (ex) out.push(ex);
  }
  return out;
}

// 자릿수 전체표기(예: 500,000,000) — banned 항목에도 text에도 있을 때만 hit(거짓양성 방지).
const FULL_NUMBER_RE = /\d{1,3}(,\d{3})+/;

/**
 * text가 active 스타일 패턴에 얼마나 부합하는지 결정적으로 평가한다.
 * patterns 없음/깨짐/banned·emphasis_words 비면 중립 { banned_hits: [], winning_score: 0 }. 절대 크래시 금지.
 */
export function evaluateStyleConformance(
  text: string,
  patterns: ThumbnailStylePatterns | null | undefined,
): StyleConformance {
  const neutral: StyleConformance = { banned_hits: [], winning_score: 0 };
  if (typeof text !== "string" || !patterns || typeof patterns !== "object") return neutral;

  const banned = safeStringArray((patterns as { banned?: unknown }).banned);
  const copy = (patterns as { copy?: unknown }).copy;
  const emphasis = copy && typeof copy === "object" ? safeStringArray((copy as { emphasis_words?: unknown }).emphasis_words) : [];

  // winning_score: emphasis_words 중 text에 substring으로 등장하는 비율. 비거나 없으면 0(중립).
  const winning_score = emphasis.length === 0 ? 0 : emphasis.filter((w) => w.length > 0 && text.includes(w)).length / emphasis.length;

  // banned_hits: 각 banned 항목의 따옴표 예시구가 text에 포함되면 hit. 옵션 토큰(TOP·자릿수표기)은
  //   banned 항목 자체에 그 토큰이 있고 text에도 있을 때만 hit(거짓양성 방지).
  const banned_hits: string[] = [];
  for (const item of banned) {
    let hit = false;
    for (const ex of quotedExamples(item)) {
      if (text.includes(ex)) { hit = true; break; }
    }
    if (!hit && item.includes("TOP") && text.includes("TOP")) hit = true;
    if (!hit && FULL_NUMBER_RE.test(item) && FULL_NUMBER_RE.test(text)) hit = true;
    if (hit) banned_hits.push(item);
  }

  return { banned_hits, winning_score };
}
