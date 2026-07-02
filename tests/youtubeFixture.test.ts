// searchYouTubeCached fixture 래퍼 — step3: youtube-fixture.
//   search.ts(tavily) fixture 레이어를 YouTube 검색에 미러. dev record/replay($0·quota 무소모).
//   (1) record: 캐시 미스 → 라이브 저장+반환, 두 번째 호출은 캐시 반환(라이브 0회 = 카운터로 검증).
//   (2) replay: 캐시 있으면 반환, 미스면 throw.
//   (3) off: 항상 라이브.
//   (4) 실패(YouTubeQuotaError)는 저장 안 함(라이브 호출 카운터 + 파일 미생성 확인).
//
// ★ 라이브 스텁은 '교체 가능한 impl 함수'(deps.live 주입) + 별도 카운터로 둔다(vi.fn 아님). 이유(rules.md):
//   catch/전파되는 rejected promise를 vi.fn으로 스텁하면 mock.results가 그걸 unhandled로 감지해 정상 동작도
//   실패로 승격(vitest 2.1.8). impl+카운터면 추적 없이 그 동작을 그대로 검증한다.
// ★ 레포 오염 금지: fixtures/youtube 대신 fs.mkdtemp로 만든 temp dir을 deps.dir로 주입한다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  searchYouTubeCached,
  youtubeFixtureHash,
} from "../src/agents/topic_scout/youtubeFixture.js";
import type { ExternalItem } from "../src/agents/topic_scout/externalSignals.js";
import { YouTubeQuotaError } from "../src/agents/topic_scout/externalSignals.js";

// 라이브 결과 한 건(형태만 유효하면 됨 — 래퍼는 배열을 그대로 캐시).
function sampleRows(title = "샘플 영상"): Omit<ExternalItem, "id">[] {
  return [
    {
      source: "youtube",
      title,
      url: "https://www.youtube.com/watch?v=abc123",
      publisher: "채널",
      published_at: null,
      snippet: "설명",
      viewCount: 1000,
      likeCount: 10,
      commentCount: 2,
      subscriberCount: 500,
      thumbnailUrl: null,
      sourceQuery: "q",
    },
  ];
}

// 교체 가능한 impl + 카운터. rows를 반환하거나(정상) throwErr를 던진다(실패 경로).
function makeLive(rows: Omit<ExternalItem, "id">[] | null, throwErr?: Error) {
  const state = { calls: 0 };
  const live = async (_q: string, _m: number): Promise<Omit<ExternalItem, "id">[]> => {
    state.calls++;
    if (throwErr) throw throwErr;
    return rows ?? [];
  };
  return { live, state };
}

let dir: string;
const OLD_ENV = { ...process.env };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "yt-fixture-"));
  // 게이팅: 키 있고 off 아닐 때만 fixture. 기본은 record로 둔다(테스트별로 오버라이드).
  process.env.YOUTUBE_API_KEY = "test-key";
  process.env.YOUTUBE_FIXTURES = "record";
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...OLD_ENV };
});

describe("youtubeFixtureHash", () => {
  it("query+max 기준 16자 해시(결정적)", () => {
    const h = youtubeFixtureHash("파킹통장", 5);
    expect(h).toHaveLength(16);
    expect(youtubeFixtureHash("파킹통장", 5)).toBe(h); // 결정적
    expect(youtubeFixtureHash("파킹통장", 10)).not.toBe(h); // max 다르면 다른 해시
    expect(youtubeFixtureHash("다른쿼리", 5)).not.toBe(h);
  });
});

describe("record 모드", () => {
  it("캐시 미스면 라이브 호출해 저장+반환, 두 번째 호출은 캐시(라이브 0회 추가)", async () => {
    process.env.YOUTUBE_FIXTURES = "record";
    const { live, state } = makeLive(sampleRows("첫녹화"));

    const first = await searchYouTubeCached("파킹통장", 5, { live, dir });
    expect(first).toEqual(sampleRows("첫녹화"));
    expect(state.calls).toBe(1); // 라이브 1회
    const path = join(dir, `${youtubeFixtureHash("파킹통장", 5)}.json`);
    expect(existsSync(path)).toBe(true); // 저장됨

    const second = await searchYouTubeCached("파킹통장", 5, { live, dir });
    expect(second).toEqual(sampleRows("첫녹화")); // 캐시 반환(동일 내용)
    expect(state.calls).toBe(1); // 라이브 추가 호출 없음
  });
});

