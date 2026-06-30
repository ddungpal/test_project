// 구다리(structurer) — 구성(outline) 제안. tech.md §7·§12 F5(이해 흐름).
//   입력 = 선택된 주제·제목 + 구조 인사이트 + 말투(쉬운설명 톤).
//   출력 = candidates ≥2(서로 다른 구성 접근). 각 후보 = 순서 있는 섹션[] (이해 흐름: 순서·맥락·불안완화·오개념 선제제거).

import type { JsonSchema } from "../../llm/types.js";

// P2: 섹션의 권장 형식 신호. step 1(짠펜)이 받아 실제 형식 블록(table/case)을 emit.
export type SectionFormat = "table" | "case" | "explain";

export interface OutlineSection {
  section: string; // 섹션 제목
  goal: string; // 이 섹션이 시청자에게 주는 것
  why: string; // 왜 이 순서/위치인가(이해 흐름 근거)
  format?: SectionFormat; // P2: 이 섹션의 권장 형식(없으면 explain=prose, 하위호환)
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
              required: ["section", "goal", "why"], // format은 optional(하위호환) — 절대 넣지 말 것.
              properties: {
                section: { type: "string", minLength: 1 },
                goal: { type: "string", minLength: 1 },
                why: { type: "string", minLength: 1 },
                format: { type: "string", enum: ["table", "case", "explain"] },
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
  "",
  "형식 신호(format, 선택): 섹션 내용에서 형식이 자연히 나올 때만 그 섹션에 format을 지정한다.",
  "- table — 2개 이상 대상을 나란히 비교하는 섹션(예: 상품 A vs B, 조건별 차이). 비교 축이 분명할 때만.",
  "- case — 시청자 상황에 따라 답이 갈리는 섹션(예: '이런 분은 A, 저런 분은 B'). 분기 조건이 분명할 때만.",
  "- explain(기본) — 개념 설명·서사·도입 등 그 외 전부. 확신이 없으면 explain.",
  "억지 금지: 비교/분기가 실제로 없는 섹션을 표·케이스로 만들지 마라. 형식을 위한 형식은 김짠부답지 않다.",
  "format은 선택이다 — 생략하면 explain과 동일하게 취급된다. 모든 섹션에 형식을 붙일 필요는 없다.",
  "원칙:",
  "- 2개 후보는 접근(approach)이 실제로 달라야 한다(예: '사례→원리' vs '공포→해소').",
  "- 각 후보는 입력 신호 id(topic·title·tone:·insight:)를 evidence_ids로 1개 이상 링크. 날조 금지.",
  "- 한국어.",
].join("\n");
