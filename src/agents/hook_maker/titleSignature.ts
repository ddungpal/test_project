// 생성된 제목 후보가 김짠부 시그니처(signature_words/skeleton 고정어구)를 하나도 안 쓰는지 사후 판정(순수·결정적·방어적).
//   step0 appendTitleStyle/HOOK_MAKER_SYSTEM이 프롬프트로 김짠부 스타일을 강제하지만 LLM이 빗나갈 수 있다 — 그 소프트 안전망.
//   topicMissing.ts 미러: 외부 의존·DB·네트워크 없음, 입력 깨져도 크래시 금지·중립 반환.
//
// ⚠ 강제 거부 아님 — 표면화(UI ⚠ 칩)용 휴리스틱. 형태소 분석기 없이 정규식만 사용.
//   오탐(없는데 경고)을 과탐보다 더 피한다: 시그니처 후보를 하나도 못 모으면 경고하지 않는다(missing:false).

export interface TitleSignatureMissing {
  missing: boolean; // true면 제목에 김짠부 시그니처 고정어구가 하나도 안 보임(⚠ 표면화)
}

const NEUTRAL: TitleSignatureMissing = { missing: false };

/** 정규화: 좌우 공백 제거 → 내부 공백 전부 제거 → 소문자(부분일치 비교 안정화). topicMissing과 동일. */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, "").toLowerCase();
}

/** 슬롯 `{...}` 제거 후 공백·구두점으로 토큰화 → 길이 2 이상 토큰만. */
function tokenizeTemplate(template: string): string[] {
  // 슬롯 제거: `{topic}` 같은 파라메트릭 슬롯을 공백으로 치환(남은 리터럴만 시그니처 후보).
  const literals = template.replace(/\{[^}]*\}/g, " ");
  // 토큰화: 한글/영문/숫자 덩어리만 남긴다(구두점·기호 분리). topicMissing 철학 재사용.
  const rawTokens = literals.match(/[가-힣]+|[A-Za-z]+|\d+/g) ?? [];
  const out: string[] = [];
  for (const t of rawTokens) {
    if (normalize(t).length >= 2) out.push(t); // 길이 2 미만 토큰 버림.
  }
  return out;
}

/**
 * patterns에서 시그니처 후보를 보수적으로 모은다.
 *  - patterns.signature_words(string[]) — 그대로 후보로.
 *  - patterns.skeletons.title[].template — 슬롯 제거 후 리터럴 토큰을 각각 후보로.
 *  - patterns가 깨져도(null·비객체·필드 타입 불일치) 크래시 없이 모을 수 있는 만큼만 모은다.
 */
function collectSignatureCandidates(patterns: unknown): string[] {
  if (!patterns || typeof patterns !== "object") return [];
  const p = patterns as Record<string, unknown>;
  const out: string[] = [];

  // signature_words(string[]) — 그대로 후보로.
  const sigWords = p.signature_words;
  if (Array.isArray(sigWords)) {
    for (const w of sigWords) {
      if (typeof w === "string" && normalize(w).length >= 2) out.push(w);
    }
  }

  // skeletons.title[].template — 슬롯 제거 후 리터럴 토큰.
  const skeletons = p.skeletons;
  if (skeletons && typeof skeletons === "object") {
    const titleSk = (skeletons as Record<string, unknown>).title;
    if (Array.isArray(titleSk)) {
      for (const sk of titleSk) {
        if (!sk || typeof sk !== "object") continue;
        const tpl = (sk as Record<string, unknown>).template;
        if (typeof tpl === "string") out.push(...tokenizeTemplate(tpl));
      }
    }
  }

  return out;
}

/**
 * 생성된 제목에 김짠부 시그니처 고정어구가 하나라도 들어갔는지 판정한다.
 *  - 시그니처 후보를 하나도 못 모으면 경고하지 않는다({missing:false}) — 데이터 없음 → 오탐 회피(핵심).
 *  - title 정규화 후 비면 중립({missing:false}).
 *  - 후보 중 하나라도 정규화 부분일치(길이≥2)하면 missing:false.
 *  - 전부 없을 때만 missing:true.
 *  - title/patterns 어느 것이 깨져도 크래시 없이 중립 반환.
 */
export function detectTitleSignatureMissing(title: string, patterns: unknown): TitleSignatureMissing {
  const candidates = collectSignatureCandidates(patterns);
  if (candidates.length === 0) return NEUTRAL; // 시그니처 데이터 없음 → 경고 안 함(핵심).

  const safeTitle = typeof title === "string" ? title : "";
  const haystack = normalize(safeTitle);
  if (!haystack) return NEUTRAL; // 제목이 비면 중립.

  // 후보 중 하나라도 제목에 부분일치로 등장하면 시그니처 충족(missing:false).
  for (const cand of candidates) {
    const n = normalize(cand);
    if (n.length >= 2 && haystack.includes(n)) return { missing: false };
  }

  // 전부 누락 — 시그니처를 하나도 안 씀.
  return { missing: true };
}
