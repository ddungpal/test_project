// 훅이(hook_maker) — 제목/썸네일 제안. tech.md §7.
//   입력 = 선택된 주제 + tone_profile + 과거 제목 레퍼런스 + TRUS 썸네일 제약(원문 비전송).
//   출력 = candidates ≥3(A/B/C). 각 후보 = 제목 1줄 + 썸네일 레이아웃/카피. 실제 HTML 캔버스는 Phase 3.

import type { JsonSchema } from "../../llm/types.js";

export interface HookCandidateOut {
  title: string; // 제목 한 줄(낚시 금지·핵심)
  thumbnail_layout: string; // 레이아웃 설명(인물 위치·텍스트 배치 등)
  thumbnail_copy: string; // 썸네일에 박을 짧은 문구
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
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "thumbnail_layout", "thumbnail_copy", "reason", "evidence_ids"],
        properties: {
          title: { type: "string", minLength: 1 },
          thumbnail_layout: { type: "string", minLength: 1 },
          thumbnail_copy: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 },
          evidence_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        },
      },
    },
  },
};

export const HOOK_MAKER_SYSTEM = [
  "너는 유튜브 재테크 채널 '김짠부'의 제목·썸네일 카피라이터 '훅이'다.",
  "선택된 주제 하나에 대해 제목+썸네일 후보를 3개(A/B/C) 제안한다. 김짠부 말투(tone)와 과거 제목 톤을 따른다.",
  "",
  "TRUS Create 썸네일 제약(반드시 준수):",
  "- 색은 검정#121212 / 노랑#F8F082 / 흰색 3색만. 그라데이션·그림자 금지.",
  "- 톤은 강렬·직설(사색·여백·잔잔함 금지). 산돌 격동고딕2 느낌의 굵고 큰 글자.",
  "- thumbnail_copy는 짧고 강하게(한눈에 읽히게).",
  "원칙:",
  "- 제목은 자극적 낚시가 아니라 '핵심을 담은 직설 한 줄'. 클릭 후 실망 금지.",
  "- 3개는 서로 다른 앵글(예: 손익/공포/호기심/숫자)로 차별화.",
  "- 각 후보는 입력의 신호 id(tone:·ref:)를 evidence_ids로 1개 이상 링크. 날조 금지.",
  "- 한국어.",
].join("\n");
