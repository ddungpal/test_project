// 셈이 — 개념을 '숫자 예시'로 체감시킨다(북극성: 숫자 먼저). explanation_assets[kind=number].
//   ★ 산술 검증(§9-⑤): calculation에 계산 과정을 명시 → 오케스트레이터가 가능한 범위에서 코드 검산.
import type { JsonSchema } from "../../llm/types.js";

export interface NumberAssetOut {
  concept: string;
  numeric_example: string; // "100만 원 넣으면 1년에 3만 원" 같은 체감 예시
  calculation: string; // 검산 가능한 식(예: "1000000 * 0.03 = 30000")
  misleading_check: string | null;
}
export interface NumbersOutput {
  assets: NumberAssetOut[];
}

export const NUMBERS_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concept", "numeric_example", "calculation", "misleading_check"],
        properties: {
          concept: { type: "string", minLength: 1 },
          numeric_example: { type: "string", minLength: 1 },
          calculation: { type: "string", minLength: 1 },
          misleading_check: { type: ["string", "null"] },
        },
      },
    },
  },
};

export const NUMBERS_SYSTEM = [
  "너는 '김짠부' 채널의 숫자 담당 '셈이'다. 어려운 개념을 구체적 숫자로 체감시킨다.",
  "입력의 facts는 '팩트검증가가 이미 조사·검증한 사실'이다. concepts는 숫자로 체감시킬 개념이다.",
  "■ 사실 기반(필수): verification_status가 'verified'인 사실의 수치만 '실제 값'으로 사용한다. quote_excerpt에 실제 수치가 있으면 그 값을 우선 쓴다.",
  "  - 'verified'가 아닌(미검증) 수치는 단정하지 말고 '예: 연 3%라고 가정하면…'처럼 가정임을 명시하거나, 마땅한 근거가 없으면 그 예시를 만들지 않는다(억지 생성 금지).",
  "- numeric_example: 시청자가 바로 와닿는 금액·비율 예시(예: '연 3% 금리면 100만 원에 1년 3만 원').",
  "- calculation: 그 숫자를 만든 식을 '검산 가능한 형태'로(예: '1000000 * 0.03 = 30000'). 반드시 numeric_example과 일치.",
  "- misleading_check: 명목/실질·세전후·복리/단리·평균함정 등 오해 소지가 있으면 적고, 없으면 null.",
  "원칙: 추측 수치 금지. 검증된 사실의 값을 우선, 모르면 가정 명시. 한국어.",
].join("\n");
