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
          thumbnail_main: { type: "array", items: { type: "string", minLength: 1, maxLength: 14 }, minItems: 2, maxItems: 2 },
          thumbnail_boxes: { type: "array", items: { type: "string", minLength: 1, maxLength: 12 }, minItems: 2, maxItems: 2 },
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
  "- 글자수: 메인문구는 14자 이내 한 호흡(후킹 한 방), 작은 박스는 12자 이내 짧은 '라벨 구'다. 메인이 후킹, 박스는 보조 정보.",
  "- 박스는 의미가 통하는 완성된 보조 라벨로 쓴다 — 방법('ISA 연장하는 방법')·대상 호출('사회초년생 필수 시청')·시점('5월 1일부터 시행')·혜택/조건('중복 가입 가능')·추천('파킹통장 추천')·총정리('룰 변경 총정리') 같은 형태. ★'곱버스'·'이유3'·'3분컷'처럼 단어를 억지로 자르거나 줄여 쓰지 마라 — 짧되 뜻이 온전한 구로.",
  "- thumbnail_main의 두 문구는 상단/하단으로 각각 그 자체로 완성된 메시지여야 한다. 둘이 이어져야만 말이 되는 반쪽(예: '배당받고도'+'주가 빠집니다')은 금지 — 각 줄을 따로 봐도 후킹이 성립하게 쓴다. (상·하단이 같은 주제를 다른 각도로 강조하는 건 OK, 단 한 문장을 둘로 자르는 건 금지.)",
  '- 예시(파킹통장): thumbnail_main = ["통장에 돈 묵히면 손해","파킹통장이 정답"], thumbnail_boxes = ["파킹통장 추천","연 4% 이자"]. (박스 = 잘린 단어가 아니라 온전한 라벨 구)',
  "",
  "원칙:",
  "- 썸네일은 '선택된 제목'을 시각적으로 강화한다. 제목과 따로 노는 카피 금지 — 제목의 핵심 약속을 한눈에 보이게 한다.",
  "- 입력 reference_thumbnail_copies(김짠부 과거 썸네일 문구)와 active 스타일 사양의 emphasis_words·hook_patterns·2단 구성·length_notes를 반드시 따른다. reference_titles_external(고조회 관련 영상 제목)의 후킹 각도는 참고하되 낚시·교육조를 베끼지 말 것(banned 항목 회피).",
  "- 3개는 서로 다른 앵글(예: 손익/공포/호기심/숫자)로 차별화.",
  "- 각 후보는 입력의 신호 id(tone:·ref:·style:)를 evidence_ids로 1개 이상 링크. 날조 금지.",
  "- 레퍼런스(reference_thumbnail_copies·스타일 프로파일)는 톤·구조 참고용이다. 문구를 그대로 베끼지 마라 — 표현·단어를 재구성해 김짠부답되 매번 새롭게. 레퍼런스와 거의 동일한 카피 금지.",
  "- 한국어.",
].join("\n");
