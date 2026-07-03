// rankExternalByViews — 절대 조회수 desc 상위 n(근거 영상용). 순수·결정적·입력 비변형.
//   정렬: viewCount desc(null은 -Infinity로 후순위) → tie는 subscriberCount desc(null은 -Infinity) → 최종 id asc(안정).
//   ★ rankExternalByMultiplier(배수·발굴용)와 목표가 정반대 — 근거 영상은 "많이 본 = 잘 전달됨".
import { describe, it, expect } from "vitest";
import { rankExternalByViews, type ExternalItem } from "../src/agents/topic_scout/externalSignals.js";

function ytItem(over: Partial<ExternalItem>): ExternalItem {
  return {
    id: "yt:0",
    source: "youtube",
    title: "제목",
    url: "https://www.youtube.com/watch?v=ABC",
    publisher: "채널",
    published_at: null,
    snippet: "설명",
    viewCount: 1000,
    likeCount: null,
    commentCount: null,
    subscriberCount: 5000,
    thumbnailUrl: null,
    sourceQuery: "주제",
    ...over,
  };
}

describe("rankExternalByViews — 절대 조회수 desc", () => {
  it("viewCount desc 순서로 정렬한다(배수 무관 — 초소형 고배수 영상이 아니라 고조회 우선)", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", viewCount: 734, subscriberCount: 1370 }), // 배수 최고지만 조회수 최저 → 마지막
      ytItem({ id: "yt:1", viewCount: 82115, subscriberCount: 319000 }),
      ytItem({ id: "yt:2", viewCount: 9104, subscriberCount: 283000 }),
    ];
    expect(rankExternalByViews(items, 3).map((r) => r.id)).toEqual(["yt:1", "yt:2", "yt:0"]);
  });

  it("viewCount null은 후순위(-Infinity)로 밀린다", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", viewCount: null }),
      ytItem({ id: "yt:1", viewCount: 5000 }),
      ytItem({ id: "yt:2", viewCount: 100 }),
    ];
    expect(rankExternalByViews(items, 3).map((r) => r.id)).toEqual(["yt:1", "yt:2", "yt:0"]);
  });

  it("viewCount 동률이면 subscriberCount desc로 tiebreak", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", viewCount: 5000, subscriberCount: 1000 }),
      ytItem({ id: "yt:1", viewCount: 5000, subscriberCount: 9000 }),
      ytItem({ id: "yt:2", viewCount: 5000, subscriberCount: 3000 }),
    ];
    expect(rankExternalByViews(items, 3).map((r) => r.id)).toEqual(["yt:1", "yt:2", "yt:0"]);
  });

  it("subscriberCount null은 tiebreak에서 후순위(-Infinity)", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", viewCount: 5000, subscriberCount: null }),
      ytItem({ id: "yt:1", viewCount: 5000, subscriberCount: 100 }),
    ];
    expect(rankExternalByViews(items, 2).map((r) => r.id)).toEqual(["yt:1", "yt:0"]);
  });

  it("viewCount·subscriberCount 모두 동률이면 id asc로 안정 정렬", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:9", viewCount: 5000, subscriberCount: 1000 }),
      ytItem({ id: "yt:2", viewCount: 5000, subscriberCount: 1000 }),
      ytItem({ id: "yt:5", viewCount: 5000, subscriberCount: 1000 }),
    ];
    expect(rankExternalByViews(items, 3).map((r) => r.id)).toEqual(["yt:2", "yt:5", "yt:9"]);
  });

  it("slice(0, n) — 상위 n개만", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", viewCount: 100 }),
      ytItem({ id: "yt:1", viewCount: 200 }),
      ytItem({ id: "yt:2", viewCount: 300 }),
      ytItem({ id: "yt:3", viewCount: 400 }),
    ];
    const out = rankExternalByViews(items, 2);
    expect(out.length).toBe(2);
    expect(out.map((r) => r.id)).toEqual(["yt:3", "yt:2"]);
  });

  it("입력 배열을 변형하지 않는다([...items].sort)", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", viewCount: 100 }),
      ytItem({ id: "yt:1", viewCount: 900 }),
      ytItem({ id: "yt:2", viewCount: 500 }),
    ];
    const before = items.map((r) => r.id);
    rankExternalByViews(items, 3);
    expect(items.map((r) => r.id)).toEqual(before); // 원본 순서 보존
  });

  it("빈 입력 → []", () => {
    expect(rankExternalByViews([], 3)).toEqual([]);
  });
});
