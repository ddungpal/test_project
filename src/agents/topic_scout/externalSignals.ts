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
  sourceQuery: string | null; // 어느 ytQuery(테마)로 발견됐나 — 분산 선택(pickSpreadYoutube)용. 웹은 null.
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

// youtube ExternalItem을 구독자 대비 조회수 배수 desc로 정렬해 상위 n. 순수·결정적(입력 비변형·복사 정렬).
//   정렬 우선순위(hook_maker/externalRefs.ts pickTopExternalTitles 미러):
//     배수(viewsPerSubscriber, floorSubs) desc → 배수 null(구독 비공개·노이즈 컷·FLOOR_SUBS 미만)은 후순위
//     → null끼리는 viewCount desc → 최종 tie는 id asc(안정).
//   배수 null 항목도 버리지 않는다(후순위로만) — 구독 비공개 영상도 유효 레퍼런스.
//   하드 언더퍼포머 컷(임계 드롭)은 두지 않는다 — 정렬+slice면 충분하고, 임계 드롭은 작은 풀을 비울 위험.
//   floorSubs는 인자로 받는다(hook_maker FLOOR_SUBS import 순환 회피 — 콜러가 넘김).
export function rankExternalByMultiplier(items: ExternalItem[], n: number, floorSubs: number): ExternalItem[] {
  const withMult = items.map((it) => ({
    it,
    multiplier: viewsPerSubscriber(it.viewCount, it.subscriberCount, floorSubs),
  }));
  withMult.sort((a, b) => {
    if (a.multiplier == null && b.multiplier == null) {
      // 둘 다 배수 없음 → 조회수 보조 정렬.
    } else if (a.multiplier == null) {
      return 1; // null은 뒤로
    } else if (b.multiplier == null) {
      return -1;
    } else if (a.multiplier !== b.multiplier) {
      return b.multiplier - a.multiplier;
    }
    const av = a.it.viewCount ?? -Infinity;
    const bv = b.it.viewCount ?? -Infinity;
    return (bv - av) || (a.it.id < b.it.id ? -1 : a.it.id > b.it.id ? 1 : 0);
  });
  return withMult.slice(0, n).map((w) => w.it);
}

// youtube ExternalItem을 sourceQuery(테마)별로 고르게 분산해 상위 n. 순수·결정적(입력 비변형).
//   각 테마(sourceQuery) 그룹 내부는 rankExternalByMultiplier 동일 정렬(배수 desc) → 테마들을
//   라운드로빈(테마1 1위, 테마2 1위, 테마3 1위, 테마1 2위 …)으로 번갈아 pick → n 슬롯이 한 테마에
//   쏠리지 않고 여러 테마를 커버. 한 테마만 있으면 그 테마에서 n개(폴백·기존 rankExternalByMultiplier 동작).
//   sourceQuery null(웹·태그 없음)도 한 그룹으로 취급(누락 방지). 테마 그룹 순회 순서는 첫 등장 순서(안정).
export function pickSpreadYoutube(items: ExternalItem[], n: number, floorSubs: number): ExternalItem[] {
  // 1) sourceQuery별 그룹화(첫 등장 순서 보존 — 결정적). null은 빈 문자열 키로 한 그룹.
  const groups = new Map<string, ExternalItem[]>();
  for (const it of items) {
    const key = it.sourceQuery ?? "";
    const g = groups.get(key);
    if (g) g.push(it);
    else groups.set(key, [it]);
  }
  // 2) 각 그룹 내부 동일 정렬(배수 desc) — 재사용(재구현 금지). 그룹 크기만큼 정렬해 두면 라운드로빈에서 0번부터.
  const ranked = [...groups.values()].map((g) => rankExternalByMultiplier(g, g.length, floorSubs));
  // 3) 라운드로빈: round 0의 각 그룹 1위 → round 1의 각 그룹 2위 … n 채울 때까지.
  const out: ExternalItem[] = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const g of ranked) {
      const pick = g[round];
      if (pick !== undefined) {
        out.push(pick);
        added = true;
        if (out.length >= n) break;
      }
    }
    if (!added) break; // 모든 그룹 소진 — 더 줄 항목 없음.
  }
  return out;
}

// 롱폼 최소 길이 — 이 이하면 숏폼/짧은 클립으로 보고 제외. (5분 = Shorts 상한 + 짧은 클립까지 컷)
export const SHORTS_MAX_SEC = 300;

// ISO 8601 duration(PT#H#M#S) → 초. 못 파싱하면 null(길이 미상 → 통과). 순수(throw 0).
//   YouTube contentDetails.duration 형식. 시·분·초 각 선택적이라도 최소 1개 토큰은 있어야 유효.
export function parseISODurationSec(iso: string | undefined | null): number | null {
  if (iso == null) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, h, min, s] = m;
  if (h == null && min == null && s == null) return null; // "PT"만 → 미상
  return (h ? Number(h) * 3600 : 0) + (min ? Number(min) * 60 : 0) + (s ? Number(s) : 0);
}

