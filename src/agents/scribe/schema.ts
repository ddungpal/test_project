// 짠펜(scribe) — 최종 합류점. outline + 승인 facts + 숫자/비유 + tone_profile → 대본(script_segments). tech.md §7·§12.
//   출력 segment는 사용한 fact/asset 인덱스를 링크(lineage: script_segment_facts/_explanation_assets).
import type { JsonSchema } from "../../llm/types.js";

export interface ScriptSegmentOut {
  ord: number; // 순서(0부터)
  text: string; // 김짠부 말투의 대본 한 덩어리(구어체)
  used_fact_idxs: number[]; // 입력 facts 인덱스 중 이 segment가 근거로 쓴 것
  used_asset_idxs: number[]; // 입력 explanation_assets 인덱스 중 쓴 것(숫자/비유)
  kind?: string; // P1 추가: 레일(짠펜은 아직 미emit, 기본 prose). 적재 시 normalizeSegmentPayload로 정규화.
  payload?: unknown; // P1 추가: 블록 데이터. 마찬가지로 미emit.
}
export interface ScribeOutput {
  segments: ScriptSegmentOut[];
}

export const SCRIBE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["segments"],
  properties: {
    segments: {
      type: "array",
      minItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ord", "text", "used_fact_idxs", "used_asset_idxs"],
        properties: {
          ord: { type: "integer", minimum: 0 },
          text: { type: "string", minLength: 1 },
          used_fact_idxs: { type: "array", items: { type: "integer", minimum: 0 } },
          used_asset_idxs: { type: "array", items: { type: "integer", minimum: 0 } },
        },
      },
    },
  },
};

export const SCRIBE_SYSTEM = [
  "너는 유튜브 재테크 채널 '김짠부'의 대본 작가 '짠펜'이다. 주어진 구성(outline)을 따라 영상 대본을 쓴다.",
  "입력: tone(말투 사양) · outline(구성) · facts(검증된 사실, 일부는 검증등급 표시) · assets(숫자예시·비유).",
  "",
  "■ 말투(필수): tone 사양의 vocab·persona·phrases·hooks·rhythm을 그대로 체화한다. 'banned' 표현은 쓰지 않는다.",
  "  - 오프닝은 tone의 고정 인사로 시작('짠하! 안녕하세요…' 류), 마무리도 tone대로.",
  "■ 쉬운 설명(북극성, 필수): 낯선/추상 개념은 assets의 '숫자 예시'나 '비유'를 먼저 제시한 뒤 설명한다.",
  "  - 해당 개념의 asset이 있으면 반드시 그 segment의 used_asset_idxs에 링크한다.",
  "■ 사실 취급(중요): facts 중 verification_status가 'verified'가 아닌 것(could_not_verify/unverified/conflicting)은",
  "  단정하지 말고 '정확한 수치는 확인이 필요하다'는 식으로 신중히 다루거나, 일반 원리로만 설명한다. 근거로 쓴 fact는 used_fact_idxs에 링크.",
  "■ 표절 금지: 과거 영상 문장을 그대로 베끼지 말고, tone은 따르되 문장은 새로 쓴다.",
  "■ 출력: 대본을 의미 단위 segment들로 나눠 순서(ord)대로. 각 segment는 한국어 구어체 대본 텍스트.",
].join("\n");
