// 회고(retrospectivist) — 발행 후 학습 루프. tech.md §learning-loop / plan Phase 4.
//   입력 = 한 영상의 성과(조회수·CTR·시청지속·A/B) + 그때의 선택(주제·제목/썸네일·구성) + 시청자 반응(댓글 집계·원문 비전송).
//   출력 = 회고 3축(good/improvements/lessons) + 인사이트 draft N개(다음 제작에 적용 가능한 일반화 규칙).
//   ★ 거버넌스 C: 댓글 원문은 들어오지 않는다(코드가 키워드 집계만 만들어 전달).

import type { JsonSchema } from "../../llm/types.js";

export const INSIGHT_CATEGORIES = ["topic", "thumbnail", "title", "structure", "tone", "research", "cta", "analogy"] as const;
export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export interface RetrospectiveInsightDraft {
  category: InsightCategory;
  title: string; // 한 줄 규칙(예: "재테크 주제는 질문형 썸네일이 직설형보다 CTR 높다")
  body: string; // 왜 그런지 + 다음에 어떻게 적용할지(성과·선택 인과 근거 포함)
  confidence: number; // 0~1 — 근거 강도(A/B decisive·표본 큼 → 높게, 단편·inconclusive → 낮게)
  evidence: string; // 어떤 성과/선택/반응에 기반했는지 명시
}

export interface RetrospectiveOutput {
  good_points: string; // 잘된 점(성과와 그때 선택을 인과로 연결)
  improvements: string; // 아쉬운 점·다음에 바꿔볼 것
  lessons: string; // 한 문장 핵심 교훈
  insights: RetrospectiveInsightDraft[]; // 0개 이상(근거 부족하면 비워도 됨)
}

export const RETROSPECTIVE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["good_points", "improvements", "lessons", "insights"],
  properties: {
    good_points: { type: "string", minLength: 1 },
    improvements: { type: "string", minLength: 1 },
    lessons: { type: "string", minLength: 1 },
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "title", "body", "confidence", "evidence"],
        properties: {
          category: { type: "string", enum: [...INSIGHT_CATEGORIES] },
          title: { type: "string", minLength: 1 },
          body: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: { type: "string", minLength: 1 },
        },
      },
    },
  },
};

export const RETROSPECTIVE_SYSTEM = [
  "너는 유튜브 재테크 채널 '김짠부'의 회고 담당이다(제작 동료 AI 크루의 '회고').",
  "한 영상이 발행된 뒤의 성과와, 그 영상을 만들 때 김짠부가 내린 선택, 그리고 시청자 반응을 받는다(댓글 원문은 없고 집계만).",
  "입력:",
  "  - content: 제목·주제·포맷·업로드일",
  "  - performance.windows: 기간별(d1/d7/d14/d30) 조회수·CTR(%)·평균 시청 지속률(%)",
  "  - performance.ab: 썸네일/제목 A·B·C 회수 — winner·상대 리프트 margin·결정력(decisive/marginal/inconclusive)·변형별 CTR",
  "  - choices: 단계별 선택(주제·제목/썸네일·구성)과 김짠부가 남긴 선택 이유",
  "  - audience_reaction: 발행 후 댓글 집계(총 수·질문 수·상위 키워드)",
  "",
  "할 일:",
  "  1) good_points — 무엇이 잘됐는지를 '성과 ← 그때의 선택' 인과로 적는다(추측 말고 데이터로).",
  "  2) improvements — 아쉬운 점과 다음에 바꿔볼 것.",
  "  3) lessons — 한 문장 핵심 교훈.",
  "  4) insights — 다음 제작에 재사용 가능한 '일반화된 규칙'을 카테고리별로 0개 이상 제안한다.",
  "",
  "원칙(중요):",
  "  - 근거 없는 일반화 금지. 각 insight는 evidence에 어떤 성과/선택/반응에 기반했는지 구체적으로 적는다.",
  "  - A/B가 decisive면 강한 신호(confidence 높게), inconclusive·표본 작음이면 약하게(confidence 낮게).",
  "  - 한 영상만으로 단정하기 어려우면 confidence를 낮추거나 insights를 비워도 된다(과적합 금지).",
  "  - 김짠부는 '선택'만 한다 — insight는 강요가 아니라 '다음에 이렇게 해보면 어떨까'의 제안이다.",
].join("\n");
