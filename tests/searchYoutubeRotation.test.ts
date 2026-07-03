// youtube-key-pool step1 — searchYouTube 배선 회귀(단일키 바이트동일·429 rotation·fixture 게이트).
//   step0(youtubeKeys.test.ts)이 withRotatingYouTubeKey 단위(429 전진·전부소진 throw·비-quota 즉시)를 이미 커버하므로
//   여기선 '배선이 실제로 그 rotation을 태우는가 + 단일키 경로가 기존과 동일한가 + fixture 게이트가 풀에도 켜지는가'에 집중.
//
// ★ fetch는 전역 스텁(교체 가능한 impl + 호출 로그). vi.fn을 쓰지 않는다(rules.md catch-swallow 함정):
//   searchPass의 429는 withRotatingYouTubeKey가 잡아 rotation하는 정상 경로 — vi.fn.mock.results가 그 rejected를
//   unhandled로 승격시키면 정상 동작이 실패로 밀린다. plain 함수 impl + 배열 로그로 URL·키를 검증한다.
// ★ env(YOUTUBE_API_KEYS/YOUTUBE_API_KEY)는 set/restore(afterEach 원복). 소진 Set은 __resetExhaustedForTest로 격리.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchYouTube } from "../src/agents/topic_scout/externalSignals.js";
import { __resetExhaustedForTest } from "../src/agents/topic_scout/youtubeKeys.js";
import {
  searchYouTubeCached,
  youtubeFixtureHash,
} from "../src/agents/topic_scout/youtubeFixture.js";
import type { ExternalItem } from "../src/agents/topic_scout/externalSignals.js";

// --- env 원복 -------------------------------------------------------------
const savedPool = process.env.YOUTUBE_API_KEYS;
const savedSingle = process.env.YOUTUBE_API_KEY;
const savedFetch = globalThis.fetch;
function setEnv(pool?: string, single?: string) {
  if (pool === undefined) delete process.env.YOUTUBE_API_KEYS;
  else process.env.YOUTUBE_API_KEYS = pool;
  if (single === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = single;
}
afterEach(() => {
  setEnv(savedPool, savedSingle);
  globalThis.fetch = savedFetch;
  __resetExhaustedForTest();
});

// --- fetch 스텁 -----------------------------------------------------------
// search 엔드포인트는 status에 따라 items 또는 429. videos/channels(best-effort)는 빈 items(200)로 무해하게 응답.
//   quotaOnKeys에 담긴 key가 URL에 실리면 search가 429를 반환 → rotation 유발.
function stubFetch(opts: {
  quotaOnKeys?: Set<string>; // 이 키로 오는 search 요청은 429
  searchItems?: unknown[]; // search가 200일 때 반환할 items
}) {
  const log: { url: string; key: string | null }[] = [];
  const searchItems = opts.searchItems ?? [
    { id: { videoId: "vid1" }, snippet: { title: "롱폼 영상", channelId: "ch1", channelTitle: "채널" } },
  ];
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const key = new URL(url).searchParams.get("key");
    log.push({ url, key });
    const ok = (body: unknown): Response =>
      ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response);
    if (url.includes("/search")) {
      if (key && opts.quotaOnKeys?.has(key)) {
        return { ok: false, status: 429, text: async () => "quotaExceeded" } as Response;
      }
      return ok({ items: searchItems });
    }
    // videos/channels: 빈 items — durationSec 미상은 롱폼 필터 통과(풀 전멸 방지), subs 없음.
    return ok({ items: [] });
  }) as typeof fetch;
  return { log };
}

// --- (1) 단일키 회귀: 기존 경로와 동일 -----------------------------------
describe("searchYouTube 단일키 회귀(rotation 미발동)", () => {
  it("YOUTUBE_API_KEY만 있을 때 그 키로 검색하고 정상 매핑 반환(rotation 없음)", async () => {
    setEnv(undefined, "solo-key");
    const { log } = stubFetch({});
    const rows = await searchYouTube("파킹통장", 5);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "youtube",
      title: "롱폼 영상",
      url: "https://www.youtube.com/watch?v=vid1",
      sourceQuery: "파킹통장",
    });
    // 모든 fetch가 단일 키를 실었다 — 다른 키로 rotation한 흔적 없음.
    const keysUsed = new Set(log.map((l) => l.key));
    expect(keysUsed).toEqual(new Set(["solo-key"]));
    // search는 2패스(relevance+viewCount)만 429 없이 성공.
    const searchCalls = log.filter((l) => l.url.includes("/search"));
    expect(searchCalls).toHaveLength(2);
  });

  it("키 전혀 없으면 [] 반환(fetch 미호출)", async () => {
    setEnv(undefined, undefined);
    const { log } = stubFetch({});
    const rows = await searchYouTube("주식", 5);
    expect(rows).toEqual([]);
    expect(log).toHaveLength(0);
  });

  it("YOUTUBE_API_KEYS 단일 원소도 단일키와 동일 동작", async () => {
    setEnv("only-one", undefined);
    const { log } = stubFetch({});
    const rows = await searchYouTube("적금", 5);
    expect(rows).toHaveLength(1);
    expect(new Set(log.map((l) => l.key))).toEqual(new Set(["only-one"]));
  });
});

