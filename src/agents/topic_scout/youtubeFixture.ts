// searchYouTube fixture 래퍼 — search.ts(tavily) 패턴 미러. dev에서 YouTube 검색을 record/replay($0·quota 무소모).
//   YOUTUBE_FIXTURES: record(기본·없으면 라이브 호출후 녹화) | replay(녹화분만·미스 throw) | off(항상 라이브)
//   게이팅: YOUTUBE_API_KEY 있고 YOUTUBE_FIXTURES!==off 일 때만 캐시(search.ts의 tavily-only 미러). 키 없으면
//     searchYouTube가 이미 []를 반환하므로 그대로(라이브 분기로 흘려도 동일).
//   ★ 실패(429=YouTubeQuotaError·네트워크)는 절대 캐시하지 않는다 — 실패를 fixture로 굳히면 dev가 영영 깨진다.
//     라이브 searchYouTube throw를 그대로 전파하고 저장 로직은 실행되지 않는다(await 위에서 throw).
//   TTL은 두지 않는다(YAGNI) — YouTube 레퍼런스는 단순 존재 기반으로 충분(search.ts보다 단순).

import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { searchYouTube as liveSearchYouTube, type ExternalItem } from "./externalSignals.js";
import { getYouTubeKeys } from "./youtubeKeys.js";

const FIX_DIR = "fixtures/youtube";

// search.ts searchHash 미러(형태만 YouTube에 맞춤: query + max).
export function youtubeFixtureHash(query: string, max: number): string {
  return createHash("sha256").update(JSON.stringify({ q: query, m: max })).digest("hex").slice(0, 16);
}

/** searchYouTube를 fixture 레이어로 감싼다. search.ts의 search()가 deps.backend를 받는 것 미러 —
 *  deps.live로 라이브 구현을 주입(테스트 스텁용), deps.dir로 base dir 오버라이드(테스트 temp dir·레포 오염 방지). */
export async function searchYouTubeCached(
  query: string,
  max: number,
  deps: { live?: (q: string, m: number) => Promise<Omit<ExternalItem, "id">[]>; dir?: string } = {},
): Promise<Omit<ExternalItem, "id">[]> {
  const live = deps.live ?? liveSearchYouTube;
  const dir = deps.dir ?? FIX_DIR;
  const fixtures = process.env.YOUTUBE_FIXTURES ?? "record";

  // 키 풀(YOUTUBE_API_KEYS) 또는 단일(YOUTUBE_API_KEY) 하나라도 있고 off 아닐 때만 fixture(search.ts tavily-only 미러).
  //   풀만 설정하고 단일을 비운 환경도 켜지도록 getYouTubeKeys().length로 게이트(단일 키만 있어도 동일 동작). 키 없으면 live가 []를 반환 — 그대로.
  const useFixture = getYouTubeKeys().length > 0 && fixtures !== "off";
  if (useFixture) {
    const path = join(dir, `${youtubeFixtureHash(query, max)}.json`);
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as Omit<ExternalItem, "id">[];
    }
    if (fixtures === "replay") {
      throw new Error(`youtube fixture 없음(replay): ${path} — YOUTUBE_FIXTURES=record로 먼저 녹화`);
    }
    // record 미스 → 라이브 호출. 실패(429 등)는 여기서 throw로 전파되어 아래 저장이 실행되지 않는다(실패 캐시 금지).
    const rows = await live(query, max);
    // 원자적 쓰기(search.ts 미러): temp 파일에 쓰고 rename → 동시 fan-out에서 truncated JSON 읽기 방지.
    mkdirSync(dir, { recursive: true });
    const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(tmp, JSON.stringify(rows, null, 2));
    renameSync(tmp, path);
    return rows;
  }

  return live(query, max);
}
