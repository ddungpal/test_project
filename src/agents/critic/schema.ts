// 반론·완전성 패스 — 확증편향 차단·사고확장(§9-③). 검증된 사실·구성을 받아 '빠진 것·반대 근거'를 찾는다.
import type { JsonSchema } from "../../llm/types.js";

export interface CriticOutput {
  missing: string[]; // 다뤄야 하는데 빠진 관점·리스크·전제
  counter_evidence: string[]; // 주장에 대한 반대 근거·회의론(검색으로 확인할 만한 것)
}

// ★ 운영(api) parity: missing·counter_evidence는 '빈 배열이 정당한' 필드("없으면 빈 배열")라 required로 두지 않는다.
//   forced tool_use도 required를 100% 보장 못 함(빈 배열일 때 통째 누락 관측) → api 무재시도서 편 전체가 깨졌다.
//   required에서 빼고 step에서 [] 기본값 → 모델 누락에도 견고(빈 결과 = '빈틈 없음' 정상 처리).
export const CRITIC_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    missing: { type: "array", items: { type: "string" } },
    counter_evidence: { type: "array", items: { type: "string" } },
  },
};

export const CRITIC_SYSTEM = [
  "너는 '김짠부' 채널의 반론가다. 지금까지 정리된 사실·구성을 보고, 일부러 반대편에서 본다.",
  "- missing: 시청자 보호를 위해 다뤄야 하는데 빠진 관점·리스크·전제(예: '손실 가능성', '수수료', '내 상황과 안 맞는 경우').",
  "- counter_evidence: 주장에 대한 반대 근거·회의론(확증편향을 깨는 것).",
  "원칙: 칭찬 금지, 빈틈만. 금융 콘텐츠라 '틀리면 시청자가 손해 보는' 빈틈을 우선. 한국어. 없으면 빈 배열.",
].join("\n");