// --- (2) 429 rotation 배선 검증 -------------------------------------------
describe("searchYouTube 429 rotation(배선)", () => {
  it("첫 키 search 429면 다음 키로 넘어가 성공 반환", async () => {
    setEnv("k1,k2", undefined);
    const { log } = stubFetch({ quotaOnKeys: new Set(["k1"]) });
    const rows = await searchYouTube("환테크", 5);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "youtube", sourceQuery: "환테크" });
    // k1으로 search 시도(429) 후 k2로 재시도해 성공한 흔적.
    const searchKeys = log.filter((l) => l.url.includes("/search")).map((l) => l.key);
    expect(searchKeys).toContain("k1");
    expect(searchKeys).toContain("k2");
  });

  it("모든 키가 429면 YouTubeQuotaError 전파(searchYouTube가 throw)", async () => {
    setEnv("k1,k2", undefined);
    stubFetch({ quotaOnKeys: new Set(["k1", "k2"]) });
    await expect(searchYouTube("빚청산", 5)).rejects.toMatchObject({ name: "YouTubeQuotaError" });
  });
});

// --- (3) fixture 게이트: 풀만 있어도 켜짐 ---------------------------------
// searchYouTubeCached의 게이트가 getYouTubeKeys().length>0 → 풀(YOUTUBE_API_KEYS)만 있고 단일 없어도 fixture ON.
//   캐시 히트 시 라이브(deps.live)는 0회 — 회귀 잠금(라이브=quota 소모).
function sampleRows(): Omit<ExternalItem, "id">[] {
  return [
    {
      source: "youtube", title: "샘플", url: "https://www.youtube.com/watch?v=x1",
      publisher: null, published_at: null, snippet: "s",
      viewCount: null, likeCount: null, commentCount: null, subscriberCount: null,
      thumbnailUrl: null, sourceQuery: "q",
    },
  ];
}
function makeLive(rows: Omit<ExternalItem, "id">[]) {
  const state = { calls: 0 };
  const live = async (_q: string, _m: number): Promise<Omit<ExternalItem, "id">[]> => {
    state.calls++;
    return rows;
  };
  return { live, state };
}

describe("fixture 게이트: 풀(YOUTUBE_API_KEYS)만 있어도 켜짐", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("YOUTUBE_API_KEYS만 있고 YOUTUBE_API_KEY 없어도 fixture 녹화됨(캐시 히트=라이브 0회)", async () => {
    dir = mkdtempSync(join(tmpdir(), "yt-pool-fixture-"));
    setEnv("pk1,pk2", undefined); // 단일 없음, 풀만
    process.env.YOUTUBE_FIXTURES = "record";
    const { live, state } = makeLive(sampleRows());

    // 1차: 캐시 미스 → 라이브 1회 + 저장.
    const first = await searchYouTubeCached("파킹통장", 5, { live, dir });
    expect(first).toEqual(sampleRows());
    expect(state.calls).toBe(1);
    const path = join(dir, `${youtubeFixtureHash("파킹통장", 5)}.json`);
    expect(existsSync(path)).toBe(true);

    // 2차: 캐시 히트 → 라이브 추가 0회(게이트가 풀에도 켜졌다는 증거).
    const second = await searchYouTubeCached("파킹통장", 5, { live, dir });
    expect(second).toEqual(sampleRows());
    expect(state.calls).toBe(1);

    delete process.env.YOUTUBE_FIXTURES;
  });

  it("풀·단일 둘 다 없으면 게이트 off — 라이브로 흘려보냄(캐시 미저장)", async () => {
    dir = mkdtempSync(join(tmpdir(), "yt-pool-nofix-"));
    setEnv(undefined, undefined);
    process.env.YOUTUBE_FIXTURES = "record";
    const { live, state } = makeLive(sampleRows());
    await searchYouTubeCached("연금", 5, { live, dir });
    expect(state.calls).toBe(1);
    expect(existsSync(dir) ? readdirSync(dir).length : 0).toBe(0); // 저장 안 함(게이트 off)
    delete process.env.YOUTUBE_FIXTURES;
  });
});
