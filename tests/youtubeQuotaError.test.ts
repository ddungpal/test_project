// step0: YouTube quota(429) 에러 구분 + gatherExternalSignals throwOnYtQuota 분기 회귀 가드.
//   ★ rules.md 함정: fetch/rejected-promise 삼킴 검사는 vi.fn 대신 "교체 가능한 impl 함수 + 별도 카운터"로 스텁한다.
//     vi.fn은 rejected promise를 mock.results에 붙들어 unhandled rejection으로 잘못 감지 → 정상 catch 코드도 실패로 승격됨.
//     여기선 globalThis.fetch를 순수 함수로 직접 교체하고(vi.fn 미사용), 호출 카운터를 별도 변수로 센다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  YouTubeQuotaError,
  gatherExternalSignals,
} from "../src/agents/topic_scout/externalSignals.js";
// step1(searchyoutube-rotation) 이후: searchYouTube가 키 풀 rotation을 타면서 429 본 키를 프로세스 소진 Set에
//   마킹한다(세션 유지가 스펙). 이 스위트는 여러 테스트가 같은 키 "fake"를 재사용하므로, 앞선 429 케이스의 소진
//   마킹이 뒤 테스트(500·200)로 새면 "사용 가능한 키 없음"으로 오염된다 → afterEach에서 소진 Set을 리셋해 격리.
import { __resetExhaustedForTest } from "../src/agents/topic_scout/youtubeKeys.js";

describe("YouTubeQuotaError — 타입", () => {
  it("Error의 인스턴스이고 name이 YouTubeQuotaError다", () => {
    const e = new YouTubeQuotaError("quota exceeded");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(YouTubeQuotaError);
    expect(e.name).toBe("YouTubeQuotaError");
    expect(e.message).toBe("quota exceeded");
  });
});

// globalThis.fetch를 교체 가능한 impl로 스텁(vi.fn 아님). search.list URL에 대해 지정한 status를 돌려준다.
//   429면 실제 searchPass가 YouTubeQuotaError를 throw → Promise.allSettled가 rejected로 잡음(코드 경로 그대로).
//   호출 횟수는 별도 카운터로 센다(vi.fn 붙듦 회피).
type FetchImpl = (url: string) => Promise<Response>;
const realFetch = globalThis.fetch;
let searchCallCount = 0;

function installFetch(opts: { searchStatus: number; searchBody?: string; searchItems?: unknown[] }) {
  searchCallCount = 0;
  const impl: FetchImpl = async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/search")) {
      searchCallCount++;
      if (opts.searchStatus !== 200) {
        return {
          ok: false,
          status: opts.searchStatus,
          text: async () => opts.searchBody ?? "error",
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({ items: opts.searchItems ?? [] }) } as unknown as Response;
    }
    // videos.list / channels.list → 빈(stats 보강 best-effort 생략).
    return { ok: true, json: async () => ({ items: [] }) } as unknown as Response;
  };
  globalThis.fetch = impl as typeof globalThis.fetch;
}

describe("gatherExternalSignals — throwOnYtQuota 분기(촉이 회귀 가드)", () => {
  // 이 스위트는 fetch 레벨(429/500/200) 검증이 목적이다 — youtubeFixture 레이어를 우회해야 fetch 스텁이
  //   그대로 관통한다(off=항상 라이브). 안 그러면 record가 레포 fixtures/youtube에 파일을 남기고 같은 해시로
  //   캐시가 공유돼 500/429 케이스가 앞선 200 record를 반환하는 오염이 난다.
  const OLD_YT_FIX = process.env.YOUTUBE_FIXTURES;
  beforeEach(() => {
    process.env.YOUTUBE_FIXTURES = "off";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.YOUTUBE_API_KEY;
    if (OLD_YT_FIX === undefined) delete process.env.YOUTUBE_FIXTURES;
    else process.env.YOUTUBE_FIXTURES = OLD_YT_FIX;
    __resetExhaustedForTest(); // 429 소진 마킹이 다음 테스트로 새지 않도록 격리(세션 유지 스펙의 부작용 차단).
    vi.unstubAllEnvs?.();
  });

  it("옵션 미지정: quota(429)여도 삼키고 []를 반환한다(촉이 바이트 동일)", async () => {
    process.env.YOUTUBE_API_KEY = "fake";
    installFetch({ searchStatus: 429, searchBody: "Quota exceeded" });
    const items = await gatherExternalSignals({ webQueries: [], ytQueries: ["파킹통장"], maxPerQuery: 5 });
    expect(items).toEqual([]); // 삼킴 유지 — throw 안 함.
    expect(searchCallCount).toBeGreaterThan(0); // 실제로 search.list를 태웠다(429 경로).
  });

  it("throwOnYtQuota=true: quota(429)면 YouTubeQuotaError를 re-throw한다", async () => {
    process.env.YOUTUBE_API_KEY = "fake";
    installFetch({ searchStatus: 429, searchBody: "Quota exceeded" });
    await expect(
      gatherExternalSignals({ webQueries: [], ytQueries: ["파킹통장"], maxPerQuery: 5, throwOnYtQuota: true }),
    ).rejects.toBeInstanceOf(YouTubeQuotaError);
  });

  it("throwOnYtQuota=true여도 non-quota 에러(500)는 삼킨다(quota만 전파)", async () => {
    process.env.YOUTUBE_API_KEY = "fake";
    installFetch({ searchStatus: 500, searchBody: "server error" });
    const items = await gatherExternalSignals({ webQueries: [], ytQueries: ["파킹통장"], maxPerQuery: 5, throwOnYtQuota: true });
    expect(items).toEqual([]); // 429가 아니면 현행대로 warn+삼킴.
  });

  it("throwOnYtQuota=true여도 성공(200)이면 정상 반환한다", async () => {
    process.env.YOUTUBE_API_KEY = "fake";
    installFetch({
      searchStatus: 200,
      searchItems: [{ id: { videoId: "v1" }, snippet: { title: "t", channelId: "ch1", channelTitle: "채널" } }],
    });
    const items = await gatherExternalSignals({ webQueries: [], ytQueries: ["파킹통장"], maxPerQuery: 5, throwOnYtQuota: true });
    const yt = items.filter((i) => i.source === "youtube");
    expect(yt).toHaveLength(1);
    expect(yt[0]!.url).toContain("v1");
  });

  it("YOUTUBE_API_KEY가 없으면 quota 판정 이전에 [](검색 미실행)", async () => {
    installFetch({ searchStatus: 429 });
    const items = await gatherExternalSignals({ webQueries: [], ytQueries: ["파킹통장"], maxPerQuery: 5, throwOnYtQuota: true });
    expect(items).toEqual([]);
    expect(searchCallCount).toBe(0); // 키 없으면 searchYouTube가 즉시 []—fetch 미호출.
  });
});
