// 썸네일 메인문구에 '주제 핵심 키워드'가 그대로 들어갔는지 사후 판정(순수·결정적·방어적).
//   step0 THUMBNAIL_MAKER_SYSTEM 규칙(메인문구 2개 중 최소 하나에 주제 키워드 그대로—약자·우회 금지)의 소프트 체크.
//   styleConformance.ts 미러: 외부 의존·DB·네트워크 없음, 입력 깨져도 크래시 금지·중립 반환.
//
// ⚠ 강제 거부 아님 — 표면화(UI ⚠ 칩)용 휴리스틱. 형태소 분석기 없이 정규식만 사용.
//   오탐(없는데 경고)을 과탐보다 더 피한다: 키워드 추출이 애매하면 경고하지 않는다(missing:false).

export interface TopicMissing {
  missing: boolean; // true면 메인문구에 주제 핵심 키워드가 안 보임(⚠ 표면화)
  keyword: string | null; // 누락 판정의 근거가 된 핵심 키워드(title 속성에 노출). 추출 불가면 null.
}

const NEUTRAL: TopicMissing = { missing: false, keyword: null };

/** 정규화: 좌우 공백 제거 → 내부 공백 전부 제거 → 소문자(부분일치 비교 안정화). */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, "").toLowerCase();
}

/**
 * topic/selectedTitle에서 핵심 키워드 후보를 보수적으로 추출한다.
 *  - 한글 조사 꼬리(은/는/이/가/을/를/의/에/와/과 등)와 흔한 불용어를 제거.
 *  - 영문/숫자 토큰(예: ETF, S&P500)은 핵심 신호로 우대.
 *  - 너무 짧은(1글자) 토큰은 오탐 위험이 커 버린다.
 *  - 추출 불가하면 빈 배열(→ 경고 안 함).
 */
function extractKeywords(topic: string, selectedTitle: string): string[] {
  const src = [topic, selectedTitle].filter((s) => typeof s === "string" && s.trim().length > 0).join(" ");
  if (!src) return [];

  // 토큰화: 한글/영문/숫자 덩어리만 남긴다(구두점·기호 분리).
  const rawTokens = src.match(/[가-힣]+|[A-Za-z]+|\d+/g) ?? [];

  // 흔한 불용어(주제·제목에 자주 끼지만 핵심 아님). 보수적으로 짧게 유지.
  const STOP = new Set([
    "그리고", "하지만", "그러나", "정말", "진짜", "완전", "그냥", "이거", "저거", "그거",
    "방법", "이유", "정리", "총정리", "완벽", "추천", "후기", "리뷰", "브이로그",
    "the", "and", "for", "with", "how", "why", "what",
  ]);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of rawTokens) {
    // 한글 토큰: 끝의 흔한 1글자 조사 제거(보수적 — 핵심 명사구를 깨지 않을 정도만).
    let tok = t;
    if (/^[가-힣]+$/.test(tok) && tok.length >= 3) {
      tok = tok.replace(/(은|는|이|가|을|를|의|에|와|과|로|으로|에서|에게|한테|까지|부터|보다|처럼|마다)$/u, "");
    }
    const norm = normalize(tok);
    // 1글자 토큰은 오탐 위험 → 제외. 단 영문/숫자 약어(ETF 등)는 2글자부터 허용.
    if (norm.length < 2) continue;
    if (STOP.has(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(tok);
  }
  return out;
}

/**
 * 썸네일 메인문구(mains)에 주제 핵심 키워드가 그대로 들어갔는지 판정한다.
 *  - 키워드를 하나도 못 뽑으면 경고하지 않는다({missing:false, keyword:null}).
 *  - 추출한 키워드 중 하나라도 mains(정규화 후 join)에 부분일치로 들어가면 missing:false.
 *  - 전부 안 들어갔을 때만 missing:true(가장 대표 키워드를 keyword로 반환).
 *  - mains/topic/selectedTitle 어느 것이 깨져도 크래시 없이 중립 반환.
 */
export function detectTopicMissing(
  mains: string[],
  topic: string,
  selectedTitle: string,
): TopicMissing {
  // 방어: mains가 배열이 아니거나 비면 비교 대상 없음 → 중립(경고 안 함, 오탐 회피).
  const safeMains = Array.isArray(mains) ? mains.filter((m): m is string => typeof m === "string") : [];
  if (safeMains.length === 0) return NEUTRAL;

  const safeTopic = typeof topic === "string" ? topic : "";
  const safeTitle = typeof selectedTitle === "string" ? selectedTitle : "";

  const keywords = extractKeywords(safeTopic, safeTitle);
  if (keywords.length === 0) return NEUTRAL; // 추출 불가 → 경고 안 함

  const haystack = normalize(safeMains.join(" "));
  if (!haystack) return NEUTRAL;

  // 키워드 중 하나라도 메인문구에 부분일치로 등장하면 충족(missing:false).
  for (const kw of keywords) {
    const n = normalize(kw);
    if (n.length >= 2 && haystack.includes(n)) return { missing: false, keyword: kw };
  }

  // 전부 누락 — 대표 키워드(가장 긴 것, 동률이면 첫 번째)를 근거로 반환.
  const keyword = keywords.reduce((a, b) => (b.length > a.length ? b : a), keywords[0]!);
  return { missing: true, keyword };
}
