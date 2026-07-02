// topic-keyword-spread step0 — 발굴 모드 한 테마 쏠림 버그 픽스 단위테스트.
//   pickSpreadYoutube: 테마(sourceQuery)별 라운드로빈 분산(순수·결정적).
//   gatherExternalSignals: 여러 ytQueries → videoId 전역 dedup + sourceQuery 태깅(fetch는 fake로 분리).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gatherExternalSignals, pickSpreadYoutube, type ExternalItem } from "../src/agents/topic_scout/externalSignals.js";

const FLOOR = 1000;

// 테스트용 youtube ExternalItem 팩토리.
function yt(over: Partial<ExternalItem> & { id: string }): ExternalItem {
  return {
    source: "youtube",
    title: `제목 ${over.id}`,
    url: `https://www.youtube.com/watch?v=${over.id}`,
    publisher: "어떤채널",
    published_at: null,
    snippet: "",
    viewCount: 100_000,
    likeCount: null,
    commentCount: null,
    subscriberCount: 10_000, // 배수 10 기본(FLOOR 이상)
    thumbnailUrl: null,
    sourceQuery: null,
    ...over,
  };
}

describe("pickSpreadYoutube — 테마별 분산 선택", () => {
  it("3테마 입력 → n=6이면 한 테마 쏠림 없이 분산(라운드로빈)", () => {
    // 각 테마 3개씩(배수 차등). n=6이면 테마당 2개씩 균등.
    const items: ExternalItem[] = [
      yt({ id: "a1", sourceQuery: "파킹통장", subscriberCount: 5_000 }), // 배수 20
      yt({ id: "a2", sourceQuery: "파킹통장", subscriberCount: 10_000 }), // 배수 10
      yt({ id: "a3", sourceQuery: "파킹통장", subscriberCount: 20_000 }), // 배수 5
      yt({ id: "b1", sourceQuery: "ISA", subscriberCount: 5_000 }),
      yt({ id: "b2", sourceQuery: "ISA", subscriberCount: 10_000 }),
      yt({ id: "b3", sourceQuery: "ISA", subscriberCount: 20_000 }),
      yt({ id: "c1", sourceQuery: "연금", subscriberCount: 5_000 }),
      yt({ id: "c2", sourceQuery: "연금", subscriberCount: 10_000 }),
      yt({ id: "c3", sourceQuery: "연금", subscriberCount: 20_000 }),
    ];
    const picked = pickSpreadYoutube(items, 6, FLOOR);
    expect(picked).toHaveLength(6);
    // 테마별 카운트 — 한 테마에 쏠리지 않고 각 2개씩.
    const byTheme = picked.reduce<Record<string, number>>((m, it) => {
      const k = it.sourceQuery ?? "";
      m[k] = (m[k] ?? 0) + 1;
      return m;
    }, {});
    expect(byTheme["파킹통장"]).toBe(2);
    expect(byTheme["ISA"]).toBe(2);
    expect(byTheme["연금"]).toBe(2);
  });

  it("각 테마 내부는 배수(viewsPerSubscriber) desc 정렬", () => {
    const items: ExternalItem[] = [
      yt({ id: "a3", sourceQuery: "파킹통장", subscriberCount: 20_000 }), // 배수 5
      yt({ id: "a1", sourceQuery: "파킹통장", subscriberCount: 5_000 }), // 배수 20
      yt({ id: "a2", sourceQuery: "파킹통장", subscriberCount: 10_000 }), // 배수 10
      yt({ id: "b1", sourceQuery: "ISA", subscriberCount: 5_000 }),
    ];
    const picked = pickSpreadYoutube(items, 4, FLOOR);
    // 파킹통장 그룹만 추려서 배수 desc인지(a1 20 > a2 10 > a3 5).
    const parking = picked.filter((p) => p.sourceQuery === "파킹통장").map((p) => p.id);
    expect(parking).toEqual(["a1", "a2", "a3"]);
  });

  it("라운드로빈 순서 — 테마1 1위, 테마2 1위, 테마1 2위 …", () => {
    const items: ExternalItem[] = [
      yt({ id: "a1", sourceQuery: "테마1", subscriberCount: 5_000 }), // 배수 20(1위)
      yt({ id: "a2", sourceQuery: "테마1", subscriberCount: 10_000 }), // 배수 10(2위)
      yt({ id: "b1", sourceQuery: "테마2", subscriberCount: 5_000 }),
      yt({ id: "b2", sourceQuery: "테마2", subscriberCount: 10_000 }),
    ];
    const picked = pickSpreadYoutube(items, 4, FLOOR).map((p) => p.id);
    // round0: a1, b1 / round1: a2, b2
    expect(picked).toEqual(["a1", "b1", "a2", "b2"]);
  });

  it("1테마만 있으면 그 테마에서 n개(폴백·기존 동작)", () => {
    const items: ExternalItem[] = [
      yt({ id: "a1", sourceQuery: "파킹통장", subscriberCount: 5_000 }), // 배수 20
      yt({ id: "a2", sourceQuery: "파킹통장", subscriberCount: 10_000 }), // 배수 10
      yt({ id: "a3", sourceQuery: "파킹통장", subscriberCount: 20_000 }), // 배수 5
    ];
    const picked = pickSpreadYoutube(items, 2, FLOOR).map((p) => p.id);
    expect(picked).toEqual(["a1", "a2"]); // 배수 desc 상위 2.
  });

  it("sourceQuery null(웹·태그 없음)도 한 그룹으로 보존(누락 방지)", () => {
    const items: ExternalItem[] = [
      yt({ id: "n1", sourceQuery: null, subscriberCount: 5_000 }),
      yt({ id: "n2", sourceQuery: null, subscriberCount: 10_000 }),
    ];
    const picked = pickSpreadYoutube(items, 5, FLOOR).map((p) => p.id);
    expect(picked).toEqual(["n1", "n2"]); // null 그룹도 누락 없이 전부.
  });

  it("입력 배열을 변형하지 않는다(순수)", () => {
    const items: ExternalItem[] = [
      yt({ id: "a1", sourceQuery: "t", subscriberCount: 20_000 }),
      yt({ id: "a2", sourceQuery: "t", subscriberCount: 5_000 }),
    ];
    const before = items.map((it) => it.id);
    pickSpreadYoutube(items, 2, FLOOR);
    expect(items.map((it) => it.id)).toEqual(before);
  });
});

