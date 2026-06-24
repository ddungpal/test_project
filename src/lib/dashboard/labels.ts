import type { RunState, VerificationStatus, SourceTier, Freshness } from "../../domain/enums.js";

// 상태 → 한국어 라벨 + 표시 톤(TRUS 3색 내 강조). 서버·클라이언트 공용(순수).
//   세부 단계 라벨은 런 목록·상세 공통으로 쓴다. 게이트/AI 구분은 상세(3.2)에서 확장.

export const STATE_LABEL: Record<RunState, string> = {
  created: "생성됨",
  topic_proposed: "주제 제안됨",
  topic_selected: "주제 선택됨",
  titles_proposed: "제목·썸네일 제안됨",
  titles_selected: "제목·썸네일 선택됨",
  thumbnails_proposed: "썸네일 제안됨",
  thumbnails_selected: "썸네일 선택됨",
  structure_proposed: "구성 제안됨",
  structure_selected: "구성 선택됨",
  researching: "리서치 진행중",
  research_ready: "리서치 완료(검수 대기)",
  research_review: "리서치 검수중",
  research_approved: "리서치 승인됨",
  scripting: "스크립트 작성중",
  script_ready: "스크립트 완료(검수 대기)",
  script_review: "스크립트 검수중",
  approved: "대본 승인됨",
  published: "발행됨",
  paused_soft_cap: "비용 한도 일시정지",
  aborted: "중단됨",
};

export type RunTone = "done" | "paused" | "aborted" | "active";

/** 목록 뱃지 톤 — 종료/일시정지/중단/진행중. (게이트 vs AI 세부는 상세에서.) */
export function runTone(state: RunState): RunTone {
  if (state === "published" || state === "approved") return "done";
  if (state === "paused_soft_cap") return "paused";
  if (state === "aborted") return "aborted";
  return "active";
}

// 리서치 fact 뱃지 라벨(3.3).
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: "검증됨",
  conflicting: "충돌",
  unverified: "미검증",
  could_not_verify: "검증불가",
};

export const SOURCE_TIER_LABEL: Record<SourceTier, string> = {
  primary: "1차 출처",
  press: "언론",
  secondary: "2차",
  blog: "블로그",
  unknown: "출처미상",
};

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: "신선",
  aging: "노후화",
  stale: "오래됨",
  unknown: "신선도미상",
};

// 비용 카테고리 라벨(3.4).
export const COST_CATEGORY_LABEL: Record<string, string> = {
  llm: "LLM",
  search: "검색",
  embedding: "임베딩",
  storage: "저장",
  infra: "인프라",
  human_review: "사람검수",
};
