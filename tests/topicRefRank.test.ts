// rankExternalByMultiplier 순수함수 테스트 — 촉이 youtube 레퍼런스 배수 랭킹(topic-ref-multiplier step0).
//   버그: 키워드 모드 주제 런이 youtube를 배수 랭킹 없이 앞 6개 slice → 플롭(구독 73만·조회 3.9만=0.05배)이 레퍼런스로 노출.
//   처방: slice 전 배수(views/subscribers) desc 정렬. 정렬은 hook_maker/externalRefs.pickTopExternalTitles 미러.
import { describe, it, expect } from "vitest";
import { rankExternalByMultiplier, type ExternalItem } from "../src/agents/topic_scout/externalSignals.js";
import { FLOOR_SUBS } from "../src/agents/hook_maker/externalRefs.js";

function yt(id: string, viewCount: number | null, subscriberCount: number | null = null): ExternalItem {
  return {
    id,
    source: "youtube",
    title: `제목 ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    publisher: "어떤채널",
    published_at: null,
    snippet: "",
    viewCount,
    likeCount: null,
    commentCount: null,
    subscriberCount,
    thumbnailUrl: null,
    sourceQuery: null,
  };
}

describe("rankExternalByMultiplier (순수함수)", () => {
  it("① 고배수(구독 적어도 조회 큰) 영상이 저배수 플롭보다 앞", () => {
    const items: ExternalItem[] = [
      // 구독 73만·조회 3.9만 = 0.05배 플롭(명세의 실제 사례)
      yt("flop", 39_000, 730_000),
      // 구독 5천·조회 20만 = 40배 아웃라이어
      yt("outlier", 200_000, 5_000),
    ];
    const out = rankExternalByMultiplier(items, 6, FLOOR_SUBS);
    expect(out.map((r) => r.id)).toEqual(["outlier", "flop"]);
  });

  it("② 풀이 n보다 크면 플롭이 잘려나간다", () => {
    const items: ExternalItem[] = [
      yt("a", 100_000, 5_000), // 20배
      yt("b", 90_000, 5_000), //  18배
      yt("flop", 39_000, 730_000), // 0.05배 — n=2면 컷
    ];
    const out = rankExternalByMultiplier(items, 2, FLOOR_SUBS);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
    expect(out.map((r) => r.id)).not.toContain("flop");
  });

  it("③ 풀이 n보다 작으면 전부 유지(누락 0)·플롭도 맨 뒤에 남는다", () => {
    const items: ExternalItem[] = [
      yt("flop", 39_000, 730_000), // 0.05배
      yt("good", 200_000, 5_000), // 40배
    ];
    const out = rankExternalByMultiplier(items, 6, FLOOR_SUBS);
    expect(out).toHaveLength(2); // 누락 0
    expect(out.map((r) => r.id)).toEqual(["good", "flop"]); // 플롭은 맨 뒤
  });

  it("④ 배수 null(구독 비공개) 항목은 후순위로 가되 버려지지 않는다", () => {
    const items: ExternalItem[] = [
      yt("hidden", 5_000_000, null), // 구독 비공개 → 배수 null
      yt("mult", 50_000, 5_000), // 배수 10
    ];
    const out = rankExternalByMultiplier(items, 6, FLOOR_SUBS);
    expect(out.map((r) => r.id)).toEqual(["mult", "hidden"]); // 배수 있는 게 앞, null은 후순위
    expect(out).toHaveLength(2); // 버려지지 않음
  });

  it("⑤ FLOOR_SUBS 미만 초소형 채널은 배수 null 취급 → 후순위", () => {
    const items: ExternalItem[] = [
      // 구독 10명·조회 1만 = 1000배지만 FLOOR_SUBS(1000) 미만 → 배수 null
      yt("tiny", 10_000, 10),
      // 구독 2천·조회 1만 = 5배 (정상 랭킹)
      yt("normal", 10_000, 2_000),
    ];
    const out = rankExternalByMultiplier(items, 6, FLOOR_SUBS);
    expect(out.map((r) => r.id)).toEqual(["normal", "tiny"]);
  });

  it("⑥ 배수 둘 다 null이면 viewCount desc 보조 정렬", () => {
    const items: ExternalItem[] = [
      yt("lo", 100, null),
      yt("hi", 500, null),
    ];
    const out = rankExternalByMultiplier(items, 6, FLOOR_SUBS);
    expect(out.map((r) => r.id)).toEqual(["hi", "lo"]);
  });

  it("⑦ 배수·조회수 동률은 id asc로 안정 정렬(결정적)", () => {
    const items: ExternalItem[] = [
      yt("zzz", 100_000, 5_000),
      yt("aaa", 100_000, 5_000),
      yt("mmm", 100_000, 5_000),
    ];
    const out = rankExternalByMultiplier(items, 6, FLOOR_SUBS);
    expect(out.map((r) => r.id)).toEqual(["aaa", "mmm", "zzz"]);
  });

  it("⑧ 입력 배열을 변형하지 않는다(복사 정렬)", () => {
    const items: ExternalItem[] = [
      yt("flop", 39_000, 730_000),
      yt("outlier", 200_000, 5_000),
    ];
    const before = items.map((r) => r.id);
    rankExternalByMultiplier(items, 6, FLOOR_SUBS);
    expect(items.map((r) => r.id)).toEqual(before); // 원본 순서 불변
  });

  it("⑨ 빈 입력 → 빈 배열", () => {
    expect(rankExternalByMultiplier([], 6, FLOOR_SUBS)).toEqual([]);
  });
});
