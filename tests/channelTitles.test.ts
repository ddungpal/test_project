// channel-titles-ingest step0 — 순수 파서 단위 테스트(네트워크 없음).
//   YouTube Data API v3 응답 형태를 인라인 픽스처로 모사.
import { describe, it, expect } from "vitest";
import {
  parseUploadsPlaylistId,
  parseRecentTitles,
  resolveChannelQuery,
} from "../src/ingest/channelTitles.js";

describe("parseUploadsPlaylistId", () => {
  it("channels.list 응답에서 업로드 재생목록 ID 추출", () => {
    const resp = {
      items: [
        { contentDetails: { relatedPlaylists: { uploads: "UUabc123", likes: "" } } },
      ],
    };
    expect(parseUploadsPlaylistId(resp)).toBe("UUabc123");
  });

  it("items 없으면 throw", () => {
    expect(() => parseUploadsPlaylistId({ items: [] })).toThrow();
    expect(() => parseUploadsPlaylistId({})).toThrow();
  });

  it("uploads 누락이면 throw", () => {
    expect(() =>
      parseUploadsPlaylistId({ items: [{ contentDetails: { relatedPlaylists: {} } }] }),
    ).toThrow();
  });
});

describe("parseRecentTitles", () => {
  // 50개 정상 + 제목 누락/공백 2개 섞은 픽스처.
  const makeItem = (i: number) => ({
    snippet: {
      title: `김짠부 영상 제목 ${i}`,
      publishedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      resourceId: { kind: "youtube#video", videoId: `vid_${i}` },
    },
  });

  it("정상 항목들을 ChannelTitle[]로 파싱", () => {
    const resp = { items: Array.from({ length: 50 }, (_, i) => makeItem(i)) };
    const out = parseRecentTitles(resp);
    expect(out).toHaveLength(50);
    expect(out[0]).toEqual({
      video_id: "vid_0",
      title: "김짠부 영상 제목 0",
      published_at: "2026-01-01T00:00:00Z",
    });
  });

  it("제목 누락/공백 항목은 제외", () => {
    const resp = {
      items: [
        makeItem(1),
        { snippet: { title: "", resourceId: { videoId: "empty" } } },
        { snippet: { title: "   ", resourceId: { videoId: "blank" } } },
        { snippet: { resourceId: { videoId: "noTitle" } } },
        makeItem(2),
      ],
    };
    const out = parseRecentTitles(resp);
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.video_id)).toEqual(["vid_1", "vid_2"]);
  });

  it("videoId 누락 항목도 제외", () => {
    const resp = { items: [{ snippet: { title: "videoId 없음", resourceId: {} } }] };
    expect(parseRecentTitles(resp)).toHaveLength(0);
  });

  it("publishedAt 누락이면 null", () => {
    const resp = { items: [{ snippet: { title: "날짜 없음", resourceId: { videoId: "x" } } }] };
    expect(parseRecentTitles(resp)[0]?.published_at).toBeNull();
  });

  it("items 자체가 없으면 빈 배열", () => {
    expect(parseRecentTitles({})).toEqual([]);
    expect(parseRecentTitles({ items: [] })).toEqual([]);
  });
});

describe("resolveChannelQuery", () => {
  it("@handle → forHandle", () => {
    expect(resolveChannelQuery("@zzanboo")).toEqual({ forHandle: "zzanboo" });
  });

  it("youtube.com/@handle URL → forHandle", () => {
    expect(resolveChannelQuery("youtube.com/@zzanboo")).toEqual({ forHandle: "zzanboo" });
    expect(resolveChannelQuery("https://www.youtube.com/@zzanboo")).toEqual({ forHandle: "zzanboo" });
    expect(resolveChannelQuery("https://www.youtube.com/@zzanboo/videos")).toEqual({ forHandle: "zzanboo" });
  });

  it("channel/UCxxxx URL → id", () => {
    expect(resolveChannelQuery("youtube.com/channel/UCabc_123-XY")).toEqual({ id: "UCabc_123-XY" });
    expect(resolveChannelQuery("https://www.youtube.com/channel/UCabc_123-XY")).toEqual({ id: "UCabc_123-XY" });
  });

  it("그 외 형태는 forHandle 폴백", () => {
    expect(resolveChannelQuery("zzanboo")).toEqual({ forHandle: "zzanboo" });
    expect(resolveChannelQuery("youtube.com/c/zzanboo")).toEqual({ forHandle: "zzanboo" });
  });
});
