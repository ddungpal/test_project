// 쏙이(onboarder) 입력 — step2: onboarding-transcript-input.
//   (1) fetchTranscript: 실패/없음 → null(throw 0). youtube-transcript를 mock으로 스텁.
//   (2) prepareOnboarder: 자막 null이면 transcript 생략, 나머지 필드로 유효한 OnboarderInput(fake supa 라운드트립).
//
// ★ mock은 '교체 가능한 impl 함수'로 둔다(vi.fn 아님). 이유: 자막/수집 스텁이 throw(rejected promise)를
//   반환하면 vi.fn의 결과 추적(mock.results)이 그 rejected promise를 unhandled로 감지해 테스트를 실패로
//   승격시킨다(vitest 2.1.8). fetchTranscript/prepare는 실제로 catch해 삼키므로, 추적 없는 plain 함수로
//   교체하면 그 정상 동작을 그대로 검증할 수 있다. 호출 여부는 별도 카운터로 센다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TranscriptResponse } from "youtube-transcript";

// youtube-transcript.fetchTranscript(static) 스텁 — 교체 가능한 impl + 호출 카운터.
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

// gatherExternalSignals 스텁 — 교체 가능한 impl + 호출 카운터. 나머지 export(순수 랭킹)는 원본 유지.
const gx = vi.hoisted(() => ({
  calls: 0,
  impl: async (_opts: unknown): Promise<unknown[]> => [],
}));
vi.mock("../src/agents/topic_scout/externalSignals.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/agents/topic_scout/externalSignals.js")>();
  return {
    ...orig,
    gatherExternalSignals: (opts: unknown) => {
      gx.calls++;
      return gx.impl(opts);
    },
  };
});

import { fetchTranscript } from "../src/lib/onboarding/transcript.js";
import {
  prepareOnboarder,
  extractVideoId,
  buildVideoFacts,
  pickTopReference,
} from "../src/agents/onboarder/prepare.js";
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

// (run, "topic") 선택 payload를 돌려주는 최소 fake supa. title 없으면 selection null.
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

describe("fetchTranscript — best-effort(throw 0)", () => {
  beforeEach(() => {
    yt.calls = 0;
    yt.impl = async () => [];
  });

  it("자막이 있으면 세그먼트를 이어붙인 문자열을 반환한다", async () => {
    yt.impl = async () => [
      { text: "안녕", duration: 1, offset: 0 },
      { text: "하세요", duration: 1, offset: 1 },
    ];
    expect(await fetchTranscript("ABC123")).toBe("안녕 하세요");
  });

  it("라이브러리가 throw하면(자막 비활성·비공개·네트워크) null을 반환한다(throw 안 함)", async () => {
    yt.impl = async () => {
      throw new Error("Transcript is disabled");
    };
    await expect(fetchTranscript("ABC123")).resolves.toBeNull();
  });

  it("자막이 빈 배열이면 null을 반환한다", async () => {
    yt.impl = async () => [];
    expect(await fetchTranscript("ABC123")).toBeNull();
  });

  it("빈 videoId면 네트워크 시도 없이 null을 반환한다", async () => {
    expect(await fetchTranscript("   ")).toBeNull();
    expect(yt.calls).toBe(0);
  });

  it("ko 실패 후 en에서 성공하면 그 자막을 반환한다(언어 폴백)", async () => {
    let n = 0;
    yt.impl = async () => {
      n++;
      if (n === 1) throw new Error("ko 없음");
      return [{ text: "hello", duration: 1, offset: 0 }];
    };
    expect(await fetchTranscript("ABC123")).toBe("hello");
  });
});

describe("extractVideoId — 순수(throw 0)", () => {
  it("watch?v= URL에서 videoId를 뽑는다", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=ABC123")).toBe("ABC123");
  });
  it("추가 쿼리 파라미터가 붙어도 videoId만 뽑는다", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=ABC123&t=10s")).toBe("ABC123");
  });
  it("youtu.be 단축 URL을 처리한다", () => {
    expect(extractVideoId("https://youtu.be/XYZ789?si=abc")).toBe("XYZ789");
  });
  it("null/빈문자/videoId 없는 URL이면 null", () => {
    expect(extractVideoId(null)).toBeNull();
    expect(extractVideoId("")).toBeNull();
    expect(extractVideoId("https://example.com/foo")).toBeNull();
  });
});

