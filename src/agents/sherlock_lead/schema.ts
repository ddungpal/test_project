// 셜록(팀장) scope — outline → 검증 대상 분해(§7). claims(사실 검증 대상) + concepts(설명자산 대상).
import type { JsonSchema } from "../../llm/types.js";

export interface ScopeClaim {
  text: string; // 검증할 사실 주장 한 문장
  is_financial: boolean; // 금융/수치/제도 = 강검증(§9-⑥, §11)
  section?: string; // 이 claim이 뒷받침하는 목차 섹션(고루 커버용·옵셔널)
}
export interface ScopeConcept {
  name: string; // 시청자가 어려워할 핵심 개념
  needs_number: boolean; // 숫자 예시 필요(셈이)
  needs_analogy: boolean; // 쉬운 비유 필요(유이)
  section?: string; // 이 concept이 뒷받침하는 목차 섹션(고루 커버용·옵셔널)
}
export interface SherlockScopeOutput {
  claims: ScopeClaim[];
  concepts: ScopeConcept[];
}

export const SHERLOCK_SCOPE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: true, // 루트도 stray 허용(claude-p 내성). required로 claims·concepts 존재는 강제.
  required: ["claims", "concepts"],
  properties: {
    claims: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: true, // claude-p가 여분 필드를 붙여도 통과 — 필수·타입은 유지, stray는 buildScopeCandidates가 필드 명시선택해 버림(무해).
        required: ["text", "is_financial"],
        properties: { text: { type: "string", minLength: 1 }, is_financial: { type: "boolean" }, section: { type: "string" } },
      },
    },
    concepts: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: true, // claude-p가 여분 필드를 붙여도 통과 — 필수·타입은 유지, stray는 buildScopeCandidates가 필드 명시선택해 버림(무해).
        required: ["name", "needs_number", "needs_analogy"],
        properties: {
          name: { type: "string", minLength: 1 },
          needs_number: { type: "boolean" },
          needs_analogy: { type: "boolean" },
          section: { type: "string" },
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
  "섹션 커버리지(중요): outline의 각 섹션을 고루 커버한다 — 특정 섹션에 쏠리지 말고 모든 섹션이 최소 1개의 claim 또는 concept을 갖게 한다. 각 항목이 뒷받침하는 섹션 이름을 section 필드에 기재한다.",
  "정렬(중요): claims·concepts를 각각 중요도순으로 정렬한다 — 틀리면 시청자가 손해 보는 것을 배열 앞쪽에 둔다. (별도 우선순위 점수 없이 배열 순서가 곧 중요도다.)",
  "분량: input.budget이 오면 그건 '기본으로 체크해 둘 개수 힌트'일 뿐 상한이 아니다. 후보는 빠짐없이 모두 내라 — 최종 선택은 사용자가 한다.",
  "원칙: 틀리면 시청자가 손해 보는 주장을 빠짐없이 claims로. 내용 생성이 아니라 '검증 대상 목록화'만. 한국어.",
].join("\n");
