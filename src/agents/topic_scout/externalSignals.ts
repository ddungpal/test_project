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
  likeCount: number | null; // YouTube 좋아요수(비공개면 null). 반응도용 — LLM 프롬프트엔 안 들어감(step1이 점수/표시에 사용).
  commentCount: number | null; // YouTube 댓글수(비공개면 null). 반응도용 — LLM 프롬프트엔 안 들어감.
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

// 반응도율 = (좋아요+댓글) / 조회수. 조회수 데이터 부족(null·비유한·≤0)이면 null.
//   likes·comments가 둘 다 null이면 반응도 미상 → null. 하나라도 있으면 있는 것만 합산
//   ((likes ?? 0) + (comments ?? 0)). likeCount/commentCount는 비공개 가능 → null 허용.
//   순수 함수(throw 0). viewsPerSubscriber와 동일한 비유한 방어.
export function engagementRate(
  views: number | null | undefined,
  likes: number | null | undefined,
  comments: number | null | undefined,
): number | null {
  if (views == null || !Number.isFinite(views) || views <= 0) return null;
  if (likes == null && comments == null) return null; // 둘 다 미상 → 반응도 미상
  return ((likes ?? 0) + (comments ?? 0)) / views;
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

// 2패스(relevance+viewCount) search 결과를 videoId 기준 dedup 병합한다(순수).
//   먼저 들어온 항목 우선(relevance 패스를 앞에 두면 적합 영상이 union 앞쪽). videoId 없는 항목은 제외.
export function mergeSearchPasses(...passes: YtSearchItem[][]): YtSearchItem[] {
  const seen = new Set<string>();
  const out: YtSearchItem[] = [];
  for (const items of passes) {
    for (const it of items) {
      const vid = it.id?.videoId;
      if (!vid || seen.has(vid)) continue;
      seen.add(vid);
      out.push(it);
    }
  }
  return out;
}

export interface VideoStats {
  views: number | null; // 비공개·없으면 null
  likes: number | null; // 좋아요 비공개 가능 → null
  comments: number | null; // 댓글수 비공개 가능 → null
}

// statistics 필드 안전 파싱: 값 없거나 숫자 아니면 null.
function numOrNull(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** videos.list(part=statistics) — videoId → {views,likes,comments}. best-effort(실패 시 빈 맵).
 *  likeCount/commentCount는 비공개 가능 → 필드 없으면 null. */
async function fetchVideoStats(ids: string[], key: string): Promise<Map<string, VideoStats>> {
  const out = new Map<string, VideoStats>();
  if (!ids.length) return out;
  const p = new URLSearchParams({ part: "statistics", id: ids.join(","), key });
  const res = await fetch(`${YT_API}/videos?${p.toString()}`);
  if (!res.ok) return out;
  const data = (await res.json()) as {
    items?: { id?: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
  };
  for (const it of data.items ?? []) {
    if (!it.id) continue;
    out.set(it.id, {
      views: numOrNull(it.statistics?.viewCount),
      likes: numOrNull(it.statistics?.likeCount),
      comments: numOrNull(it.statistics?.commentCount),
    });
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

// 단일 정렬 패스 search.list. 실패 시 throw(콜러가 패스별로 잡아 best-effort 처리).
async function searchPass(query: string, max: number, order: "relevance" | "viewCount", key: string): Promise<YtSearchItem[]> {
  const p = new URLSearchParams({
    part: "snippet", q: query, type: "video", maxResults: String(max),
    relevanceLanguage: "ko", order, key,
  });
  const res = await fetch(`${YT_API}/search?${p.toString()}`);
  if (!res.ok) throw new Error(`youtube search.list(${order}) ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { items?: YtSearchItem[] };
  return (data.items ?? []).filter((it) => it.id?.videoId);
}

async function searchYouTube(query: string, max: number): Promise<Omit<ExternalItem, "id">[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  // 2패스: relevance(주제 적합) + viewCount(고조회·바이럴) → videoId dedup 병합으로 풀 확대.
  //   각 패스 maxResults는 넉넉히(max 또는 10 중 큰 쪽, 단 천장 10) — 합치면 union이 더 커진다.
  //   기본 호출은 max=5라도 각 패스 10을 받고, 2패스 union이라 풀이 충분히 커진다.
  // ponytail: 2-pass search = 200 quota/call; single-pass if quota tight.
  //   한 패스 실패해도 나머지로 진행(throw 안 함). 둘 다 실패하면 기존 정책대로 throw(콜러가 try/catch로 무시).
  const perPass = Math.min(Math.max(max, 10), 10); // 사실상 10 천장 — quota·토큰 폭증 방지(명세: 50 등 과도 금지).
  const settled = await Promise.allSettled([
    searchPass(query, perPass, "relevance", key),
    searchPass(query, perPass, "viewCount", key),
  ]);
  const ok = settled.filter((s): s is PromiseFulfilledResult<YtSearchItem[]> => s.status === "fulfilled");
  if (ok.length === 0) {
    // 둘 다 실패 → 기존 단일패스 throw 정책 유지(첫 reject 사유로).
    const firstRej = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    throw firstRej?.reason instanceof Error ? firstRej.reason : new Error("youtube search.list 2-pass 전부 실패");
  }
  // relevance 패스를 앞에 두어 적합 영상이 union 앞쪽(perPass 순서 = [relevance, viewCount]).
  const items = mergeSearchPasses(...ok.map((s) => s.value));

  // 통계 보강(조회수·좋아요·댓글·구독자수) — 병합된 union에 1회 배치(중복 비용 없음). best-effort.
  const videoIds = items.map((it) => it.id!.videoId!);
  const channelIds = [...new Set(items.map((it) => it.snippet?.channelId).filter((c): c is string => !!c))];
  const [stats, subs] = await Promise.all([fetchVideoStats(videoIds, key), fetchChannelSubs(channelIds, key)]);

  return items.map((it) => {
    const st = stats.get(it.id!.videoId!);
    return {
      source: "youtube" as const,
      title: decodeEntities(it.snippet?.title ?? ""),
      url: `https://www.youtube.com/watch?v=${it.id!.videoId}`,
      publisher: it.snippet?.channelTitle ?? null,
      published_at: it.snippet?.publishedAt ?? null,
      snippet: decodeEntities(it.snippet?.description ?? "").slice(0, 280),
      viewCount: st?.views ?? null,
      likeCount: st?.likes ?? null,
      commentCount: st?.comments ?? null,
      subscriberCount: it.snippet?.channelId ? (subs.get(it.snippet.channelId) ?? null) : null,
      thumbnailUrl:
        it.snippet?.thumbnails?.high?.url ??
        it.snippet?.thumbnails?.medium?.url ??
        it.snippet?.thumbnails?.default?.url ??
        null,
    };
  });
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
          viewCount: null, likeCount: null, commentCount: null, subscriberCount: null, thumbnailUrl: null,
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
