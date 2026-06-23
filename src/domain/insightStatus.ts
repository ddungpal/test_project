// 인사이트 승인 워크플로우(Phase 4 슬라이스 3) — 상태 전이 가드 + 표시 라벨(순수·DB 무관).
//   회고가 만든 draft를 김짠부가 검토→승인(또는 폐기). 승인된 것만 차기 런에 환류(슬라이스 4).
//   insights.status enum(database.types): draft | reviewed | approved | deprecated.

import type { InsightCategory } from "../agents/retrospectivist/schema.js";

export const INSIGHT_STATUSES = ["draft", "reviewed", "approved", "deprecated"] as const;
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

// 허용 전이 — 김짠부의 '선택'. 되돌릴 수 있게(폐기→초안, 승인→검토) 양방향 일부 허용.
const TRANSITIONS: Record<InsightStatus, readonly InsightStatus[]> = {
  draft: ["reviewed", "approved", "deprecated"],
  reviewed: ["approved", "deprecated", "draft"],
  approved: ["deprecated", "reviewed"],
  deprecated: ["draft"],
};

export function canTransitionInsightStatus(from: InsightStatus, to: InsightStatus): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function nextInsightStatuses(from: InsightStatus): InsightStatus[] {
  return [...(TRANSITIONS[from] ?? [])];
}

export const INSIGHT_STATUS_LABEL: Record<InsightStatus, string> = {
  draft: "검토 대기",
  reviewed: "검토함",
  approved: "승인됨",
  deprecated: "폐기",
};

export const INSIGHT_CATEGORY_LABEL: Record<InsightCategory, string> = {
  topic: "주제",
  thumbnail: "썸네일",
  title: "제목",
  structure: "구성",
  tone: "말투",
  research: "리서치",
  cta: "CTA",
  analogy: "비유",
};