describe("buildVideoFacts / pickTopReference — 순수", () => {
  it("메타에서 설명·조회수·구독자 사실 스니펫을 뽑는다(셜록 미호출)", () => {
    const facts = buildVideoFacts(ytItem({ snippet: "예금보다 파킹통장", viewCount: 123456, subscriberCount: 7890 }));
    expect(facts.some((f) => f.includes("영상 설명"))).toBe(true);
    expect(facts.some((f) => f.includes("조회수"))).toBe(true);
    expect(facts.some((f) => f.includes("구독자"))).toBe(true);
  });
  it("통계가 전부 null이고 설명도 없으면 빈 배열", () => {
    const facts = buildVideoFacts(ytItem({ snippet: "", viewCount: null, subscriberCount: null }));
    expect(facts).toEqual([]);
  });
  it("pickTopReference: 배수 상위 youtube 1개, viewCount null·web은 제외", () => {
    const items: ExternalItem[] = [
      ytItem({ id: "yt:0", viewCount: 10000, subscriberCount: 100000 }), // 배수 0.1
      ytItem({ id: "yt:1", viewCount: 500000, subscriberCount: 50000 }), // 배수 10 → 최상위
      ytItem({ id: "yt:2", source: "web" }),
      ytItem({ id: "yt:3", viewCount: null }),
    ];
    expect(pickTopReference(items)?.id).toBe("yt:1");
  });
  it("pickTopReference: youtube 없으면 null", () => {
    expect(pickTopReference([ytItem({ source: "web" })])).toBeNull();
  });
});

describe("prepareOnboarder — 하이브리드 조립(throw 0)", () => {
  beforeEach(() => {
    yt.calls = 0;
    yt.impl = async () => [];
    gx.calls = 0;
    gx.impl = async () => [];
  });

  it("자막 null이면 transcript 키를 생략하고 나머지 필드로 유효한 OnboarderInput을 반환한다", async () => {
    gx.impl = async () => [ytItem({ title: "레퍼 제목", snippet: "설명", viewCount: 200000, subscriberCount: 10000 })];
    yt.impl = async () => []; // 자막 없음 → fetchTranscript null

    const input = await prepareOnboarder(makeFakeSupa("연봉 3천 이하 무조건 보세요"), "run-1");

    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요");
    expect(input.referenceTitle).toBe("레퍼 제목");
    expect("transcript" in input).toBe(false); // 자막 null → 키 생략
    expect(input.videoFacts && input.videoFacts.length).toBeGreaterThan(0);
  });

  it("자막이 있으면 transcript도 실린다", async () => {
    gx.impl = async () => [ytItem({})];
    yt.impl = async () => [{ text: "자막본문", duration: 1, offset: 0 }];

    const input = await prepareOnboarder(makeFakeSupa("주제"), "run-2");
    expect(input.transcript).toBe("자막본문");
  });

  it("레퍼런스가 없으면 topic만으로 유효(referenceTitle·transcript·videoFacts 전부 생략)", async () => {
    gx.impl = async () => [];
    const input = await prepareOnboarder(makeFakeSupa("주제"), "run-3");
    expect(input).toEqual({ topic: "주제" });
  });

  it("레퍼런스 수집이 throw해도 크래시 없이 topic만 반환(best-effort)", async () => {
    gx.impl = async () => {
      throw new Error("quota exceeded");
    };
    const input = await prepareOnboarder(makeFakeSupa("주제"), "run-4");
    expect(input).toEqual({ topic: "주제" });
  });

  it("선택된 주제가 없어도 throw하지 않고 topic=''로 반환(구다리와 달리 best-effort)", async () => {
    gx.impl = async () => [];
    const input = await prepareOnboarder(makeFakeSupa(null), "run-5");
    expect(input).toEqual({ topic: "" });
    expect(gx.calls).toBe(0); // 빈 topic이면 수집 시도 안 함
  });
});