describe("replay 모드", () => {
  it("캐시 있으면 반환(라이브 0회)", async () => {
    // 먼저 record로 녹화.
    process.env.YOUTUBE_FIXTURES = "record";
    const rec = makeLive(sampleRows("녹화분"));
    await searchYouTubeCached("주식", 5, { live: rec.live, dir });

    // 이제 replay — 라이브는 절대 호출하면 안 됨.
    process.env.YOUTUBE_FIXTURES = "replay";
    const rep = makeLive(sampleRows("라이브금지"));
    const out = await searchYouTubeCached("주식", 5, { live: rep.live, dir });
    expect(out).toEqual(sampleRows("녹화분"));
    expect(rep.state.calls).toBe(0); // 라이브 미호출
  });

  it("캐시 미스면 throw(라이브 미호출)", async () => {
    process.env.YOUTUBE_FIXTURES = "replay";
    const { live, state } = makeLive(sampleRows());
    await expect(searchYouTubeCached("없는쿼리", 5, { live, dir })).rejects.toThrow(
      /youtube fixture 없음\(replay\)/,
    );
    expect(state.calls).toBe(0); // 라이브 미호출
  });
});

describe("off 모드", () => {
  it("항상 라이브(캐시 안 읽고 안 씀)", async () => {
    process.env.YOUTUBE_FIXTURES = "off";
    const { live, state } = makeLive(sampleRows("라이브결과"));

    const out = await searchYouTubeCached("적금", 5, { live, dir });
    expect(out).toEqual(sampleRows("라이브결과"));
    expect(state.calls).toBe(1);
    // 파일 안 남김.
    expect(existsSync(dir) ? readdirSync(dir).length : 0).toBe(0);

    // 두 번째도 라이브(캐시 없으니 다시).
    await searchYouTubeCached("적금", 5, { live, dir });
    expect(state.calls).toBe(2);
  });

  it("YOUTUBE_API_KEY 없으면 라이브(fixture 게이트 off)", async () => {
    delete process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_FIXTURES = "record"; // record여도 키 없으면 게이트 off.
    const { live, state } = makeLive(sampleRows());
    await searchYouTubeCached("연금", 5, { live, dir });
    expect(state.calls).toBe(1);
    expect(existsSync(dir) ? readdirSync(dir).length : 0).toBe(0); // 저장 안 함
  });
});

describe("실패는 캐시 안 함", () => {
  it("record에서 YouTubeQuotaError(429)면 전파하고 파일 미생성", async () => {
    process.env.YOUTUBE_FIXTURES = "record";
    const err = new YouTubeQuotaError("youtube search.list(relevance) 429: quota");
    const { live, state } = makeLive(null, err);

    await expect(searchYouTubeCached("빚청산", 5, { live, dir })).rejects.toBeInstanceOf(
      YouTubeQuotaError,
    );
    expect(state.calls).toBe(1); // 라이브는 호출됨(그 후 throw)
    const path = join(dir, `${youtubeFixtureHash("빚청산", 5)}.json`);
    expect(existsSync(path)).toBe(false); // 실패는 저장 안 함
    expect(existsSync(dir) ? readdirSync(dir).length : 0).toBe(0); // temp/부산물도 없음
  });

  it("record에서 일반 네트워크 에러도 캐시 안 함(전파)", async () => {
    process.env.YOUTUBE_FIXTURES = "record";
    const { live, state } = makeLive(null, new Error("network fail"));
    await expect(searchYouTubeCached("환테크", 5, { live, dir })).rejects.toThrow("network fail");
    expect(state.calls).toBe(1);
    const path = join(dir, `${youtubeFixtureHash("환테크", 5)}.json`);
    expect(existsSync(path)).toBe(false);
  });
});
