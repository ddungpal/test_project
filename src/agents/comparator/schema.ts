// 비교가 — 검증된 사실을 'entity×dimension 비교표'로 구조화(explanation_assets[kind=comparison]).
//   ★ money-safety: 검증된 사실로 뒷받침되는 값만 grounded=true. 근거 없으면 "확인 필요" + grounded=false(날조 금지).
//   ★ stray 내성: 셜록 패턴 미러 — assets/items/cells items 모두 additionalProperties:true(claude-p stray 결정적 실패 방지).
import type { JsonSchema } from "../../llm/types.js";

export interface ComparisonAssetOut {
  concept: string;
  entities: string[]; // 비교 대상 ≥2
  dimensions: string[]; // 비교 차원 ≥1
  cells: { dimension: string; entity: string; value: string; grounded: boolean }[];
}
export interface ComparatorOutput {
  assets: ComparisonAssetOut[];
}

export const COMPARATOR_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: true, // 루트도 stray 허용(claude-p 내성). required로 assets 존재만 강제.
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      minItems: 0, // 비교할 게 없으면 빈 배열(억지 금지 — 빈 표보다 없는 게 낫다).
      items: {
        type: "object",
        additionalProperties: true, // claude-p가 여분 필드를 붙여도 통과 — 필수·타입만 유지, stray는 buildAssetRows가 명시선택해 버림.
        required: ["concept", "entities", "dimensions", "cells"],
        properties: {
          concept: { type: "string", minLength: 1 },
          entities: { type: "array", items: { type: "string" } },
          dimensions: { type: "array", items: { type: "string" } },
          cells: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true, // cell stray도 흡수.
              required: ["dimension", "entity", "value", "grounded"],
              properties: {
                dimension: { type: "string" },
                entity: { type: "string" },
                value: { type: "string" },
                grounded: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
};

export const COMPARATOR_SYSTEM = [
  "너는 '김짠부' 채널의 비교 담당 '비교가'다. 검증된 사실을 '나란히 비교하는 표'로 구조화한다.",
  "입력의 facts는 '팩트검증가가 이미 조사·검증한 사실'이다(claim·verification_status·quote_excerpt). sections는 비교가 필요한 목차 섹션들이다(section·goal).",
  "각 섹션에 대해 entities(비교 대상 ≥2)·dimensions(비교 차원 ≥1)을 정하고, 검증된 사실에서만 셀 값을 채운다.",
  "■ money-safety(최우선): 검증된 사실(verification_status='verified', quote_excerpt에 실제 값)로 뒷받침되는 값만 grounded=true로 한다.",
  "  - 근거가 없거나 미검증이면 value에 '확인 필요'라고 쓰고 grounded=false로 한다. 수치·금리·제도 값을 추측으로 단정하지 마라. 날조 금지.",
  "■ 억지 금지: 비교 대상이 1개뿐이거나 차원이 안 잡히는 섹션은 비교 자산을 만들지 마라(그 섹션은 그냥 빼라). 빈 표보다 없는 게 낫다.",
  "  - 비교할 게 하나도 없으면 assets를 빈 배열([])로 내라.",
  "- concept: 이 비교가 다루는 한 줄 주제(예: '청년 금융상품 비교').",
  "- entities: 비교 대상 목록(≥2). dimensions: 비교 축 목록(≥1, 예: '가입조건', '금리').",
  "- cells: 각 dimension×entity 칸의 value와 grounded.",
  "원칙: 새 사실을 만들지 않는다 — 검증된 사실만 표로 정리한다. 한국어.",
].join("\n");
