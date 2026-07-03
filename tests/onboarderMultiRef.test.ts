// 쏙이(onboarder) 다중 레퍼런스 — step0: onboarder-multi-ref.
//   ★ 2026-07-03 정정(onboarding-reference-quality): 근거 영상 랭킹이 배수→절대 조회수(rankExternalByViews)로 바뀜.
//     아래 케이스들은 subscriberCount가 동일해 배수 순서==조회수 순서라 기대값 자체는 동일(문구만 조회수 기준으로 정정).
//   (1) pickTopReferences: 조회수 상위 n개·viewCount null 후순위·부족하면 있는 만큼.
//   (2) prepareOnboarder: 최대 3개 references 조립 + 점진 완화((b) viewCount 필터 제거·(c) 재검색) + 0개면 throw.
//
// ★ mock은 '교체 가능한 impl 함수'로 둔다(vi.fn 아님). 이유: gather/자막 스텁이 throw(rejected promise)를
//   반환하면 vi.fn의 결과 추적(mock.results)이 그 rejected promise를 unhandled로 감지해 테스트를 실패로
//   승격시킨다(vitest 2.1.8). 실제 코드가 catch해 삼키므로, 추적 없는 plain 함수로 교체해 정상 동작을 검증한다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TranscriptResponse } from "youtube-transcript";

const yt = vi.hoisted(() => ({
  calls: 0,
  impl: async (_id: string, _cfg?: unknown): Promise<TranscriptResponse[]> => [],
}));
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: (id: string, cfg?: unknown) => {
      yt.calls++;
      return yt.impl(id, cfg);
    },
  },
}));

// gatherExternalSignals 스텁 — 호출마다 opts를 기록(완화 재검색 검증). 순수 랭킹 export는 원본 유지.
const gx = vi.hoisted(() => ({
  callsArgs: [] as Array<{ ytQuery?: string }>,
  impl: async (_opts: unknown): Promise<unknown[]> => [],
}));
vi.mock("../src/agents/topic_scout/externalSignals.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/agents/topic_scout/externalSignals.js")>();
  return {
    ...orig,
    gatherExternalSignals: (opts: { ytQuery?: string }) => {
      gx.callsArgs.push(opts);
      return gx.impl(opts);
    },
  };
});

import { prepareOnboarder, pickTopReferences } from "../src/agents/onboarder/prepare.js";
import type { ExternalItem } from "../src/agents/topic_scout/externalSignals.js";
import type { Supa } from "../src/pipeline/runState.js";

function ytItem(over: Partial<ExternalItem>): ExternalItem {
  return {
    id: "yt:0",
    source: "youtube",
    title: "제목",
    url: "https://www.youtube.com/watch?v=ABC123",
    publisher: "채널",
    published_at: null,
    snippet: "설명",
    viewCount: 100000,
    likeCount: null,
    commentCount: null,
    subscriberCount: 5000,
    thumbnailUrl: null,
    sourceQuery: "주제",
    ...over,
  };
}

function makeFakeSupa(topicTitle: string | null): Supa {
  const PROPOSAL = { id: "prop-topic", candidates: [{ idx: 0, payload: { title: topicTitle } }] };
  const SELECTION = { chosen_idx: 0, edited_payload: topicTitle != null ? { title: topicTitle } : null };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.order = self;
    chain.limit = self;
    chain.maybeSingle = async () => {
      switch (table) {
        case "stage_proposals":
          return { data: PROPOSAL, error: null };
        case "stage_selections":
          return { data: SELECTION, error: null };
        default:
          return { data: null, error: null };
      }
    };
    return chain;
  };
  return { from } as unknown as Supa;
}

describe("pickTopReferences — 순수(조회수 상위 n)", () => {
  it("조회수 desc 순서로 상위 3개를 돌려준다", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", url: "https://youtu.be/A", viewCount: 30000, subscriberCount: 10000 }), // 조회수 30k
      ytItem({ id: "yt:1", url: "https://youtu.be/B", viewCount: 100000, subscriberCount: 10000 }), // 조회수 100k
      ytItem({ id: "yt:2", url: "https://youtu.be/C", viewCount: 50000, subscriberCount: 10000 }), // 조회수 50k
      ytItem({ id: "yt:3", url: "https://youtu.be/D", viewCount: 20000, subscriberCount: 10000 }), // 조회수 20k
    ];
    expect(pickTopReferences(items, 3).map((r) => r.id)).toEqual(["yt:1", "yt:2", "yt:0"]);
  });

  it("조회수 랭킹: 초소형 채널 고배수 영상이 아니라 고조회 영상이 1위(근거 영상 목표)", () => {
    // 실측 재현: 조회수 734/구독자 1370 = 배수 0.54(옛 랭킹 1위)가 이제 꼴찌, 조회수 82k가 1위.
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", url: "https://youtu.be/A", viewCount: 734, subscriberCount: 1370 }),
      ytItem({ id: "yt:1", url: "https://youtu.be/B", viewCount: 82115, subscriberCount: 319000 }),
      ytItem({ id: "yt:2", url: "https://youtu.be/C", viewCount: 9104, subscriberCount: 283000 }),
    ];
    expect(pickTopReferences(items, 3).map((r) => r.id)).toEqual(["yt:1", "yt:2", "yt:0"]);
  });

  it("viewCount null·web은 eligible에서 빠져 후보에 없다", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", viewCount: 100000, subscriberCount: 10000 }),
      ytItem({ id: "yt:1", viewCount: null }), // viewCount null → 제외
      ytItem({ id: "yt:2", source: "web" }), // web → 제외
    ];
    expect(pickTopReferences(items, 3).map((r) => r.id)).toEqual(["yt:0"]);
  });

  it("후보가 2개뿐이면 2개만 돌려준다", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", viewCount: 100000, subscriberCount: 10000 }),
      ytItem({ id: "yt:1", viewCount: 50000, subscriberCount: 10000 }),
    ];
    expect(pickTopReferences(items, 3).length).toBe(2);
  });
});

