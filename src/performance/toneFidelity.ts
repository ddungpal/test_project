// 말투 충실도 채점(Phase D — 말투내재화 #1) — 순수·결정적 채점(LLM·DB·시각·랜덤 0).
//   tone_profile.components(jsonb) 형태를 unknown 으로 받아, '말투 특징'만 검사한다:
//     - banned: 금칙 표현이 text 에 등장하면 fail.
//     - 필수 말투 마커: phrases(말버릇) 또는 vocab.signature_words 중 ≥1 이 등장하면 pass(느슨).
//   ★ 사실(숫자·주장 진위)은 절대 검사하지 않는다 — governance 말투 ≠ 사실.
//   ★ 빈/깨진 patterns 는 중립({score:1, checks:[]}) — throw 금지(styleProfile 가드 미러링).
//
//   ponytail: 골든셋 기준 LLM-judge 점수를 여기에 합산(미구현 — 골든셋·eval_runs 생성 후, Phase 5).
//   현재는 결정적 검사만 동작한다. 위 확장은 별도 함수로 합류시키되, 이 순수함수는 결정성을 유지한다.

export interface ToneCheck {
  /** 검사 식별자(예: "banned", "tone_markers"). */
  name: string;
  pass: boolean;
  /** 사람이 읽을 부연(왜 fail/pass). exactOptionalPropertyTypes — 있을 때만 키를 둔다. */
  detail?: string;
}

export interface ToneFidelityResult {
  /** 통과 검사 수 / 전체 검사 수 (0~1). 검사할 게 없으면 1(중립). */
  score: number;
  checks: ToneCheck[];
}

/** 객체(레코드)인지 — 비-객체·null·배열은 false. styleProfile.hasUsablePatterns 류 가드. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** unknown 에서 string[] 만 안전 추출(비-배열·비-string 요소는 버림, 빈 문자열 제외). */
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** components 에서 검사 재료(banned·말투 마커)를 안전 추출. 비-객체면 둘 다 빈 배열. */
function extractToneFeatures(tonePatterns: unknown): { banned: string[]; markers: string[] } {
  if (!isRecord(tonePatterns)) return { banned: [], markers: [] };

  const banned = asStringArray(tonePatterns["banned"]);

  // 말투 마커 = phrases(말버릇) + vocab.signature_words(특유 단어). 둘 다 ≥1 등장 여부를 느슨하게 본다.
  const phrases = asStringArray(tonePatterns["phrases"]);
  const vocab = tonePatterns["vocab"];
  const signatureWords = isRecord(vocab) ? asStringArray(vocab["signature_words"]) : [];
  const markers = [...phrases, ...signatureWords];

  return { banned, markers };
}

/**
 * 말투 충실도 점수(0~1)와 검사 내역.
 *   - tonePatterns 는 tone_profile.components(jsonb) 형태(unknown 안전 추출).
 *   - banned 가 있으면 'banned' 검사 1개: text 에 등장한 금칙 표현이 하나라도 있으면 fail.
 *   - 말투 마커가 있으면 'tone_markers' 검사 1개: 마커 중 ≥1 이 text 에 있으면 pass(과적합 회피).
 *   - 검사할 게 없으면(빈/깨진 patterns, 둘 다 빈 배열) { score: 1, checks: [] }(중립, throw 금지).
 *   - 결정적: 같은 입력 → 같은 출력. LLM·네트워크·Date·랜덤 없음.
 */
export function scoreToneFidelity(text: string, tonePatterns: unknown): ToneFidelityResult {
  const { banned, markers } = extractToneFeatures(tonePatterns);
  const checks: ToneCheck[] = [];

  // banned 검사 — 금칙 표현이 text 에 등장하면 fail. 없을 때만(빈 배열) 스킵.
  if (banned.length > 0) {
    const hits = banned.filter((b) => text.includes(b));
    const pass = hits.length === 0;
    checks.push(
      pass
        ? { name: "banned", pass: true }
        : { name: "banned", pass: false, detail: `금칙 표현 등장: ${hits.join(", ")}` },
    );
  }

  // 필수 말투 마커 검사 — 마커 중 ≥1 등장이면 pass. 마커가 없을 때만 스킵.
  if (markers.length > 0) {
    const hit = markers.find((m) => text.includes(m));
    const pass = hit !== undefined;
    checks.push(
      pass
        ? { name: "tone_markers", pass: true, detail: `말투 마커 등장: ${hit}` }
        : { name: "tone_markers", pass: false, detail: "필수 말투 마커가 하나도 없음" },
    );
  }

  if (checks.length === 0) return { score: 1, checks: [] };

  const passed = checks.filter((c) => c.pass).length;
  return { score: passed / checks.length, checks };
}
