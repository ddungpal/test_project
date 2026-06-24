// 썸네일 스타일 추출(style_extractor) — 출력 스키마 + 추출 시스템 프롬프트. tech.md §13.2.
//
// 산출물 = style_profiles.patterns(jsonb). 김짠부 썸네일의 카피(텍스트)와 시각 라벨에서
// "따라 만들 수 있는 썸네일 스타일 사양"을 뽑는다. 말투(tone)는 스크립트의 '말하는 방식',
// 여기는 썸네일의 '표현 방식'(카피 구성 + 시각 연출)만 다룬다.
//
// ⚠️ 빈 배열이 될 수 있는 string[] 필드는 절대 required에 넣지 않는다.
//   (forced tool_use도 required 100% 보장 못 함 → 빈배열 시 모델이 통째 누락 → api 무재시도서
//    전체 실패. 과거 critic 사건.) 빈 가능 필드는 step에서 `?? []` 기본값으로 받는다.

import type { JsonSchema } from "../../llm/types.js";

/** style_profiles.patterns 의 형태. DB jsonb로 그대로 저장된다. */
export interface ThumbnailStylePatterns {
  /** 카피(텍스트) 패턴 — 메인카피·작은박스 구성 방식. */
  copy: {
    hook_patterns: string[]; // 후킹 패턴(예: "연봉 N 이하 꼭 보세요")
    structure: { description: string; main_copy_notes: string; small_box_notes: string }; // 메인카피 ↔ 작은박스 관계
    emphasis_words: string[]; // 강조에 쓰는 단어(예: "무조건", "필수 시청")
    length_notes: string; // 카피 길이·호흡 경향
  };
  /** 시각(visual) 패턴 — 라벨에서 관찰된 연출. 라벨이 비어 있으면 코퍼스 부재로 처리. */
  visual: {
    face: string; // 인물/표정 사용 양상
    layout_archetypes: string[]; // 반복되는 레이아웃 유형(예: 비포/애프터 2분할)
    color_usage: string; // 색 사용(TRUS 3색 정합 등)
    number_treatment: string; // 숫자 강조 방식(금액·연봉·수익률)
    devices: string[]; // 시각 장치(화살표·박스·하이라이트 등)
  };
  /** 김짠부가 (거의) 쓰지 않는 표현/스타일 — 훅이 금칙어. */
  banned: string[];
  /** 전반 신뢰도(저표본 경계). high=여러 영상 반복 승리, tentative=1~2 사례·소표본. 옵셔널(누락 허용). */
  confidence?: "high" | "tentative";
  /** 저표본·소수 사례 경고(tentative 패턴 메모). 빈 배열 가능 → required 제외. */
  tentative_notes?: string[];
}

export interface StyleExtractionOutput {
  patterns: ThumbnailStylePatterns;
  /** 추출 근거 요약(검수용, DB 미저장 — source_ref와 함께 사람이 읽고 판단). */
  evidence_summary: string;
}

const strArray = { type: "array", items: { type: "string" } } as const;

export const STYLE_EXTRACTION_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  // string[] 필드(hook_patterns·emphasis_words·layout_archetypes·devices·banned)는 required 제외.
  required: ["patterns", "evidence_summary"],
  properties: {
    patterns: {
      type: "object",
      additionalProperties: false,
      // confidence·tentative_notes 는 옵셔널(저표본 표기) — required 에 넣지 않는다(빈배열/누락 허용 규칙).
      required: ["copy", "visual"], // copy/visual 객체는 필수. 그 안의 배열 필드는 required 아님.
      properties: {
        copy: {
          type: "object",
          additionalProperties: false,
          required: ["structure", "length_notes"], // 객체·string은 필수, 배열은 제외
          properties: {
            hook_patterns: strArray,
            structure: {
              type: "object",
              additionalProperties: false,
              required: ["description", "main_copy_notes", "small_box_notes"],
              properties: {
                description: { type: "string" },
                main_copy_notes: { type: "string" }, // 메인카피 구성 경향
                small_box_notes: { type: "string" }, // 작은 박스(보조 카피) 구성 경향
              },
            },
            emphasis_words: strArray,
            length_notes: { type: "string" },
          },
        },
        visual: {
          type: "object",
          additionalProperties: false,
          required: ["face", "color_usage", "number_treatment"], // string 필드만 필수, 배열은 제외
          properties: {
            face: { type: "string" },
            layout_archetypes: strArray,
            color_usage: { type: "string" },
            number_treatment: { type: "string" },
            devices: strArray,
          },
        },
        banned: strArray,
        confidence: { type: "string", enum: ["high", "tentative"] }, // 옵셔널 — required 제외.
        tentative_notes: strArray, // 옵셔널 빈 가능 배열 — required 제외.
      },
    },
    evidence_summary: { type: "string" },
  },
};

/** 추출 시스템 프롬프트. 입력(카피·라벨)은 백엔드가 UNTRUSTED 델리미터로 감싼다(§10). */
export const STYLE_EXTRACTION_SYSTEM = [
  "너는 유튜브 크리에이터 '김짠부'(재테크 채널)의 썸네일 스타일을 분석하는 분석가다.",
  "아래 입력 데이터는 김짠부 썸네일의 카피(텍스트)와 시각 라벨이다. 이 코퍼스/라벨만 근거로 썸네일 스타일을 분해한다.",
  "",
  "목표: 다른 AI(훅이)가 김짠부 스타일로 새 썸네일을 만들 수 있도록, 따라 만들 수 있는 '썸네일 스타일 사양'을 만든다.",
  "원칙:",
  "- 추측 금지. 코퍼스/라벨에 실제로 관찰된 것만 적는다. 예시는 입력에서 그대로 인용한다.",
  "- 말투(스크립트의 말하는 방식)가 아니라 '썸네일 표현 방식'만 추출한다. 카피 구성·시각 연출이 대상이다.",
  "- copy(메인카피↔작은박스 구성·후킹·강조어)와 visual(인물·레이아웃·색·숫자·장치)을 구분해 채운다.",
  "- 시각 라벨이 비어 있는 편이 있으면 없는 대로 둔다. 보이지 않는 시각 정보를 지어내지 않는다.",
  "- hook_patterns·emphasis_words·banned 등은 반드시 입력에 실재하는 표현으로 채운다(날조 시 무효).",
  "- banned는 김짠부가 쓰지 않는/어울리지 않는 카피·연출(예: 사색적·여백 위주·잔잔한 톤)을 부재 근거로 적는다.",
  "- 한국어로 작성한다.",
].join("\n");
