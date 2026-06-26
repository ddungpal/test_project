// 교정쌍 차이 분석(correction_diff) — 출력 스키마 + 비교 시스템 프롬프트. tech.md §7·§13.2.
//
// 산출물 = thumbnail_corrections.diff(jsonb). '김짠부 이상' 카피와 'AI 생성' 카피를 LLM이 비교해
// "왜 달랐나"를 구조화한다. 표시·기록용 분석일 뿐 — 학습(style_profiles.patterns/banned)과 독립이다.
//   (학습 권위는 step2 재학습 루프. diff 를 patterns 에 쓰면 안 됨.)
//
// ⚠️ 빈 배열이 될 수 있는 string[] 필드(added·removed·actionable_rules)는 절대 required 에 넣지 않는다.
//   (forced tool_use 도 required 100% 보장 못 함 → 빈배열 시 모델이 통째 누락 → 전체 실패. 과거 critic 사건.)
//   소비 측(analyzeCorrectionDiff)이 `?? []` 기본값으로 받는다.

import type { JsonSchema } from "../../llm/types.js";

/** thumbnail_corrections.diff 의 형태. DB jsonb 로 그대로 저장된다. */
export interface CorrectionDiff {
  summary: string;            // 한 줄 총평
  tone: string;               // 어투 차이
  hook_angle: string;         // 후킹 각도 차이
  length_density: string;     // 길이·압축 차이
  added: string[];            // 이상이 더 넣은 요소
  removed: string[];          // 생성이 과했던/이상이 뺀 요소
  actionable_rules: string[]; // 다음 생성에 적용할 일반화 가능한 규칙
}

const strArray = { type: "array", items: { type: "string" } } as const;

export const CORRECTION_DIFF_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  // string[] 필드(added·removed·actionable_rules)는 빈배열 가능 → required 제외(style_extractor schema 미러).
  required: ["summary", "tone", "hook_angle", "length_density"],
  properties: {
    summary: { type: "string" },
    tone: { type: "string" },
    hook_angle: { type: "string" },
    length_density: { type: "string" },
    added: strArray,
    removed: strArray,
    actionable_rules: strArray,
  },
};

/** 비교 시스템 프롬프트. 입력(생성·이상 카피)은 백엔드가 UNTRUSTED 델리미터로 감싼다(§10). */
export const CORRECTION_DIFF_SYSTEM = [
  "너는 유튜브 크리에이터 '김짠부'(재테크 채널)의 썸네일/제목 카피 코치다.",
  "아래 입력에는 같은 주제에 대한 두 카피가 있다: 'AI 생성'(generated)과 '김짠부가 원하는 이상'(ideal).",
  "두 카피를 비교해 김짠부가 무엇을 어떻게 고쳤는지 분해한다.",
  "분해 항목:",
  "- tone: 어투 차이(예: 명령은 존댓말로, 단정 → 권유).",
  "- hook_angle: 후킹 각도 차이(무엇을 미끼로 거는가 — 손해 회피/이득/호기심 등).",
  "- length_density: 길이·압축 차이(더 짧게/길게, 군더더기 제거 등).",
  "- added: 이상 카피가 더 넣은 요소(강조어·숫자·구체성 등).",
  "- removed: 생성 카피가 과했거나 이상 카피가 뺀 요소.",
  "- actionable_rules: 다음 생성에 적용할 '일반화 가능한 규칙'(예: '명령은 존댓말로', '금액은 구체 숫자로').",
  "원칙:",
  "- 추측 금지. 입력 두 카피에 실제로 관찰된 차이만 적는다.",
  "- 두 카피가 거의 같으면 차이 없음을 솔직히 적고 배열은 비운다(날조 금지).",
  "- summary 는 한 줄 총평으로 가장 핵심적인 차이를 압축한다.",
  "- 한국어로 작성한다.",
].join("\n");
