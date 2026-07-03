// YouTube Data API 키 풀 + 429 자동 rotation (youtube-key-pool step0 · 순수 모듈).
//   키 N개 = 하루 N×10,000 units 헤드룸. quota(429) 본 키를 이 프로세스 동안 스킵하고 다음 키로 넘어간다.
//   ★ ToS 주의: 멀티 프로젝트 quota는 YouTube 개발자 정책 회색지대 — dev 헤드룸용(프로덕션 주력 아님).
//   ★ 보안: 키 값은 로그·에러 메시지에 절대 노출 금지(인덱스/개수만).
//   ★ 배선(searchYouTube 연결)은 step1 범위 — 이 모듈은 순수 로직만.

import { YouTubeQuotaError } from "./externalSignals.js";

/** 키 파싱: YOUTUBE_API_KEYS(쉼표 구분) 우선 → 없으면 [YOUTUBE_API_KEY] → 둘 다 없으면 [].
 *  각 키 trim, 빈 문자열 제거, 순서 유지 dedup.
 *  단일 YOUTUBE_API_KEY만 설정된 기존 환경은 [단일키] 반환(하위호환). */
export function getYouTubeKeys(): string[] {
  const pool = process.env.YOUTUBE_API_KEYS;
  const raw = pool != null && pool.trim() !== ""
    ? pool.split(",")
    : [process.env.YOUTUBE_API_KEY ?? ""];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const key = k.trim();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

// 소진(429 본) 키 집합 — 이 프로세스 동안만 유효(인메모리·세션 스코프). 재기동/PT 자정 리셋으로 자연 회복.
//   파일/DB 영속화 안 함(YAGNI). 키 문자열 자체를 담는다(로그엔 절대 안 찍음).
const exhausted = new Set<string>();

/** 소진 안 된 키로 fn을 순서대로 시도.
 *  - YouTubeQuotaError(429)면 그 키를 이 프로세스 동안 '소진'으로 마킹하고 다음 키로.
 *  - 성공하면 그 값 반환.
 *  - 남은(소진 안 된) 키가 없으면 마지막 YouTubeQuotaError를 throw.
 *  - 비-quota 에러는 rotation 없이 즉시 throw(무한 rotation·오진 방지).
 *  키 풀이 비었으면(getYouTubeKeys()===[]) 즉시 YouTubeQuotaError throw(방어적 — 콜러는 step1에서
 *  keys.length===0이면 애초에 안 부른다). */
export async function withRotatingYouTubeKey<T>(fn: (key: string) => Promise<T>): Promise<T> {
  const keys = getYouTubeKeys();
  let lastQuotaError: YouTubeQuotaError | null = null;
  let idx = 0; // 로그용(키 값이 아니라 순번만)
  for (const key of keys) {
    idx++;
    if (exhausted.has(key)) continue;
    try {
      return await fn(key);
    } catch (e) {
      if (e instanceof YouTubeQuotaError) {
        exhausted.add(key);
        lastQuotaError = e;
        console.warn(`[youtube 키풀] 키 #${idx}/${keys.length} quota 소진(429) — 다음 키로 rotation`);
        continue;
      }
      throw e; // 비-quota 에러는 즉시 전파(rotation 안 함).
    }
  }
  throw lastQuotaError ?? new YouTubeQuotaError("youtube 키풀: 사용 가능한 키 없음(전부 소진 또는 미설정)");
}

/** 테스트 격리용 — 소진 마킹 리셋. 프로덕션 경로에서는 호출하지 않는다. */
export function __resetExhaustedForTest(): void {
  exhausted.clear();
}
