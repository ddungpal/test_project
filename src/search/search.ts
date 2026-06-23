// search() 어댑터 — 백엔드 선택 + tavily 응답 fixture 리플레이(재현·$0). 호출부는 백엔드를 모른다.
//   SEARCH_BACKEND: mock(기본·$0·결정적) | tavily(실검색, 키 필요)
//   SEARCH_FIXTURES: record(기본, 없으면 호출후 저장) | replay(저장분만) | off  — tavily에만 적용(mock은 항상 라이브·$0)

import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import type { SearchBackend, SearchQuery, SearchResponse, SearchResult } from "./types.js";
import { mockBackend } from "./backends/mock.js";
import { tavilyBackend } from "./backends/tavily.js";
import { loadConfig } from "../llm/config.js";

const FIX_DIR = "fixtures/search";

/** 쿼리 volatility → TTL(초). 미지정이면 default. 발굴 B: fixture(record)에서 stale 갱신 기준. */
export function ttlSecondsFor(q: SearchQuery, cfg = loadConfig().search): number {
  return q.volatility ? cfg.volatilityTtlSeconds[q.volatility] : cfg.defaultTtlSeconds;
}

export function pickSearchBackend(): SearchBackend {
  const b = process.env.SEARCH_BACKEND ?? "mock";
  if (b === "tavily") return tavilyBackend;
  if (b === "mock") return mockBackend;
  throw new Error(`SEARCH_BACKEND must be 'mock' | 'tavily', got "${b}"`);
}

export function searchHash(q: SearchQuery): string {
  return createHash("sha256").update(JSON.stringify({ q: q.query, d: q.includeDomains ?? [], m: q.maxResults ?? 6 })).digest("hex").slice(0, 16);
}

export async function search(q: SearchQuery, deps: { backend?: SearchBackend } = {}): Promise<SearchResponse> {
  const backend = deps.backend ?? pickSearchBackend();
  const fixtures = process.env.SEARCH_FIXTURES ?? "record";

  // tavily만 fixture 캐시(과금·비결정 차단). mock은 항상 라이브($0·결정적).
  const useFixture = backend.name === "tavily" && fixtures !== "off";
  if (useFixture) {
    const path = join(FIX_DIR, backend.name, `${searchHash(q)}.json`);
    if (existsSync(path)) {
      // TTL(발굴 B): fixture 나이(mtime) ≤ TTL 이면 캐시. 초과(stale)면 record 모드에서 라이브 재호출로 갱신.
      //   replay(개발 $0)는 재호출 불가 → stale 이어도 그대로 반환(결정적·과금 0 유지).
      const ageSeconds = (Date.now() - statSync(path).mtimeMs) / 1000;
      const fresh = ageSeconds <= ttlSecondsFor(q);
      if (fresh || fixtures === "replay") {
        const cached = JSON.parse(readFileSync(path, "utf8")) as SearchResult[];
        return { query: q.query, results: cached, provider: "fixture" };
      }
      // stale + record → 아래로 떨어져 재호출(원자적 덮어쓰기로 mtime 갱신).
    }
    if (fixtures === "replay") throw new Error(`search fixture 없음(replay): ${path} — SEARCH_FIXTURES=record로 먼저 녹화`);
    const results = await backend.run(q);
    // 원자적 쓰기(코드리뷰 P1): temp 파일에 쓰고 rename → 동시 fan-out에서 truncated JSON 읽기 방지.
    mkdirSync(join(FIX_DIR, backend.name), { recursive: true });
    const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(tmp, JSON.stringify(results, null, 2));
    renameSync(tmp, path);
    return { query: q.query, results, provider: backend.name };
  }

  const results = await backend.run(q);
  return { query: q.query, results, provider: backend.name };
}
