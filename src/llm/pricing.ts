// 모델 티어별 단가 (USD / 100만 토큰). tech.md §14 편당 비용 추정의 기반.
// 캐시 읽기는 입력단가의 0.1배(Anthropic prompt caching). 정확 단가는 운영 전 라이브 확인(§15).
// Phase 1에서 config_registry로 이관.

import type { LlmBackend, LlmUsage, ModelTier } from "./types.js";

interface TierPrice {
  inPerM: number;
  outPerM: number;
  cachedInPerM: number; // 캐시 읽기 단가
}

const PRICING: Record<ModelTier, TierPrice> = {
  haiku: { inPerM: 1, outPerM: 5, cachedInPerM: 0.1 },
  sonnet: { inPerM: 3, outPerM: 15, cachedInPerM: 0.3 },
  opus: { inPerM: 15, outPerM: 75, cachedInPerM: 1.5 },
};

/** OpenAI(GPT-5.5 등) 단가 — 정확값 불확실(§15) → env 주입, 기본은 캡 누수 방지용 보수적(높게) 값.
 *  골든 A/B 비교용. 보고 비용은 근사이며 하드캡($3 등)이 1차 안전망. */
function openAiPrice(): TierPrice {
  const inPerM = envNum("OPENAI_IN_PER_M", 10);
  const outPerM = envNum("OPENAI_OUT_PER_M", 30);
  return { inPerM, outPerM, cachedInPerM: inPerM }; // 캐시 할인 미가정(보수적)
}

function priceFor(backend: LlmBackend, model: ModelTier): TierPrice {
  return backend === "openai" ? openAiPrice() : PRICING[model];
}

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 실제 usage → 비용(USD). 캐시 토큰은 캐시 단가로 별도 계산. */
export function computeCostUsd(model: ModelTier, usage: LlmUsage, backend: LlmBackend = "api"): number {
  const p = priceFor(backend, model);
  const freshIn = Math.max(0, usage.inTok - usage.cachedInTok);
  const cost =
    (freshIn * p.inPerM + usage.cachedInTok * p.cachedInPerM + usage.outTok * p.outPerM) /
    1_000_000;
  return round4(cost);
}

/**
 * 호출 전 비용 상한 추정(preflight). 캐시 미적용·최대출력 가정의 보수적 상한. §17 preflight 예약.
 * 추정이 실비보다 낮으면 캡이 누수되므로(코드리뷰 C), 프레이밍(schema·tool·델리미터)을 반영해
 * approxInputTok에 schema 크기를 포함시키고 여기에 SAFETY_FACTOR를 곱해 보수적으로 잡는다.
 */
const SAFETY_FACTOR = 1.25;

export function estimateMaxCostUsd(
  model: ModelTier,
  approxInputTok: number,
  maxOutputTok: number,
  backend: LlmBackend = "api",
): number {
  const p = priceFor(backend, model);
  const raw = (approxInputTok * p.inPerM + maxOutputTok * p.outPerM) / 1_000_000;
  return round4(raw * SAFETY_FACTOR);
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
