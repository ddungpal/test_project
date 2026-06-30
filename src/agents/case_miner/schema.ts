// 분기가 — 검증된 사실 + 댓글 집계 신호(원문 비전송)를 '상황(condition)→결과(outcome)' 케이스 분기로 구조화(explanation_assets[kind=case]).
//   ★ money-safety: 검증된 사실로 뒷받침되는 outcome만 grounded=true. 근거 없으면 "확인 필요" + grounded=false(추측 단정·날조 금지).
//   ★ governance C안: 댓글 '원문'은 받지 않는다 — 시청자 상황은 코드 집계 신호(question_comment_count·keyword_signals) + 주제 + 검증된 사실에서 도출.
//   ★ stray 내성: 비교가(COMPARATOR_SCHEMA) 미러 — assets/items/branches items 모두 additionalProperties:true(claude-p stray 결정적 실패 방지).
import type { JsonSchema } from "../../llm/types.js";

export interface CaseAssetOut {
  concept: string;
  intro?: string;
  branches: { condition: string; outcome: string; grounded: boolean }[]; // ≥2
}
export interface CaseMinerOutput {
  assets: CaseAssetOut[];
}

export const CASE_MINER_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: true, // 루트도 stray 허용(claude-p 내성). required로 assets 존재만 강제.
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      minItems: 0, // 만들 게 없으면 빈 배열(억지 금지 — 빈 케이스보다 없는 게 낫다).
      items: {
        type: "object",
        additionalProperties: true, // claude-p가 여분 필드를 붙여도 통과 — 필수·타입만 유지, stray는 buildAssetRows가 명시선택해 버림.
        required: ["concept", "branches"], // intro는 옵셔널 → required 제외.
        properties: {
          concept: { type: "string", minLength: 1 },
          intro: { type: "string" },
          branches: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true, // branch stray도 흡수.
              required: ["condition", "outcome", "grounded"],
              properties: {
                condition: { type: "string" },
                outcome: { type: "string" },
                grounded: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
};

export const CASE_MINER_SYSTEM = [
  "너는 '김짠부' 채널의 케이스 분기 담당 '분기가'다. 검증된 사실을 '시청자 상황(condition)→결과(outcome)' 분기로 구조화한다.",
  "입력의 facts는 '팩트검증가가 이미 조사·검증한 사실'이다(claim·verification_status·quote_excerpt). sections는 케이스 분기가 필요한 목차 섹션들이다(section·goal).",
  "입력의 commentSignals는 '댓글 원문이 아니라' 코드가 집계한 신호다(question_comment_count·keyword_signals — 시청자가 자주 묻는 키워드와 궁금증 빈도). ★ 댓글 원문(개별 사연·재무상황)은 받지 않는다 — 받을 수도, 요구할 수도 없다.",
  "집계 신호와 주제로 시청자 상황(condition)을 도출한다('이런 상황이면…'). 자주 묻히는(빈도 높은) 키워드일수록 우선해 분기로 만든다.",
  "■ money-safety(최우선): outcome이 검증된 사실(verification_status='verified', quote_excerpt에 실제 값)로 뒷받침될 때만 grounded=true로 한다.",
  "  - 근거가 없거나 미검증이면 outcome에 '확인 필요'라고 명시하고 grounded=false로 한다. 수치·제도·금리를 추측으로 단정하지 마라. 날조 금지.",
  "■ 억지 금지: 의미 있는 분기가 2개 미만인 섹션은 케이스 자산을 만들지 마라(그 섹션은 그냥 빼라). 빈 케이스보다 없는 게 낫다.",
  "  - 만들 게 하나도 없으면 assets를 빈 배열([])로 내라.",
  "- concept: 이 케이스가 다루는 한 줄 주제(예: '소득 상황별 저축 전략').",
  "- intro(옵셔널): 분기를 묶어 소개하는 한 줄.",
  "- branches: '상황(condition)→결과(outcome)' 분기 목록(≥2). 각 branch에 grounded를 명시.",
  "원칙: 새 사실을 만들지 않는다 — 검증된 사실만 분기로 정리한다. 한국어.",
].join("\n");
