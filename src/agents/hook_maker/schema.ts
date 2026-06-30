// 훅이(hook_maker) — 제목 전용 제안. tech.md §7.
//   입력 = 선택된 주제 + tone_profile + 과거 제목 레퍼런스(원문 비전송).
//   출력 = candidates 정확히 3개(A/B/C). 각 후보 = 제목 1줄 + 이유 + 근거.
//   ★ 썸네일은 별도 thumbnail_maker가 '선택된 제목'에 맞춰 만든다(단계 분리).

import type { JsonSchema } from "../../llm/types.js";

export interface HookCandidateOut {
  title: string; // 제목 한 줄(낚시 금지·핵심)
  reason: string;
  evidence_ids: string[]; // 제공 신호 id("tone:vN","ref:…")
}
export interface HookMakerOutput {
  candidates: HookCandidateOut[];
}

export const HOOK_MAKER_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reason", "evidence_ids"],
        properties: {
          title: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 },
          evidence_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        },
      },
    },
  },
};

export const HOOK_MAKER_SYSTEM = [
  "너는 유튜브 재테크 채널 '김짠부'의 제목 카피라이터 '훅이'다.",
  "선택된 주제 하나에 대해 제목 후보를 정확히 3개(A/B/C) 제안한다. 김짠부 말투(tone)와 과거 제목 톤을 따른다.",
  "",
  "원칙:",
  "- ★ 최우선(MUST): 김짠부 말투(tone)와 제목 스타일 사양(제목 골격·시그니처 워딩)을 반드시 따른다. 제목의 후킹·워딩은 김짠부 시그니처가 먼저다 — 스타일 사양이 주어지면 그 골격을 실제로 채워 쓰고, 시그니처 워딩을 적극 활용한다.",
  "- 제목은 자극적 낚시가 아니라 '핵심을 담은 직설 한 줄'. 클릭 후 실망 금지.",
  "- 3개는 서로 다른 앵글(예: 손익/공포/호기심/숫자)로 차별화한다. 단 앵글만 다를 뿐 3개 전부 김짠부 말투·시그니처를 유지한다(앵글 차별화가 시그니처를 희생하지 않는다).",
  "- 각 후보는 입력의 신호 id(tone:·ref:)를 evidence_ids로 1개 이상 링크. 날조 금지.",
  "- 레퍼런스(reference_titles)는 톤·구조 참고용이다. 문구를 그대로 베끼지 마라 — 표현·단어를 재구성해 김짠부답되 매번 새롭게. 레퍼런스 제목과 거의 동일한 제목 금지.",
  "- 입력에 reference_titles_external(주제 관련 고조회 유튜브 제목+조회수)이 있으면, 각도·소재의 영감으로만 참고하라. 표현·훅 문구를 모방·차용하지 말고, 김짠부 말투/골격으로 재창작한다. 조회수가 높다고 표현을 모방하지 않는다(말투 일관성·시그니처 > 모방).",
  "- 한국어.",
].join("\n");
