// 비유 스타일 추출(analogy_extractor) — 출력 스키마 + 추출 시스템 프롬프트.
//   설계: docs/specs/2026-07-03-analogy-learning-design.md §4.2.
//
// 산출물 = style_profiles.patterns(jsonb, component_type='analogy_style'). 레퍼런스 릴스 트랜스크립트에서
// "재사용 가능한 비유 기법"을 뽑는다. 특정 사례 복붙이 아니라 일반화된 규칙 — 유이(analogist)에 주입.
//
// ⚠️ 빈 배열이 될 수 있는 string[] 필드는 절대 required에 넣지 않는다.
//   (forced tool_use도 required 100% 보장 못 함 → 빈배열 시 모델이 통째 누락 → api 무재시도서
//    전체 실패. 과거 critic 사건.) 빈 가능 필드는 step에서 `?? []` 기본값으로 받는다.
//   required 는 distortion_guard(문자열, 항상 채워야 함) 만 강제한다.

import type { JsonSchema } from "../../llm/types.js";

/** style_profiles.patterns(analogy_style) 의 형태. DB jsonb로 그대로 저장된다. */
export interface AnalogyStylePatterns {
  /** 재사용 비유 기법 규칙(예: "추상 수치→눈에 보이는 물리량 대입"). 빈 가능 → required 제외. */
  techniques: string[];
  /** 비유에 잘 쓰이는 친숙 영역(예: 음식·일상 사물·몸). 빈 가능 → required 제외. */
  target_domains: string[];
  /** 잘 꽂히게 하는 장치(예: "규모/시간 변화를 동작으로 보여줌"). 빈 가능 → required 제외. */
  do: string[];
  /** 오히려 헷갈리게 하는 안티패턴(예: "또 다른 전문용어로 비유"). 빈 가능 → required 제외. */
  banned: string[];
  /** 비유가 사실을 왜곡 안 하게 하는 지침(유이의 distortion_note 강화). 필수(항상 채움). */
  distortion_guard: string;
  /** 전반 신뢰도(저표본 경계). high=여러 영상 반복, tentative=소표본. 옵셔널(누락 허용). */
  confidence?: "high" | "tentative";
  /** 저표본·소수 사례 경고. 빈 배열 가능 → required 제외. */
  tentative_notes?: string[];
}

const strArray = { type: "array", items: { type: "string" } } as const;

export const ANALOGY_EXTRACTION_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  // string[] 필드(techniques·target_domains·do·banned·tentative_notes)와 confidence 는 required 제외.
  //   distortion_guard(문자열)만 필수 — 빈배열/누락 허용 규칙(과거 critic 사건).
  required: ["distortion_guard"],
  properties: {
    techniques: strArray,
    target_domains: strArray,
    do: strArray,
    banned: strArray,
    distortion_guard: { type: "string" },
    confidence: { type: "string", enum: ["high", "tentative"] },
    tentative_notes: strArray,
  },
};

/** 추출 시스템 프롬프트. 입력(트랜스크립트)은 백엔드가 UNTRUSTED 델리미터로 감싼다(§10). */
export const ANALOGY_EXTRACTION_SYSTEM = [
  "너는 유튜브 크리에이터 '김짠부'(재테크 채널)의 비유 능력을 고도화하려는 분석가다.",
  "아래 입력 데이터는 비유를 특출나게 잘하는 레퍼런스 영상들의 음성 전사(트랜스크립트) 뭉치다.",
  "이 코퍼스만 근거로, 어려운 개념을 처음 듣는 사람도 이해하게 만드는 '비유 기법'을 분해한다.",
  "",
  "목표: 다른 AI(유이)가 새 주제에도 적용할 수 있도록, 따라 쓸 수 있는 '비유 기법 프로필'을 만든다.",
  "원칙:",
  "- ★ 재사용 가능한 일반화된 규칙을 뽑는다. 특정 사례를 그대로 복붙하지 말고, 그 사례가 통하는 이유를 규칙으로 추상화한다.",
  "  (예: '월급 300만원'이라는 사례 자체가 아니라 '추상 수치를 눈에 보이는 물리량/일상 사물로 대입한다'는 기법.)",
  "- techniques: 재사용 비유 기법(추상→구체 대입 방식 등). target_domains: 비유에 자주 쓰는 친숙한 영역(음식·몸·일상 사물 등).",
  "- do: 비유가 잘 꽂히게 하는 장치(규모/시간 변화를 동작으로 보여주기 등). banned: 오히려 더 헷갈리게 하는 안티패턴(또 다른 전문용어로 비유 등).",
  "- ★ distortion_guard: 비유가 사실을 왜곡하지 않게 하는 지침을 반드시 채운다. 쉽게 만들려다 틀린 인상을 주는 것을 막는 규칙.",
  "- 추측 금지. 코퍼스에 실제로 관찰된 것만 적는다. 표본이 적으면 confidence='tentative' 로 표기하고 tentative_notes 에 경고를 남긴다.",
  "- 김짠부 톤(직설·쉬움·과장 없이 정확)을 해치지 않는 기법만 추린다.",
  "- 한국어로 작성한다.",
].join("\n");
