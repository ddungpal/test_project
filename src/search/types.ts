// 검색 어댑터 계약 — 셜록 리서치용. callLLM과 같은 철학: 호출부는 백엔드(mock|tavily)를 모른다.
//   dev = mock(결정적·$0) / 운영 = tavily(실검색). fixture로 tavily 응답도 리플레이($0·재현).
//   ★ 한국 공식도메인 직접 fetch는 별도(키 불필요) — search 어댑터는 범용 웹검색(Tavily) 담당.

export type SearchBackendName = "mock" | "tavily";

export interface SearchResult {
  title: string;
  url: string;
  content: string; // 본문 스니펫(인용 검증 §9-②의 원천)
  score: number | null; // 관련도(백엔드 제공)
  publisher: string | null; // 도메인/발행처(독립성 §9-①)
  published_at: string | null; // 발행시각(최신성 §6) — 알 수 없으면 null
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  provider: SearchBackendName | "fixture";
}

export interface SearchQuery {
  query: string;
  /** 한국 공식/1차 출처 우선(§9-⑥) 시 도메인 화이트리스트. */
  includeDomains?: string[];
  maxResults?: number;
  /** 캐시 신선도 힌트(발굴 B). static>slow>fast 순 TTL. 미지정=default TTL.
   *  ★ fixture 해시엔 미포함 — 같은 쿼리는 같은 캐시, volatility는 만료 판정에만 쓴다. */
  volatility?: "static" | "slow" | "fast";
}

export interface SearchBackend {
  readonly name: SearchBackendName;
  run(q: SearchQuery): Promise<SearchResult[]>;
}
