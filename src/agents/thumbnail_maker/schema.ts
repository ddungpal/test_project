// 썸네일메이커(thumbnail_maker) — 선택된 제목에 맞춘 썸네일 전용 제안. tech.md §7.
//   입력 = 선택된 주제 + '선택된 제목' + tone + 썸네일 카피 레퍼런스 + active 썸네일 스타일(A/B 학습).
//   출력 = candidates 정확히 3개(A/B/C). 각 후보 = 썸네일 레이아웃/메인2/박스2 + 이유 + 근거.
//   ★ 훅이 SYSTEM의 썸네일 부분을 가져와 '선택된 제목에 맞는 썸네일'로 재구성한다(단계 분리).

import type { JsonSchema } from "../../llm/types.js";

export interface ThumbnailCandidateOut {
  thumbnail_layout: string; // 레이아웃 설명(인물 위치·텍스트 배치 등)
  thumbnail_main: string[]; // 메인문구 정확히 2개(큰 글자 핵심 두 마디)
  thumbnail_boxes: string[]; // 작은 박스 정확히 2개(보조 후킹·구체수치·질문)
  reason: string;
  evidence_ids: string[]; // 제공 신호 id("tone:vN","ref:…","style:…")
}
export interface ThumbnailMakerOutput {
  candidates: ThumbnailCandidateOut[];
}

export const THUMBNAIL_MAKER_SCHEMA: JsonSchema = {
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
        required: ["thumbnail_layout", "thumbnail_main", "thumbnail_boxes", "reason", "evidence_ids"],
        properties: {
          thumbnail_layout: { type: "string", minLength: 1 },
          thumbnail_main: { type: "array", items: { type: "string", minLength: 1 }, minItems: 2, maxItems: 2 },
          thumbnail_boxes: { type: "array", items: { type: "string", minLength: 1 }, minItems: 2, maxItems: 2 },
          reason: { type: "string", minLength: 1 },
          evidence_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        },
      },
    },
  },
};

export const THUMBNAIL_MAKER_SYSTEM = [
  "너는 유튜브 재테크 채널 '김짠부'의 썸네일 카피라이터 '썸네일메이커'다.",
  "이미 '선택된 제목' 하나가 주어진다. 그 제목에 맞는 썸네일 후보를 정확히 3개(A/B/C) 제안한다. 김짠부 말투(tone)와 과거 썸네일 톤을 따른다.",
  "",
  "TRUS Create 썸네일 제약(반드시 준수):",
  "- 색은 검정#121212 / 노랑#F8F082 / 흰색 3색만. 그라데이션·그림자 금지.",
  "- 톤은 강렬·직설(사색·여백·잔잔함 금지). 산돌 격동고딕2 느낌의 굵고 큰 글자.",
  "",
  "썸네일 카피 구조(반드시 준수):",
  "- 썸네일 카피는 ① 메인문구 2개(thumbnail_main: 큰 글자 핵심 두 마디) ② 작은 박스 2개(thumbnail_boxes: 보조 후킹·구체수치·질문)로 나눠 쓴다. 각각 정확히 2개.",
  "- 각 문구는 짧고 강하게(한눈에 읽히게).",
  "- thumbnail_main의 두 문구는 상단/하단으로 각각 그 자체로 완성된 메시지여야 한다. 둘이 이어져야만 말이 되는 반쪽(예: '배당받고도'+'주가 빠집니다')은 금지 — 각 줄을 따로 봐도 후킹이 성립하게 쓴다. (상·하단이 같은 주제를 다른 각도로 강조하는 건 OK, 단 한 문장을 둘로 자르는 건 금지.)",
  '- 예시(파킹통장): thumbnail_main = ["통장에 돈 묵히면 손해","파킹통장이 정답입니다"], thumbnail_boxes = ["파킹통장 추천","연 4% 이자 실화?"].',
  "",
  "원칙:",
  "- 썸네일은 '선택된 제목'을 시각적으로 강화한다. 제목과 따로 노는 카피 금지 — 제목의 핵심 약속을 한눈에 보이게 한다.",
  "- 3개는 서로 다른 앵글(예: 손익/공포/호기심/숫자)로 차별화.",
  "- 각 후보는 입력의 신호 id(tone:·ref:·style:)를 evidence_ids로 1개 이상 링크. 날조 금지.",
  "- 레퍼런스(reference_titles·스타일 프로파일)는 톤·구조 참고용이다. 문구를 그대로 베끼지 마라 — 표현·단어를 재구성해 김짠부답되 매번 새롭게. 레퍼런스와 거의 동일한 카피 금지.",
  "- 한국어.",
].join("\n");
