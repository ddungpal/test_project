// 셜록(팀장) scope — outline → 검증 대상 분해(§7). claims(사실 검증 대상) + concepts(설명자산 대상).
import type { JsonSchema } from "../../llm/types.js";

export interface ScopeClaim {
  text: string; // 검증할 사실 주장 한 문장
  is_financial: boolean; // 금융/수치/제도 = 강검증(§9-⑥, §11)
}
export interface ScopeConcept {
  name: string; // 시청자가 어려워할 핵심 개념
  needs_number: boolean; // 숫자 예시 필요(셈이)
  needs_analogy: boolean; // 쉬운 비유 필요(유이)
}
export interface SherlockScopeOutput {
  claims: ScopeClaim[];
  concepts: ScopeConcept[];
}

export const SHERLOCK_SCOPE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claims", "concepts"],
  properties: {
    claims: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "is_financial"],
        properties: { text: { type: "string", minLength: 1 }, is_financial: { type: "boolean" } },
      },
    },
    concepts: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "needs_number", "needs_analogy"],
        properties: {
          name: { type: "string", minLength: 1 },
          needs_number: { type: "boolean" },
          needs_analogy: { type: "boolean" },
        },
      },
    },
  },
};

export const SHERLOCK_SCOPE_SYSTEM = [
  "너는 유튜브 재테크 채널 '김짠부'의 리서치 팀장 '셜록'이다.",
  "선택된 영상 구성(outline)을 받아, 제작 전에 '검증해야 할 것'을 분해한다.",
  "- claims: 영상에서 사실로 단정할 주장들(수치·제도·비교). 각 claim의 is_financial은 금융/세금/금리/제도/통계면 true.",
  "- concepts: 시청자가 처음 들으면 어려워할 핵심 개념. needs_number(숫자 예시로 체감시켜야)·needs_analogy(쉬운 비유 필요) 표시.",
  "원칙: 틀리면 시청자가 손해 보는 주장을 빠짐없이 claims로. 내용 생성이 아니라 '검증 대상 목록화'만. 한국어.",
].join("\n");
