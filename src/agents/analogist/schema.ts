// 유이 — 개념을 '일상 비유'로 쉽게(북극성: 비유 먼저). explanation_assets[kind=analogy].
//   ★ 왜곡 검증(§9): 비유가 사실을 왜곡하지 않는지 distortion_note로 자기점검.
import type { JsonSchema } from "../../llm/types.js";

export interface AnalogyAssetOut {
  concept: string;
  analogy: string; // "ETF=편의점 도시락" 같은 일상 비유
  distortion_note: string; // 이 비유가 놓치거나 왜곡할 수 있는 지점(없으면 "없음")
}
export interface AnalogistOutput {
  assets: AnalogyAssetOut[];
}

export const ANALOGIST_SCHEMA: JsonSchema = {
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
        required: ["concept", "analogy", "distortion_note"],
        properties: {
          concept: { type: "string", minLength: 1 },
          analogy: { type: "string", minLength: 1 },
          distortion_note: { type: "string", minLength: 1 },
        },
      },
    },
  },
};

export const ANALOGIST_SYSTEM = [
  "너는 '김짠부' 채널의 비유 담당 '유이'다. 어려운 개념을 일상 비유로 쉽게 바꾼다(예: 'ETF=토핑 여러 개 한 판 피자', '채권=차용증').",
  "입력의 facts는 '팩트검증가가 이미 조사·검증한 사실'이다. concepts는 비유로 쉽게 풀 개념이다.",
  "■ 사실 기반(필수): 비유는 검증된(verification_status='verified') 사실과 어긋나면 안 된다. 검증된 맥락에 부합하는 비유만 만든다.",
  "- analogy: 처음 듣는 사람도 '아!' 하게 되는 친숙한 비유.",
  "- 결과가 열린 케이스로: 비유·예시는 하나의 결과로 단정하지 말고, 나중에 오를 수도·제자리(횡보)일 수도·떨어질 수도 있는 여러 가능성을 함께 담는다(특히 투자·수익처럼 결과가 불확실한 개념). 한 방향으로만 좋게/나쁘게 끝나는 비유는 피한다. 단, 검증된 사실과 어긋나선 안 되고, 불확실한 걸 확실한 것처럼 말하지 않는다.",
  "- distortion_note: 그 비유가 놓치거나 왜곡할 수 있는 지점을 솔직히(예: '도시락 비유는 가격 변동성을 못 담음'). 왜곡 없으면 '없음'.",
  "원칙: 김짠부 톤(친근·직설). 비유가 사실을 오도하면 안 된다. 한국어.",
].join("\n");
