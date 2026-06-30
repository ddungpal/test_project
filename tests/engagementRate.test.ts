// engagementRate·mergeSearchPasses 순수함수 단위테스트(search-pool-engagement step0).
//   engagementRate = (좋아요+댓글) / 조회수. 조회수 부족·비유한·≤0이면 null.
//   likes·comments 둘 다 null이면 반응도 미상 → null, 하나라도 있으면 있는 것만 합산.
//   네트워크(search.list·videos.list)는 단위테스트 생략 — 순수 가공부만 검증.

import { describe, expect, it } from "vitest";
import { engagementRate, mergeSearchPasses } from "../src/agents/topic_scout/externalSignals.js";

describe("engagementRate", () => {
  it("정상: (좋아요 800 + 댓글 200) / 조회 10만 = 0.01", () => {
    expect(engagementRate(100_000, 800, 200)).toBe(0.01);
  });

  it("좋아요만(댓글 null): 100 / 1만 = 0.01", () => {
    expect(engagementRate(10_000, 100, null)).toBe(0.01);
  });

  it("댓글만(좋아요 null): 50 / 1만 = 0.005", () => {
    expect(engagementRate(10_000, null, 50)).toBe(0.005);
  });

  it("좋아요·댓글 둘 다 null → null(반응도 미상)", () => {
    expect(engagementRate(10_000, null, null)).toBeNull();
    expect(engagementRate(10_000, undefined, undefined)).toBeNull();
  });

  it("조회수 0 → null(0 나눗셈 방지)", () => {
    expect(engagementRate(0, 100, 50)).toBeNull();
  });

  it("조회수 null/undefined → null", () => {
    expect(engagementRate(null, 100, 50)).toBeNull();
    expect(engagementRate(undefined, 100, 50)).toBeNull();
  });

  it("조회수 음수 → null", () => {
    expect(engagementRate(-100, 100, 50)).toBeNull();
  });

  it("조회수 NaN·Infinity → null(비유한 방어)", () => {
    expect(engagementRate(NaN, 100, 50)).toBeNull();
    expect(engagementRate(Infinity, 100, 50)).toBeNull();
  });

  it("좋아요 0·댓글 0(공개됐으나 0개) → 0(미상 아님)", () => {
    expect(engagementRate(10_000, 0, 0)).toBe(0);
  });
});

describe("mergeSearchPasses", () => {
  const mk = (vid: string, title = vid) => ({ id: { videoId: vid }, snippet: { title } });

  it("videoId 중복 제거 — 같은 영상이 두 패스에 있으면 1개로", () => {
    const relevance = [mk("a"), mk("b")];
    const viewCount = [mk("b"), mk("c")];
    const merged = mergeSearchPasses(relevance, viewCount);
    expect(merged.map((x) => x.id?.videoId)).toEqual(["a", "b", "c"]);
  });

  it("먼저 온 패스(relevance) 우선 — 첫 등장 항목 유지", () => {
    const relevance = [mk("b", "relevance-b")];
    const viewCount = [mk("b", "viewcount-b")];
    const merged = mergeSearchPasses(relevance, viewCount);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.snippet?.title).toBe("relevance-b");
  });

  it("union이 단일 패스보다 풀이 커진다(겹치지 않으면 합산)", () => {
    const merged = mergeSearchPasses([mk("a"), mk("b")], [mk("c"), mk("d")]);
    expect(merged).toHaveLength(4);
  });

  it("videoId 없는 항목은 제외", () => {
    const merged = mergeSearchPasses([{ snippet: { title: "no-id" } }, mk("a")]);
    expect(merged.map((x) => x.id?.videoId)).toEqual(["a"]);
  });

  it("한 패스가 비어도(실패 폴백) 나머지로 union 유지", () => {
    const merged = mergeSearchPasses([], [mk("a"), mk("b")]);
    expect(merged.map((x) => x.id?.videoId)).toEqual(["a", "b"]);
  });
});
