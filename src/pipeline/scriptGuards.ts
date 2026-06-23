// 짠펜 가드 헬퍼(순수·테스트 가능) — 표절(코퍼스 대비 유사도)·freshness.
//   임베딩 없이 문자 n-gram '포함도(containment)'로 근사: segment가 코퍼스에 얼마나 그대로 들어있나.
//   포함도 = |segment shingles ∩ corpus shingles| / |segment shingles|. 1에 가까우면 베낀 것.

const N = 5; // 문자 5-gram(한국어 구어체에 적당)

export function charShingles(text: string, n = N): Set<string> {
  const s = text.replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n));
  return out;
}

/** 코퍼스 전체 shingle 집합(한 번 만들어 재사용). */
export function buildCorpusShingles(corpusTexts: string[], n = N): Set<string> {
  const set = new Set<string>();
  for (const t of corpusTexts) for (const sh of charShingles(t, n)) set.add(sh);
  return set;
}

/** 0~1. segment 문장이 코퍼스에 얼마나 그대로 포함되는지(표절 신호). */
export function containment(text: string, corpusShingles: Set<string>, n = N): number {
  const sh = charShingles(text, n);
  if (sh.size === 0) return 0;
  let hit = 0;
  for (const s of sh) if (corpusShingles.has(s)) hit++;
  return hit / sh.size;
}

export const PLAGIARISM_THRESHOLD = 0.6; // 이상이면 표절 의심 → 사람검수 플래그(소프트)
// 이상이면 '거의 복사' → 자동 중단(하드). 0.6보다 높게 둬서 말투 고정 인사(짧고 섞여 0.4대)는 안 걸리게.
export const PLAGIARISM_BLOCK_THRESHOLD = 0.85;
