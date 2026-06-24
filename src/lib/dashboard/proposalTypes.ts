import type { Stage } from "../../domain/enums.js";

// 제안 후보 payload 타입 — 각 단계 stage.ts의 toCandidates와 1:1(서버·클라 공용·순수).
//   topic: { title, audience_level?, audience_need? } · title_thumb: { title, thumbnail_layout, thumbnail_copy } · structure: { approach, outline[] }

// 시청자 수준(학습 사다리) — 같은 키워드도 수준별로 다른 영상이 된다. 촉이가 후보마다 라벨/분해.
export const AUDIENCE_LEVELS = ["beginner", "novice", "intermediate", "advanced"] as const;
export type AudienceLevel = (typeof AUDIENCE_LEVELS)[number];
export const AUDIENCE_LEVEL_LABEL: Record<AudienceLevel, string> = {
  beginner: "입문",
  novice: "초급",
  intermediate: "중급",
  advanced: "고급",
};

export interface TopicPayload {
  title: string;
  audience_level?: AudienceLevel; // 이 주제의 주 타깃 시청자 수준
  audience_need?: string; // 그 수준 시청자의 핵심 욕구(한 줄)
}
export interface TitlePayload {
  title: string;
  thumbnail_layout: string;
  thumbnail_main?: string[]; // 메인문구 2개(신규 구조)
  thumbnail_boxes?: string[]; // 작은 박스 2개(신규 구조)
  thumbnail_copy?: string; // 파생/레거시(메인+박스 join 또는 과거 단일 문자열) — 옵셔널
  ref_similarity?: number; // 제목이 레퍼런스를 베낀 정도(0~1)
  style_conformance?: { banned_hits: string[]; winning_score: number }; // A/B 학습 스타일 부합도(banned 위반·winning 점수) — 휴리스틱
}
// 썸네일 단계(신규) 산출물 — 정확히 3개(A/B/C 변형)를 확정하는 단계. 제목 단계와 분리.
export interface ThumbnailPayload {
  thumbnail_main: string[]; // 메인문구
  thumbnail_boxes: string[]; // 작은 박스
  thumbnail_layout?: string; // 레이아웃 힌트
}
export interface StructureSection {
  section: string;
  goal: string;
  why: string;
}
export interface StructurePayload {
  approach: string;
  outline: StructureSection[];
}

/** stage_proposals.candidates 한 항목(stageContract.Candidate와 동형, 뷰용). */
export interface CandidateView {
  idx: number;
  payload: unknown;
  reason: string;
  evidence_ids: string[];
}

/** 제안 생성에 쓴 검색 출처(웹·YouTube) — 토글로 노출해 원문 확인(출처명시). migration 16. */
export interface ProposalSource {
  id: string; // "web:0" | "yt:1" — 후보 evidence_ids와 매칭
  source: "web" | "youtube";
  title: string;
  url: string;
  publisher: string | null;
  viewCount?: number | null; // YouTube 영상 조회수
  subscriberCount?: number | null; // YouTube 채널 구독자수
}

/** 제안→선택을 노출하는 단계(연구·스크립트는 별도 셀/검수 UI). */
export const PROPOSAL_STAGES = ["topic", "title_thumb", "thumbnail", "structure"] as const;
export type ProposalStage = (typeof PROPOSAL_STAGES)[number];

export function isProposalStage(s: Stage): s is ProposalStage {
  return (PROPOSAL_STAGES as readonly string[]).includes(s);
}

export const STAGE_TITLE: Record<ProposalStage, string> = {
  topic: "주제",
  title_thumb: "제목 · 썸네일", // 역사적 라벨 — title_thumb는 현재 제목 전용이나 레거시 표기 유지
  thumbnail: "썸네일",
  structure: "구성",
};
