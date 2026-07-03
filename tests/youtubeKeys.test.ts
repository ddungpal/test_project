// youtube-key-pool step0 — 순수 키 풀 매니저.
//   (1) getYouTubeKeys: 풀 파싱·단일 폴백·빈값/공백/dedup. env는 테스트 내 set/restore(afterEach 원복).
//   (2) withRotatingYouTubeKey: 429 rotation 전진·성공 정지·전부 소진 throw·비-quota 즉시 throw·소진 세션 유지.
//
// ★ fn 스텁은 '교체 가능한 impl + 별도 호출 카운터'로 둔다(vi.fn 아님·rules.md). 이유: fn이 rejected promise를
//   반환(throw)하는 경로를 vi.fn으로 추적하면 mock.results가 그 rejected를 unhandled로 승격시켜, 실제로
//   catch/rotation하는 정상 코드도 테스트를 실패로 밀어낸다(vitest 2.1.8). plain 함수로 교체하고 호출은
//   별도 카운터로 센다.
import { describe, it, expect, afterEach } from "vitest";
import { getYouTubeKeys, withRotatingYouTubeKey, __resetExhaustedForTest } from "../src/agents/topic_scout/youtubeKeys.js";
import { YouTubeQuotaError } from "../src/agents/topic_scout/externalSignals.js";

// env 원복 — 각 테스트가 YOUTUBE_API_KEYS/YOUTUBE_API_KEY를 자유롭게 set하고 뒤에서 되돌린다.
const savedPool = process.env.YOUTUBE_API_KEYS;
const savedSingle = process.env.YOUTUBE_API_KEY;
function setEnv(pool?: string, single?: string) {
  if (pool === undefined) delete process.env.YOUTUBE_API_KEYS;
  else process.env.YOUTUBE_API_KEYS = pool;
  if (single === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = single;
}
afterEach(() => {
  setEnv(savedPool, savedSingle);
  __resetExhaustedForTest();
});

describe("getYouTubeKeys", () => {
  it('YOUTUBE_API_KEYS="a,b,c" → [a,b,c]', () => {
    setEnv("a,b,c");
    expect(getYouTubeKeys()).toEqual(["a", "b", "c"]);
  });

  it('공백/빈값 "a, ,b," → [a,b]', () => {
    setEnv("a, ,b,");
    expect(getYouTubeKeys()).toEqual(["a", "b"]);
  });

  it('중복 "a,a,b" → [a,b] (순서 유지 dedup)', () => {
    setEnv("a,a,b");
    expect(getYouTubeKeys()).toEqual(["a", "b"]);
  });

  it("풀 미설정 + 단일만 → [단일] (하위호환)", () => {
    setEnv(undefined, "solo");
    expect(getYouTubeKeys()).toEqual(["solo"]);
  });

  it("풀이 빈 문자열이면 단일로 폴백", () => {
    setEnv("   ", "solo");
    expect(getYouTubeKeys()).toEqual(["solo"]);
  });

  it("둘 다 없으면 []", () => {
    setEnv(undefined, undefined);
    expect(getYouTubeKeys()).toEqual([]);
  });

  it("풀이 있으면 단일은 무시(풀 우선)", () => {
    setEnv("a,b", "solo");
    expect(getYouTubeKeys()).toEqual(["a", "b"]);
  });
});

describe("withRotatingYouTubeKey", () => {
  it("키1 quota(429) → 키2 성공이면 키2 값 반환(fn 2회 호출)", async () => {
    setEnv("k1,k2");
    let calls = 0;
    const seen: string[] = [];
    const fn = async (key: string) => {
      calls++;
      seen.push(key);
      if (key === "k1") throw new YouTubeQuotaError("429");
      return `ok:${key}`;
    };
    const result = await withRotatingYouTubeKey(fn);
    expect(result).toBe("ok:k2");
    expect(calls).toBe(2);
    expect(seen).toEqual(["k1", "k2"]);
  });

  it("전부 429면 YouTubeQuotaError throw", async () => {
    setEnv("k1,k2");
    let calls = 0;
    const fn = async (_key: string) => {
      calls++;
      throw new YouTubeQuotaError("429");
    };
    await expect(withRotatingYouTubeKey(fn)).rejects.toBeInstanceOf(YouTubeQuotaError);
    expect(calls).toBe(2);
  });

  it("비-quota Error면 fn 1회만 호출하고 즉시 throw(rotation 0)", async () => {
    setEnv("k1,k2");
    let calls = 0;
    const boom = new Error("network down");
    const fn = async (_key: string) => {
      calls++;
      throw boom;
    };
    await expect(withRotatingYouTubeKey(fn)).rejects.toBe(boom);
    expect(calls).toBe(1); // rotation 안 함 — 첫 키에서 즉시 전파
  });

  it("소진 마킹이 같은 세션 다음 호출에서 그 키를 건너뛴다", async () => {
    setEnv("k1,k2");
    // 1차: k1이 429 → 소진 마킹, k2 성공.
    await withRotatingYouTubeKey(async (key) => {
      if (key === "k1") throw new YouTubeQuotaError("429");
      return "first";
    });
    // 2차: k1은 이미 소진 → 건너뛰고 k2부터. fn은 k2로 1회만 호출돼야.
    let calls = 0;
    const seen: string[] = [];
    const result = await withRotatingYouTubeKey(async (key) => {
      calls++;
      seen.push(key);
      return `second:${key}`;
    });
    expect(result).toBe("second:k2");
    expect(calls).toBe(1);
    expect(seen).toEqual(["k2"]); // k1은 소진돼 스킵
  });

  it("키 풀이 비었으면 YouTubeQuotaError throw(fn 호출 0)", async () => {
    setEnv(undefined, undefined);
    let calls = 0;
    const fn = async (_key: string) => {
      calls++;
      return "never";
    };
    await expect(withRotatingYouTubeKey(fn)).rejects.toBeInstanceOf(YouTubeQuotaError);
    expect(calls).toBe(0);
  });

  it("첫 키 성공이면 그 값 반환(불필요한 rotation 없음)", async () => {
    setEnv("k1,k2");
    let calls = 0;
    const result = await withRotatingYouTubeKey(async (key) => {
      calls++;
      return `ok:${key}`;
    });
    expect(result).toBe("ok:k1");
    expect(calls).toBe(1);
  });
});
