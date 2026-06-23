// 구다리(structurer) — 구성(outline) 제안. tech.md §7·§12 F5(이해 흐름).
//   입력 = 선택된 주제·제목 + 구조 인사이트 + 말투(쉬운설명 톤).
//   출력 = candidates ≥2(서로 다른 구성 접근). 각 후보 = 순서 있는 섹션[] (이해 흐름: 순서·맥락·불안완화·오개념 선제제거).

import type { JsonSchema } from "../../llm/types.js";

export interface OutlineSection {
  section: string; // 섹션 제목
  goal: string; // 이 섹션이 시청자에게 주는 것
  why: string; // 왜 이 순서/위치인가(이해 흐름 근거)
}
export interface StructureCandidateOut {
  approach: string; // 이 구성의 한 줄 컨셉(예: "공포→해소", "사례→원리")
  outline: OutlineSection[];
  reason: string;
  evidence_ids: string[];
}
export interface StructurerOutput {
  candidates: StructureCandidateOut[];
}

export const STRUCTURER_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["approach", "outline", "reason", "evidence_ids"],
        properties: {
          approach: { type: "string", minLength: 1 },
          outline: {
            type: "array",
            minItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["section", "goal", "why"],
              properties: {
                section: { type: "string", minLength: 1 },
                goal: { type: "string", minLength: 1 },
                why: { type: "string", minLength: 1 },
              },
            },
          },
          reason: { type: "string", minLength: 1 },
          evidence_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        },
      },
    },
  },
};

export const STRUCTURER_SYSTEM = [
  "너는 유튜브 재테크 채널 '김짠부'의 구성가 '구다리'다.",
  "선택된 주제·제목에 대해 영상 구성(outline)을 서로 다른 접근으로 2개 이상 제안한다.",
  "",
  "콘텐츠 북극성(반드시): '처음 듣는 사람도 편안하게 듣다 보니 이해됐다.'",
  "그래서 구성은 이해 흐름을 설계한다:",
  "- 순서: 쉬운 것·익숙한 것 먼저, 어려운 것은 비유·맥락을 깐 뒤에.",
  "- 불안 완화: 시청자가 겁먹을 지점을 미리 안심시킨다.",
  "- 오개념 선제 제거: 흔한 오해를 먼저 짚는다.",
  "각 section은 goal(시청자가 얻는 것)과 why(왜 이 순서·위치인지)를 명확히 한다.",
  "원칙:",
  "- 2개 후보는 접근(approach)이 실제로 달라야 한다(예: '사례→원리' vs '공포→해소').",
  "- 각 후보는 입력 신호 id(topic·title·tone:·insight:)를 evidence_ids로 1개 이상 링크. 날조 금지.",
  "- 한국어.",
].join("\n");
