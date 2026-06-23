// 환경 설정 단일 출처. tech.md §2·§14 + §17(비용 2단 캡).
// 정적-A 설정값은 Phase 1에서 config_registry(DB)로 이관 예정. Phase 0은 env.

import type { FixtureMode, LlmBackend } from "./types.js";

// 금융 claim 검색을 한정할 한국 공식 도메인(§9). 코드 상수지만 config 표면으로 노출 → 셀이 직접 박지 않는다.
const KOREAN_OFFICIAL_DOMAINS = ["nts.go.kr", "fsc.go.kr", "bok.or.kr", "kostat.go.kr", "law.go.kr", "moef.go.kr", "fss.or.kr"] as const;

function envStr(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env ${key} must be a number, got "${v}"`);
  return n;
}

export interface LlmConfig {
  backend: LlmBackend;
  fixtures: FixtureMode;
  softCapUsd: number;
  hardCapUsd: number;
  maxRework: number;
  /** 리서치 셀 튜닝값(비용·지연 슬라이스 가드). 이전엔 researchCell.ts에 하드코딩. */
  research: {
    maxClaims: number;
    maxConcepts: number;
    koreanOfficialDomains: readonly string[];
  };
  /** 검색 캐시 TTL(발굴 신선도 B). volatility 미지정 쿼리는 default, 지정 시 해당 TTL.
   *  TTL은 fixture(record 모드)에만 의미 — stale fixture를 라이브 재호출로 갱신. replay(개발 $0)는 stale이어도 유지. */
  search: {
    defaultTtlSeconds: number;
    volatilityTtlSeconds: Record<"static" | "slow" | "fast", number>;
  };
  /** A/B 성과 회수(Phase 4). 승자의 차순위 대비 '상대 CTR 리프트'로 결정력 판정.
   *  decisive ≥ decisiveMargin, marginal ≥ marginalMargin, 그 미만은 inconclusive. (기본 10%/3%) */
  ab: {
    decisiveMargin: number;
    marginalMargin: number;
  };
}

export function loadConfig(): LlmConfig {
  const backend = envStr("LLM_BACKEND", "claude-p");
  if (backend !== "claude-p" && backend !== "api" && backend !== "openai") {
    throw new Error(`LLM_BACKEND must be 'claude-p' | 'api' | 'openai', got "${backend}"`);
  }
  const fixtures = envStr("LLM_FIXTURES", "replay") as FixtureMode;
  if (!["replay", "record", "off"].includes(fixtures)) {
    throw new Error(`LLM_FIXTURES must be 'replay' | 'record' | 'off', got "${fixtures}"`);
  }
  const softCapUsd = envNum("COST_SOFT_CAP_USD", 7);
  const hardCapUsd = envNum("COST_HARD_CAP_USD", 10);
  if (softCapUsd > hardCapUsd) {
    throw new Error(`COST_SOFT_CAP_USD(${softCapUsd}) must be <= COST_HARD_CAP_USD(${hardCapUsd})`);
  }
  return {
    backend,
    fixtures,
    softCapUsd,
    hardCapUsd,
    maxRework: envNum("MAX_REWORK", 2),
    research: {
      maxClaims: envNum("RESEARCH_MAX_CLAIMS", 4),
      maxConcepts: envNum("RESEARCH_MAX_CONCEPTS", 4),
      koreanOfficialDomains: KOREAN_OFFICIAL_DOMAINS,
    },
    search: {
      defaultTtlSeconds: envNum("SEARCH_CACHE_TTL_SECONDS", 86_400), // 1일
      volatilityTtlSeconds: {
        static: envNum("SEARCH_TTL_STATIC_SECONDS", 2_592_000), // 30일(개념·정의)
        slow: envNum("SEARCH_TTL_SLOW_SECONDS", 604_800), //  7일(제도·연간수치)
        fast: envNum("SEARCH_TTL_FAST_SECONDS", 3_600), //  1시간(트렌드·시세 — 매일 발굴이 항상 갱신)
      },
    },
    ab: {
      decisiveMargin: envNum("AB_DECISIVE_MARGIN", 0.1), // 차순위 대비 +10% 리프트 → decisive
      marginalMargin: envNum("AB_MARGINAL_MARGIN", 0.03), // +3% 이상 → marginal
    },
  };
}
