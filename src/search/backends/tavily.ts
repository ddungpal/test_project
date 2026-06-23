// Tavily 백엔드(운영) — AI 친화 웹검색 API. TAVILY_API_KEY 필요.
//   무료 티어 1,000건/월. 응답을 우리 SearchResult로 정규화.
import type { SearchBackend, SearchQuery, SearchResult } from "../types.js";

interface TavilyApiResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

function publisherFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const tavilyBackend: SearchBackend = {
  name: "tavily",
  async run(q: SearchQuery): Promise<SearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY 미설정 — SEARCH_BACKEND=tavily엔 키 필요(mock으로 폴백하려면 SEARCH_BACKEND=mock).");

    const body: Record<string, unknown> = {
      api_key: apiKey,
      query: q.query,
      search_depth: "advanced", // 인용 근거 품질↑(§9-②)
      max_results: q.maxResults ?? 6,
      include_raw_content: false,
    };
    if (q.includeDomains?.length) body.include_domains = q.includeDomains;

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Tavily 검색 실패 ${res.status}: ${txt.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: TavilyApiResult[] };
    return (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      score: typeof r.score === "number" ? r.score : null,
      publisher: r.url ? publisherFromUrl(r.url) : null,
      published_at: r.published_date ?? null,
    }));
  },
};
