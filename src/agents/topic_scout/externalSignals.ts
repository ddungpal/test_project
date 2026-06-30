// 촉이 외부 신호 수집(§8.1 결정적 prep) — 댓글-only 한계 보완.
//   웹(Tavily, fixtured $0) + YouTube(경쟁 영상, search.list) → 트렌드·시의성·경쟁 신호.
//   ★ 거버넌스 C: 외부로 나가는 건 집계 키워드 쿼리뿐(댓글 원문 아님). 결과는 공개 웹데이터.
//   ★ best-effort: 일부 소스가 실패(할당량·키)해도 나머지로 진행(throw 안 함).

import { search } from "../../search/search.js";

export interface ExternalItem {
  id: string; // "web:0" | "yt:1" — 촉이 evidence_ids 링크용
  source: "web" | "youtube";
  title: string;
  url: string;
  publisher: string | null;
  published_at: string | null;
  snippet: string;
  viewCount: number | null; // YouTube 해당 영상 조회수
  subscriberCount: number | null; // YouTube 채널 구독자수(비공개면 null)
  thumbnailUrl: string | null; // YouTube 썸네일 이미지 URL(웹·없으면 null). evidence/UI용 — LLM 프롬프트엔 안 들어감.
}

// 구독자 대비 조회수 배수(아웃라이어 판별용). 데이터 부족(조회수/구독자 null·비유한·≤0) 또는
//   구독자가 노이즈 바닥(floorSubs) 미만이면 null.
//   floorSubs: 초소형 채널의 과장 배수(예: 구독 10명·조회 1만=1000배) 노이즈 컷. 순수 함수(throw 0).
export function viewsPerSubscriber(
  viewCount: number | null | undefined,
  subscriberCount: number | null | undefined,
  floorSubs?: number,
): number | null {
  if (viewCount == null || !Number.isFinite(viewCount) || viewCount <= 0) return null;
  if (subscriberCount == null || !Number.isFinite(subscriberCount) || subscriberCount <= 0) return null;
  if (floorSubs != null && subscriberCount < floorSubs) return null;
  return viewCount / subscriberCount;
}

// YouTube 제목/설명의 HTML 엔티티 디코드(&quot; &amp; &#39; 등).
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

interface YtSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
    };
  };
}

const YT_API = "https://www.googleapis.com/youtube/v3";

/** videos.list(part=statistics) — videoId → 조회수. best-effort(실패 시 빈 맵). */
async function fetchVideoViews(ids: string[], key: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const p = new URLSearchParams({ part: "statistics", id: ids.join(","), key });
  const res = await fetch(`${YT_API}/videos?${p.toString()}`);
  if (!res.ok) return out;
  const data = (await res.json()) as { items?: { id?: string; statistics?: { viewCount?: string } }[] };
  for (const it of data.items ?? []) {
    if (it.id && it.statistics?.viewCount != null) out.set(it.id, Number(it.statistics.viewCount));
  }
  return out;
}

/** channels.list(part=statistics) — channelId → 구독자수(비공개면 제외). best-effort. */
async function fetchChannelSubs(ids: string[], key: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const p = new URLSearchParams({ part: "statistics", id: ids.join(","), key });
  const res = await fetch(`${YT_API}/channels?${p.toString()}`);
  if (!res.ok) return out;
  const data = (await res.json()) as {
    items?: { id?: string; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[];
  };
  for (const it of data.items ?? []) {
    if (it.id && !it.statistics?.hiddenSubscriberCount && it.statistics?.subscriberCount != null) {
      out.set(it.id, Number(it.statistics.subscriberCount));
    }
  }
  return out;
}

async function searchYouTube(query: string, max: number): Promise<Omit<ExternalItem, "id">[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const p = new URLSearchParams({
    part: "snippet", q: query, type: "video", maxResults: String(max),
    relevanceLanguage: "ko", order: "relevance", key,
  });
  const res = await fetch(`${YT_API}/search?${p.toString()}`);
  if (!res.ok) throw new Error(`youtube search.list ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { items?: YtSearchItem[] };
  const items = (data.items ?? []).filter((it) => it.id?.videoId);

  // 통계 보강(조회수·구독자수) — best-effort 배치 조회.
  const videoIds = items.map((it) => it.id!.videoId!);
  const channelIds = [...new Set(items.map((it) => it.snippet?.channelId).filter((c): c is string => !!c))];
  const [views, subs] = await Promise.all([fetchVideoViews(videoIds, key), fetchChannelSubs(channelIds, key)]);

  return items.map((it) => ({
    source: "youtube" as const,
    title: decodeEntities(it.snippet?.title ?? ""),
    url: `https://www.youtube.com/watch?v=${it.id!.videoId}`,
    publisher: it.snippet?.channelTitle ?? null,
    published_at: it.snippet?.publishedAt ?? null,
    snippet: decodeEntities(it.snippet?.description ?? "").slice(0, 280),
    viewCount: views.get(it.id!.videoId!) ?? null,
    subscriberCount: it.snippet?.channelId ? (subs.get(it.snippet.channelId) ?? null) : null,
    thumbnailUrl:
      it.snippet?.thumbnails?.high?.url ??
      it.snippet?.thumbnails?.medium?.url ??
      it.snippet?.thumbnails?.default?.url ??
      null,
  }));
}

/** 웹(여러 쿼리) + YouTube(1쿼리) 외부 신호를 모은다. source별 url 디덥, source별 인덱스 id 부여.
 *  volatility: 웹 검색 캐시 신선도 힌트(발굴 B). 트렌드='fast'(매일 갱신), 키워드='slow'. */
export async function gatherExternalSignals(opts: {
  webQueries: string[];
  ytQuery?: string | undefined;
  maxPerQuery?: number;
  volatility?: "static" | "slow" | "fast";
}): Promise<ExternalItem[]> {
  const max = opts.maxPerQuery ?? 5;
  const webRaw: Omit<ExternalItem, "id">[] = [];

  for (const q of opts.webQueries) {
    if (!q.trim()) continue;
    try {
      const r = await search({ query: q, maxResults: max, ...(opts.volatility ? { volatility: opts.volatility } : {}) });
      for (const res of r.results) {
        webRaw.push({
          source: "web", title: res.title, url: res.url,
          publisher: res.publisher, published_at: res.published_at,
          snippet: (res.content ?? "").slice(0, 280),
          viewCount: null, subscriberCount: null, thumbnailUrl: null,
        });
      }
    } catch (e) {
      console.warn(`[촉이 외부신호] 웹검색 실패(무시) q="${q}":`, e instanceof Error ? e.message : e);
    }
  }

  let ytRaw: Omit<ExternalItem, "id">[] = [];
  if (opts.ytQuery?.trim()) {
    try {
      ytRaw = await searchYouTube(opts.ytQuery.trim(), max);
    } catch (e) {
      console.warn(`[촉이 외부신호] YouTube 검색 실패(무시):`, e instanceof Error ? e.message : e);
    }
  }

  const dedup = (rows: Omit<ExternalItem, "id">[]) => {
    const seen = new Set<string>();
    return rows.filter((r) => (r.url && !seen.has(r.url) ? (seen.add(r.url), true) : false));
  };

  return [
    ...dedup(webRaw).map((r, i) => ({ ...r, id: `web:${i}` })),
    ...dedup(ytRaw).map((r, i) => ({ ...r, id: `yt:${i}` })),
  ];
}