// gatherExternalSignals 가공부(여러 ytQueries → dedup·태깅). fetch를 fake로 분리(URL 분기).
describe("gatherExternalSignals — 다중 ytQuery dedup·sourceQuery 태깅", () => {
  // fetch 레벨(dedup·태깅) 검증이 목적 → youtubeFixture 레이어를 우회(off=항상 라이브)해야 fetch 스텁이
  //   그대로 관통한다. 안 그러면 record가 레포 fixtures/youtube에 파일을 남기고 캐시가 fetch 카운트를 흐린다.
  const OLD_YT_FIX = process.env.YOUTUBE_FIXTURES;
  beforeEach(() => {
    process.env.YOUTUBE_FIXTURES = "off";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.YOUTUBE_API_KEY;
    if (OLD_YT_FIX === undefined) delete process.env.YOUTUBE_FIXTURES;
    else process.env.YOUTUBE_FIXTURES = OLD_YT_FIX;
  });

  // search.list만 videoId를 반환하는 fake. videos/channels.list는 빈 응답(stats 보강 best-effort 생략).
  function stubYoutubeFetch(searchResults: Record<string, string[]>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname.endsWith("/search")) {
          const q = u.searchParams.get("q") ?? "";
          const vids = searchResults[q] ?? [];
          const items = vids.map((vid) => ({
            id: { videoId: vid },
            snippet: { title: `${q}-${vid}`, channelId: `ch-${vid}`, channelTitle: "채널" },
          }));
          return { ok: true, json: async () => ({ items }) } as unknown as Response;
        }
        // videos.list / channels.list → 빈(stats 없음).
        return { ok: true, json: async () => ({ items: [] }) } as unknown as Response;
      }),
    );
  }

  it("여러 ytQueries → 결과를 각 쿼리로 sourceQuery 태깅", async () => {
    process.env.YOUTUBE_API_KEY = "fake";
    stubYoutubeFetch({ 파킹통장: ["v1", "v2"], ISA: ["v3"] });
    const items = await gatherExternalSignals({ webQueries: [], ytQueries: ["파킹통장", "ISA"], maxPerQuery: 5 });
    const yt = items.filter((i) => i.source === "youtube");
    const tagByVid = new Map(yt.map((i) => [i.url.split("v=")[1], i.sourceQuery]));
    expect(tagByVid.get("v1")).toBe("파킹통장");
    expect(tagByVid.get("v2")).toBe("파킹통장");
    expect(tagByVid.get("v3")).toBe("ISA");
  });

  it("여러 쿼리가 같은 videoId를 주면 videoId 전역 dedup(첫 쿼리 것 유지)", async () => {
    process.env.YOUTUBE_API_KEY = "fake";
    // 두 쿼리 모두 vdup을 반환 → 첫 쿼리(파킹통장)의 태그만 살아남아야.
    stubYoutubeFetch({ 파킹통장: ["vdup", "vA"], ISA: ["vdup", "vB"] });
    const items = await gatherExternalSignals({ webQueries: [], ytQueries: ["파킹통장", "ISA"], maxPerQuery: 5 });
    const yt = items.filter((i) => i.source === "youtube");
    const vids = yt.map((i) => i.url.split("v=")[1]);
    // vdup은 한 번만(전역 dedup).
    expect(vids.filter((v) => v === "vdup")).toHaveLength(1);
    const dup = yt.find((i) => i.url.split("v=")[1] === "vdup")!;
    expect(dup.sourceQuery).toBe("파킹통장"); // 첫 쿼리 것 유지.
    expect(vids).toContain("vA");
    expect(vids).toContain("vB");
  });

  it("빈/공백 쿼리는 스킵, 단일 ytQuery도 흡수(하위호환)", async () => {
    process.env.YOUTUBE_API_KEY = "fake";
    stubYoutubeFetch({ 파킹통장: ["v1"] });
    const items = await gatherExternalSignals({ webQueries: [], ytQueries: ["", "  "], ytQuery: "파킹통장", maxPerQuery: 5 });
    const yt = items.filter((i) => i.source === "youtube");
    expect(yt).toHaveLength(1);
    expect(yt[0]!.sourceQuery).toBe("파킹통장");
  });
});
