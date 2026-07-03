// 쏙이(onboarder) YouTube quota 회복탄력성 — step1: onboarder-quota-retryable.
//   (1) gatherReferences: gatherExternalSignals가 YouTubeQuotaError(429)를 throw하면 삼키지 않고 전파(빈 [] 폴백 금지).
//   (2) prepareOnboarder: quota → OnboardingRetryableError(재시도 가능), 진짜 0개(비-quota) → 기존 "…온보딩 불가"(영구 블록).
//
// ★ mock은 '교체 가능한 impl 함수'로 둔다(vi.fn 아님). 이유(rules.md): catch로 rejected promise를 삼키는
//   best-effort 함수를 vi.fn으로 스텁하면 mock.results가 그 rejected promise를 unhandled로 감지해 정상 catch
//   동작도 실패로 승격(vitest 2.1.8). impl+별도 카운터로 교체하면 추적 없이 그 동작을 그대로 검증한다.
import { describe, it, expect, beforeEach, vi } from "vitest";

// gatherExternalSignals 스텁 — 교체 가능한 impl + 호출 카운터. 나머지 export(순수 랭킹·YouTubeQuotaError)는 원본 유지.
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

// 자막 취득 스텁 — 네트워크 차단(항상 빈 배열 → fetchTranscript null). throw는 prepareOnboarder가 삼키므로 impl로 둔다.
const yt = vi.hoisted(() => ({
  impl: async (_id: string, _cfg?: unknown): Promise<{ text: string; duration: number; offset: number }[]> => [],
}));
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: (id: string, cfg?: unknown) => yt.impl(id, cfg),
  },
}));

import {
  prepareOnboarder,
  gatherReferences,
  OnboardingRetryableError,
} from "../src/agents/onboarder/prepare.js";
import { YouTubeQuotaError, type ExternalItem } from "../src/agents/topic_scout/externalSignals.js";
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

describe("gatherReferences — quota(429) 전파(빈 [] 폴백 금지)", () => {
  beforeEach(() => {
    gx.calls = 0;
    gx.impl = async () => [];
    yt.impl = async () => [];
  });

  it("기본 수집(0)에서 YouTubeQuotaError가 나면 삼키지 않고 그대로 전파한다", async () => {
    gx.impl = async () => {
      throw new YouTubeQuotaError("youtube search.list 429: quota");
    };
    await expect(gatherReferences("연봉 3천 이하 무조건 보세요")).rejects.toBeInstanceOf(YouTubeQuotaError);
    expect(gx.calls).toBe(1); // 첫 호출에서 바로 전파 — 완화 재검색 안 감.
  });

  it("quota가 아닌 에러(500 등)는 현행대로 삼키고 최종 refs를 반환한다(전파 안 함)", async () => {
    // 첫 수집은 generic 에러로 삼킴 → items []. 완화 재검색(c)에서 refs 확보.
    gx.impl = async (opts) => {
      const o = opts as { ytQuery?: string };
      // 정제 쿼리 q="연봉 3천 이하 무조건"(4토큰 캡) → relaxQuery half=ceil(4/2)=2 → "연봉 3천".
      if (o.ytQuery === "연봉 3천") return [ytItem({ id: "yt:9", url: "https://www.youtube.com/watch?v=RELAX1" })];
      throw new Error("youtube 500");
    };
    const refs = await gatherReferences("연봉 3천 이하 무조건 보세요");
    expect(refs.length).toBe(1);
    expect(gx.calls).toBe(2); // 기본(throw 삼킴) + 완화 재검색.
  });

  it("완화 재검색(c)에서 quota가 나도 이미 모은 refs가 있으면 그 refs를 반환한다(전파 안 함)", async () => {
    // 기본 수집(0)에서 refs 3개 미만(1개)만 확보 → 완화 재검색 진입 → 거기서 quota throw.
    gx.impl = async (opts) => {
      const o = opts as { ytQuery?: string };
      // 완화 쿼리 relaxQuery("연봉 3천 이하 무조건")="연봉 3천"에서 quota throw.
      if (o.ytQuery === "연봉 3천") throw new YouTubeQuotaError("youtube 429: relax");
      return [ytItem({ id: "yt:0", url: "https://www.youtube.com/watch?v=BASE1", viewCount: 300000, subscriberCount: 10000 })];
    };
    const refs = await gatherReferences("연봉 3천 이하 무조건 보세요");
    expect(refs.length).toBe(1); // 기본 수집분 유지 — quota여도 손에 든 refs 반환.
    expect(gx.calls).toBe(2);
  });

  it("완화 재검색(c)에서 quota가 나고 그때까지 refs가 0개면 quota를 전파한다", async () => {
    // 기본 수집(0)은 web-only(youtube 없음) → refs 0개 → 완화 재검색 진입 → 거기서 quota throw.
    gx.impl = async (opts) => {
      const o = opts as { ytQuery?: string };
      // 완화 쿼리 relaxQuery("연봉 3천 이하 무조건")="연봉 3천"에서 quota throw.
      if (o.ytQuery === "연봉 3천") throw new YouTubeQuotaError("youtube 429: relax");
      return []; // 기본 수집 0개.
    };
    await expect(gatherReferences("연봉 3천 이하 무조건 보세요")).rejects.toBeInstanceOf(YouTubeQuotaError);
    expect(gx.calls).toBe(2);
  });
});

describe("prepareOnboarder — 재시도가능(quota) vs 영구블록(진짜 0개) 구분", () => {
  beforeEach(() => {
    gx.calls = 0;
    gx.impl = async () => [];
    yt.impl = async () => [];
  });

  it("quota(429)로 레퍼런스를 못 모으면 OnboardingRetryableError를 throw한다(영구 블록 아님)", async () => {
    gx.impl = async () => {
      throw new YouTubeQuotaError("youtube search.list 429: quota exceeded");
    };
    await expect(prepareOnboarder(makeFakeSupa("주제"), "run-q")).rejects.toBeInstanceOf(OnboardingRetryableError);
  });

  it("OnboardingRetryableError 메시지는 재시도 안내를 담는다(영구 '온보딩 불가'와 다름)", async () => {
    gx.impl = async () => {
      throw new YouTubeQuotaError("429");
    };
    await expect(prepareOnboarder(makeFakeSupa("주제"), "run-q2")).rejects.toThrow(/다시 시도/);
  });

  it("quota가 아닌데 정상 반환이 빈 배열이면(진짜 0개) 기존 '…온보딩 불가'로 영구 블록한다", async () => {
    gx.impl = async () => []; // 검색은 됐는데 영상 0개 — quota 아님.
    const err = await prepareOnboarder(makeFakeSupa("주제"), "run-empty").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(OnboardingRetryableError);
    expect((err as Error).message).toMatch(/온보딩 불가/);
  });

  it("레퍼런스가 있으면 정상적으로 OnboarderInput을 반환한다(회귀 가드)", async () => {
    gx.impl = async () => [ytItem({ title: "레퍼 제목", viewCount: 200000, subscriberCount: 10000 })];
    const input = await prepareOnboarder(makeFakeSupa("주제"), "run-ok");
    expect(input.topic).toBe("주제");
    expect(input.references.length).toBe(1);
  });
});