describe("prepareOnboarder — 다중 레퍼런스 조립", () => {
  beforeEach(() => {
    yt.calls = 0;
    yt.impl = async () => [];
    gx.callsArgs = [];
    gx.impl = async () => [];
  });

  it("조회수 상위 3개를 references로 조립한다(각 videoId·videoFacts 채움)", async () => {
    gx.impl = async () => [
      ytItem({ id: "yt:0", url: "https://www.youtube.com/watch?v=AAA", viewCount: 30000, subscriberCount: 10000 }),
      ytItem({ id: "yt:1", url: "https://www.youtube.com/watch?v=BBB", viewCount: 100000, subscriberCount: 10000 }),
      ytItem({ id: "yt:2", url: "https://www.youtube.com/watch?v=CCC", viewCount: 50000, subscriberCount: 10000 }),
      ytItem({ id: "yt:3", url: "https://www.youtube.com/watch?v=DDD", viewCount: 20000, subscriberCount: 10000 }),
    ];
    const input = await prepareOnboarder(makeFakeSupa("파킹통장 TOP5"), "run-multi");
    expect(input.references.length).toBe(3);
    expect(input.references.map((r) => r.videoId)).toEqual(["BBB", "CCC", "AAA"]); // 조회수 desc
    expect(input.references.every((r) => r.videoFacts && r.videoFacts.length > 0)).toBe(true);
    expect(gx.callsArgs.length).toBe(1); // 3개 채워졌으니 완화 재검색 없음.
  });

  it("초소형 채널(구독자 낮음) 항목만 있어도 조회수 랭킹으로 3개 확보(0개 throw 없이·재검색 없이)", async () => {
    // 조회수 랭킹은 FLOOR_SUBS/구독자 무관 — viewCount만 있으면 step0 pickTopReferences가 3개를 그대로 뽑는다.
    // 검증 초점: 초소형 채널 항목만 있어도 최종 3개가 확보되고(0개 throw 안 됨) 재검색 없이 채워진다.
    gx.impl = async () => [
      ytItem({ id: "yt:0", url: "https://www.youtube.com/watch?v=AAA", viewCount: 100000, subscriberCount: 10 }),
      ytItem({ id: "yt:1", url: "https://www.youtube.com/watch?v=BBB", viewCount: 200000, subscriberCount: 20 }),
      ytItem({ id: "yt:2", url: "https://www.youtube.com/watch?v=CCC", viewCount: 300000, subscriberCount: 30 }),
    ];
    const input = await prepareOnboarder(makeFakeSupa("아주 희귀한 주제 여러 단어"), "run-relax");
    expect(input.references.length).toBe(3);
    expect(gx.callsArgs.length).toBe(1); // step0 pickTopReferences로 채워짐 → (b)/(c) 불필요·재검색 없음.
  });

  it("검색어 완화(c)까지 가면 relaxQuery로 재검색한다", async () => {
    // 1차 검색은 []·이어 (b) 조회수 재랭킹도 [] → (c) 재검색에서 3개 확보. gather가 두 번, 두 번째는 완화어.
    let call = 0;
    gx.impl = async () => {
      call++;
      if (call === 1) return []; // 기본 검색 0개
      return [
        ytItem({ id: "yt:0", url: "https://www.youtube.com/watch?v=AAA", viewCount: 100000, subscriberCount: 10000 }),
        ytItem({ id: "yt:1", url: "https://www.youtube.com/watch?v=BBB", viewCount: 200000, subscriberCount: 10000 }),
        ytItem({ id: "yt:2", url: "https://www.youtube.com/watch?v=CCC", viewCount: 300000, subscriberCount: 10000 }),
      ];
    };
    const input = await prepareOnboarder(makeFakeSupa("사회초년생 파킹통장 추천 정리"), "run-relax-c");
    expect(input.references.length).toBe(3);
    expect(gx.callsArgs.length).toBe(2); // 기본 + 완화 재검색.
    expect(gx.callsArgs[1]!.ytQuery).not.toBe("사회초년생 파킹통장 추천 정리"); // 완화어(앞 절반)로 재검색.
  });

  it("topic 있고 최종 0개면 온보딩 불가로 throw한다", async () => {
    gx.impl = async () => [];
    await expect(prepareOnboarder(makeFakeSupa("아무 주제"), "run-zero")).rejects.toThrow(/온보딩 불가/);
  });
});
