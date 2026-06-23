// mock 백엔드(개발) — 결정적·$0·네트워크 없음. 셜록 골격을 키 없이 돌리고 테스트하기 위함.
//   실제 사실이 아니라 '형태가 맞는' 결과를 query로부터 결정적으로 생성한다(파이프라인 배선 검증용).
//   ⚠️ mock 결과로 만든 fact는 신뢰할 수 없다 → fact_verifier가 citation 미검증으로 처리하도록 표식을 남긴다.
import type { SearchBackend, SearchQuery, SearchResult } from "../types.js";

// 한국 공식/1차 출처 도메인(§9-⑥) — mock도 이 풀에서 결정적으로 고른다.
const OFFICIAL = [
  { host: "nts.go.kr", pub: "국세청" },
  { host: "fsc.go.kr", pub: "금융위원회" },
  { host: "bok.or.kr", pub: "한국은행" },
  { host: "kostat.go.kr", pub: "통계청" },
  { host: "law.go.kr", pub: "국가법령정보센터" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export const mockBackend: SearchBackend = {
  name: "mock",
  async run(q: SearchQuery): Promise<SearchResult[]> {
    const n = Math.min(q.maxResults ?? 3, 3);
    const base = hash(q.query);
    return Array.from({ length: n }, (_, i) => {
      const src = OFFICIAL[(base + i) % OFFICIAL.length]!;
      return {
        title: `[MOCK] ${q.query} 관련 안내 (${src.pub})`,
        url: `https://www.${src.host}/mock/${(base + i) % 9973}`,
        // ⚠️ mock 표식 포함 — fact_verifier가 실인용으로 오인하지 않도록.
        content: `[MOCK 검색결과 — 실제 사실 아님] "${q.query}"에 대한 ${src.pub}의 설명 문단(개발용 더미). 실검색은 SEARCH_BACKEND=tavily.`,
        score: 0.5,
        publisher: src.pub,
        published_at: null,
      };
    });
  },
};