// 롱폼 여부 — 길이 미상(null)은 통과시킨다(stats가 quota 실패로 비면 전부 null → 드롭 시 풀 전멸).
export function isLongform(durationSec: number | null): boolean {
  return durationSec == null || durationSec > SHORTS_MAX_SEC;
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
  durationSec: number | null; // 영상 길이(초). 미상이면 null(롱폼 필터에서 통과 처리).
}

// statistics 필드 안전 파싱: 값 없거나 숫자 아니면 null.
function numOrNull(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** videos.list(part=statistics,contentDetails) — videoId → {views,likes,comments,durationSec}. best-effort(실패 시 빈 맵).
 *  likeCount/commentCount는 비공개 가능 → 필드 없으면 null. durationSec은 contentDetails.duration(ISO 8601) 파싱(미상 시 null). */
async function fetchVideoStats(ids: string[], key: string): Promise<Map<string, VideoStats>> {
  const out = new Map<string, VideoStats>();
  if (!ids.length) return out;
  const p = new URLSearchParams({ part: "statistics,contentDetails", id: ids.join(","), key });
  const res = await fetch(`${YT_API}/videos?${p.toString()}`);
  if (!res.ok) return out;
  const data = (await res.json()) as {
    items?: {
      id?: string;
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }[];
  };
  for (const it of data.items ?? []) {
    if (!it.id) continue;
    out.set(it.id, {
      views: numOrNull(it.statistics?.viewCount),
      likes: numOrNull(it.statistics?.likeCount),
      comments: numOrNull(it.statistics?.commentCount),
      durationSec: parseISODurationSec(it.contentDetails?.duration),
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

  // 롱폼 필터 — 김짠부는 롱폼만 찾는다. 길이 미상(stats 비거나 contentDetails 누락)은 통과(풀 전멸 방지).
  const longform = items.filter((it) => isLongform(stats.get(it.id!.videoId!)?.durationSec ?? null));

  return longform.map((it) => {
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
      sourceQuery: query, // 어느 키워드로 발견됐나 — 테마별 분산(pickSpreadYoutube)용.
    };
  });
}

/** 웹(여러 쿼리) + YouTube(여러 쿼리) 외부 신호를 모은다. source별 url 디덥, source별 인덱스 id 부여.
 *  ytQueries: 테마 다양성 위해 top-N 수요 키워드로 youtube 검색을 확장(발굴 모드). 결과는 sourceQuery로 태깅.
 *    단일 ytQuery는 [ytQuery]로 흡수(하위호환). videoId 기준 전역 dedup(첫 쿼리 것 유지).
 *  volatility: 웹 검색 캐시 신선도 힌트(발굴 B). 트렌드='fast'(매일 갱신), 키워드='slow'.
 *  ponytail: 3 keywords × 2-pass = ~600 quota/run (N=3 상한 — 콜러가 top-3로 제한; dev는 fixture $0). */
export async function gatherExternalSignals(opts: {
  webQueries: string[];
  ytQuery?: string | undefined;
  ytQueries?: string[] | undefined;
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
          sourceQuery: null, // 웹은 테마 태그 없음.
        });
      }
    } catch (e) {
      console.warn(`[촉이 외부신호] 웹검색 실패(무시) q="${q}":`, e instanceof Error ? e.message : e);
    }
  }

  // ytQueries로 흡수(단일 ytQuery는 [ytQuery]). 빈/공백 스킵 + 중복 쿼리 제거(같은 키워드 두 번 검색 방지).
  const ytQueries = [...(opts.ytQueries ?? []), ...(opts.ytQuery != null ? [opts.ytQuery] : [])]
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
  const ytSeenQ = new Set<string>();
  const ytRaw: Omit<ExternalItem, "id">[] = [];
  const ytSeenVid = new Set<string>(); // videoId 전역 dedup(여러 키워드가 같은 영상 주면 첫 쿼리 것 유지).
  for (const q of ytQueries) {
    if (ytSeenQ.has(q)) continue;
    ytSeenQ.add(q);
    try {
      const rows = await searchYouTube(q, max);
      for (const r of rows) {
        // url = .../watch?v=<videoId> — videoId 추출해 전역 dedup.
        const vid = r.url.split("v=")[1] ?? r.url;
        if (ytSeenVid.has(vid)) continue;
        ytSeenVid.add(vid);
        ytRaw.push(r);
      }
    } catch (e) {
      console.warn(`[촉이 외부신호] YouTube 검색 실패(무시) q="${q}":`, e instanceof Error ? e.message : e);
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
