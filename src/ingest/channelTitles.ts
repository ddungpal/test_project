// 채널 제목 ingest — 순수 파서 + 네트워크 fetch. scripts/ingest-channel-titles.ts와 서버 액션이 공유.
//   YouTube Data API v3 응답 형태를 다룬다. fetchChannelTitles는 파일 I/O 없이 메모리로만 흐른다(서버리스 호환).

// YouTube Data API v3 base — ingest-youtube/ingest-channel-titles와 단일 출처.
export const YT_API = "https://www.googleapis.com/youtube/v3";

// channels.list(part=contentDetails) 응답 → 업로드 재생목록 ID. 없으면 throw(상위에서 명확 실패).
export function parseUploadsPlaylistId(channelsResponse: unknown): string {
  const items = (channelsResponse as { items?: unknown[] })?.items;
  const first = items?.[0] as { contentDetails?: { relatedPlaylists?: { uploads?: unknown } } } | undefined;
  const uploads = first?.contentDetails?.relatedPlaylists?.uploads;
  if (typeof uploads !== "string" || !uploads) {
    throw new Error("업로드 재생목록 ID를 찾을 수 없음(channels.list 응답 확인) — 채널 식별자가 맞는지 점검");
  }
  return uploads;
}

export interface ChannelTitle {
  video_id: string;
  title: string;
  published_at: string | null;
}

// playlistItems.list(part=snippet) 응답 → 제목 목록. 제목 공백/누락 항목은 제외.
export function parseRecentTitles(playlistItemsResponse: unknown): ChannelTitle[] {
  const items = (playlistItemsResponse as { items?: unknown[] })?.items ?? [];
  const out: ChannelTitle[] = [];
  for (const it of items) {
    const snip = (it as { snippet?: unknown })?.snippet as
      | { title?: unknown; publishedAt?: unknown; resourceId?: { videoId?: unknown } }
      | undefined;
    if (!snip) continue;
    const title = typeof snip.title === "string" ? snip.title.trim() : "";
    if (!title) continue; // 공백/누락 제외
    const videoId = typeof snip.resourceId?.videoId === "string" ? snip.resourceId.videoId : "";
    if (!videoId) continue;
    out.push({
      video_id: videoId,
      title,
      published_at: typeof snip.publishedAt === "string" ? snip.publishedAt : null,
    });
  }
  return out;
}

// 채널 식별자 정규화 → channels.list 쿼리 파라미터로 쓸 형태.
//   "@zzanboo" / "youtube.com/@zzanboo" → {forHandle:"zzanboo"}
//   "youtube.com/channel/UCxxxx" → {id:"UCxxxx"}
//   그 외 → forHandle 폴백(앞의 @·URL 잔여 제거).
export function resolveChannelQuery(input: string): { forHandle: string } | { id: string } {
  const raw = (input ?? "").trim();
  // 채널ID URL: .../channel/UCxxxx
  const channelMatch = raw.match(/channel\/([A-Za-z0-9_-]+)/);
  if (channelMatch?.[1]) return { id: channelMatch[1] };
  // 핸들 URL: .../@handle  (경로 끝/슬래시까지)
  const handleUrlMatch = raw.match(/@([^/?#\s]+)/);
  if (handleUrlMatch?.[1]) return { forHandle: handleUrlMatch[1] };
  // URL 형태이지만 @·channel이 없으면 마지막 경로 조각을 핸들로 폴백
  const stripped = raw.replace(/^https?:\/\//, "").replace(/^(www\.)?youtube\.com\/?/, "");
  const last = stripped.split(/[/?#]/).filter(Boolean).pop() ?? stripped;
  return { forHandle: last.replace(/^@/, "") };
}

// 채널 핸들/URL → 최근 50개 제목(네트워크). 파일 쓰기 없음. statistics(조회수) 안 부름 — 제목만.
//   resolveChannelQuery → channels.list(part=contentDetails) → parseUploadsPlaylistId
//   → playlistItems.list(part=snippet, maxResults=50) → parseRecentTitles → slice(0,50).
//   서버 액션·CLI 공유 경로(단일 출처). FS 미접근(Vercel 서버리스 호환).
export async function fetchChannelTitles(channelInput: string, apiKey: string): Promise<ChannelTitle[]> {
  const query = resolveChannelQuery(channelInput);

  // 1) channels.list(part=contentDetails) — 핸들은 forHandle, 채널ID는 id 파라미터.
  const cp = new URLSearchParams({ part: "contentDetails", key: apiKey });
  if ("forHandle" in query) cp.set("forHandle", query.forHandle);
  else cp.set("id", query.id);
  const cRes = await fetch(`${YT_API}/channels?${cp}`);
  if (!cRes.ok) throw new Error(`channels.list ${cRes.status}: ${await cRes.text().catch(() => "")}`);
  const cData: unknown = await cRes.json();
  const uploadsPlaylistId = parseUploadsPlaylistId(cData);

  // 2) playlistItems.list(part=snippet, maxResults=50) — 최근 업로드.
  const pp = new URLSearchParams({ part: "snippet", playlistId: uploadsPlaylistId, maxResults: "50", key: apiKey });
  const pRes = await fetch(`${YT_API}/playlistItems?${pp}`);
  if (!pRes.ok) throw new Error(`playlistItems.list ${pRes.status}: ${await pRes.text().catch(() => "")}`);
  const pData: unknown = await pRes.json();
  return parseRecentTitles(pData).slice(0, 50);
}
