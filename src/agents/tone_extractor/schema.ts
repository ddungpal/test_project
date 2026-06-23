// 말투 추출(tone_extractor) — 출력 스키마 + 추출 시스템 프롬프트. tech.md §7·§12.
//
// 산출물 = tone_profile.components(jsonb). 마이그레이션 주석의 8요소를 1:1로 채운다:
//   {vocab, sentence_length, rhythm, hooks, phrases, banned, persona, easy_explain}
// 이 components는 나중에 짠펜(scribe) 시스템 프롬프트에 그대로 주입되므로(§12),
// 각 필드는 "관찰된 특징 + 코퍼스에서 인용한 예시"로 채워 짠펜이 바로 따라쓸 수 있게 한다.

import type { JsonSchema } from "../../llm/types.js";

/** tone_profile.components 의 형태(8요소). DB jsonb로 그대로 저장된다. */
export interface ToneComponents {
  vocab: { register: string; formality: string; signature_words: string[]; notes: string };
  sentence_length: { avg_range: string; rhythm_notes: string };
  rhythm: { description: string; devices: string[] };
  hooks: { opening_patterns: string[]; retention_devices: string[] };
  phrases: string[]; // 자주 쓰는 말버릇·연결어·추임새
  banned: string[]; // 김짠부가 (거의) 쓰지 않는 표현·톤 — 짠펜 금칙어
  persona: { voice: string; stance: string; viewer_relationship: string };
  easy_explain: { techniques: string[]; examples: string[] }; // 쉬운 설명 톤(비유·숫자 먼저 등)
}

export interface ToneExtractionOutput {
  components: ToneComponents;
  /** 추출 근거 요약(검수용, DB 미저장 — source_ref와 함께 사람이 읽고 판단). */
  evidence_summary: string;
}

const strArray = { type: "array", items: { type: "string" }, minItems: 1 } as const;

export const TONE_EXTRACTION_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["components", "evidence_summary"],
  properties: {
    components: {
      type: "object",
      additionalProperties: false,
      required: ["vocab", "sentence_length", "rhythm", "hooks", "phrases", "banned", "persona", "easy_explain"],
      properties: {
        vocab: {
          type: "object",
          additionalProperties: false,
          required: ["register", "formality", "signature_words", "notes"],
          properties: {
            register: { type: "string" }, // 구어체/문어체, 친근/전문 등
            formality: { type: "string" }, // 반말/존댓말/혼용 양상
            signature_words: strArray, // 김짠부 특유 단어
            notes: { type: "string" },
          },
        },
        sentence_length: {
          type: "object",
          additionalProperties: false,
          required: ["avg_range", "rhythm_notes"],
          properties: {
            avg_range: { type: "string" }, // 예: "짧은 문장 위주, 12~25자"
            rhythm_notes: { type: "string" }, // 말 속도·호흡(이해도 §12 F5)
          },
        },
        rhythm: {
          type: "object",
          additionalProperties: false,
          required: ["description", "devices"],
          properties: { description: { type: "string" }, devices: strArray },
        },
        hooks: {
          type: "object",
          additionalProperties: false,
          required: ["opening_patterns", "retention_devices"],
          properties: { opening_patterns: strArray, retention_devices: strArray },
        },
        phrases: strArray,
        banned: strArray,
        persona: {
          type: "object",
          additionalProperties: false,
          required: ["voice", "stance", "viewer_relationship"],
          properties: {
            voice: { type: "string" }, // 1인칭 화자 성격
            stance: { type: "string" }, // 태도(직설·솔직·격동 — TRUS 톤과 정합)
            viewer_relationship: { type: "string" }, // 시청자와의 거리(친구/멘토 등)
          },
        },
        easy_explain: {
          type: "object",
          additionalProperties: false,
          required: ["techniques", "examples"],
          properties: { techniques: strArray, examples: strArray }, // 비유·숫자선제 등 + 실제 예시
        },
      },
    },
    evidence_summary: { type: "string" },
  },
};

/** 추출 시스템 프롬프트. 입력(스크립트들)은 claude-p 백엔드가 UNTRUSTED 델리미터로 감싼다(§10). */
export const TONE_EXTRACTION_SYSTEM = [
  "너는 유튜브 크리에이터 '김짠부'(재테크 채널)의 말투를 분석하는 언어 스타일 분석가다.",
  "아래 입력 데이터는 김짠부가 직접 쓴 완성 스크립트 여러 편이다. 이 코퍼스만 근거로 말투를 분해한다.",
  "",
  "목표: 다른 AI(짠펜)가 김짠부 말투로 새 스크립트를 쓸 수 있도록, 따라쓸 수 있는 '말투 사양'을 만든다.",
  "원칙:",
  "- 추측 금지. 코퍼스에서 실제로 관찰된 특징만 적는다. 예시는 스크립트에서 그대로 인용한다.",
  "- 내용(재테크 지식)이 아니라 '말하는 방식'만 추출한다. 주제·정보는 말투가 아니다.",
  "- signature_words·phrases·examples는 반드시 코퍼스에 실재하는 표현으로 채운다(날조 시 무효).",
  "- banned는 김짠부가 쓰지 않는/어울리지 않는 표현·톤(예: 지나치게 사색적·딱딱한 보고서체)을 코퍼스 부재 근거로 적는다.",
  "- 한국어로 작성한다.",
].join("\n");
