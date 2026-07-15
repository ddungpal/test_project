// 도메인 enum 단일 출처 — tech.md §5(판정 루브릭)·§8(상태머신).
// Phase 1 DB CHECK 제약과 1:1 동기화(§17: state·verified 게이트 DB 강제).
// 코드와 DB가 같은 값 집합을 쓰도록 여기서 export → 마이그레이션 생성 시 참조.

export const RUN_STATES = [
  "created",
  "topic_proposed",
  "topic_selected",
  "titles_proposed",
  "titles_selected",
  "thumbnails_proposed",
  "thumbnails_selected",
  "structure_proposed",
  "structure_selected",
  "research_scoped",
  "researching",
  "research_ready",
  "research_review",
  "research_approved",
  "scripting",
  "script_ready",
  "script_review",
  "approved",
  "published",
  // §17: 비용/중단 상태 누락 보완
  "paused_soft_cap",
  "aborted",
] as const;
export type RunState = (typeof RUN_STATES)[number];

/** 허용 전이표(§8 + paused/aborted). 전이 가드의 단일 출처. */
export const ALLOWED_TRANSITIONS: Record<RunState, readonly RunState[]> = {
  created: ["topic_proposed", "aborted"],
  topic_proposed: ["topic_selected", "aborted"],
  topic_selected: ["titles_proposed", "aborted"],
  titles_proposed: ["titles_selected", "aborted"],
  titles_selected: ["thumbnails_proposed", "aborted"], // 제목 확정 → 썸네일 단계로(기존 structure_proposed에서 변경)
  thumbnails_proposed: ["thumbnails_selected", "aborted"],
  thumbnails_selected: ["structure_proposed", "aborted"],
  structure_proposed: ["structure_selected", "aborted"],
  structure_selected: ["research_scoped", "aborted"], // 리서치 직행 차단 → scope 게이트 경유
  research_scoped: ["researching", "aborted"], // 셜록 scope 후 사용자 선택 → 리서치 시작
  researching: ["research_ready", "paused_soft_cap", "aborted"],
  // 리서치 내부 되돌림(re-entry, migration 28): research_scoped(scope 재선택)·researching(예시만 재생성)로 복귀.
  research_ready: ["research_review", "research_scoped", "researching", "aborted"],
  research_review: ["research_approved", "research_scoped", "researching", "aborted"], // rework 재진입 + scope 재선택
  research_approved: ["scripting", "aborted"],
  scripting: ["script_ready", "researching", "paused_soft_cap", "aborted"], // freshness rework
  script_ready: ["script_review", "aborted"],
  script_review: ["approved", "scripting", "aborted"],
  approved: ["published", "scripting", "aborted"], // scripting: 승인된 런의 대본 재생성 재오픈(마이그 20260705120035)
  published: [],
  paused_soft_cap: ["researching", "scripting", "aborted"], // 사람 승인 후 재개
  aborted: [],
};

export function canTransition(from: RunState, to: RunState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// 쏙이 온보딩 섹션 노출 창: thumbnails_selected(구성 직전) ~ published(파이프라인 끝) 전 구간.
// thumbnails_selected = live(금맥 주입), 그 이후 = review(복습/뒤늦은 재생성). 카피 분기는 UI(step 1).
// 구간을 상태 이름 나열로 하드코딩하지 않고 RUN_STATES 인덱스로 판정 → 배열이 단일 출처.
// paused_soft_cap·aborted는 배열 끝(published 뒤)이라 상단 경계 밖 → 자연히 false.
// 알 수 없는 문자열은 indexOf=-1로 하단 경계 밖 → 안전하게 false.
export function isOnboardingVisible(state: RunState): boolean {
  const lower = RUN_STATES.indexOf("thumbnails_selected");
  const upper = RUN_STATES.indexOf("published");
  const idx = RUN_STATES.indexOf(state);
  return idx >= lower && idx <= upper;
}

// title_thumb = 역사적 이름, 현재 '제목 전용'(rename 금지 — 17파일·픽스처·eval 광역 파손). thumbnail은 신규 추가.
export const STAGES = ["topic", "title_thumb", "thumbnail", "structure", "research", "script"] as const;
export type Stage = (typeof STAGES)[number];

export const VERIFICATION_STATUS = ["verified", "conflicting", "unverified", "could_not_verify"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

export const SOURCE_TIER = ["primary", "press", "secondary", "blog", "unknown"] as const;
export type SourceTier = (typeof SOURCE_TIER)[number];

export const VOLATILITY = ["static", "slow", "fast"] as const;
export type Volatility = (typeof VOLATILITY)[number];

export const FRESHNESS = ["fresh", "aging", "stale", "unknown"] as const;
export type Freshness = (typeof FRESHNESS)[number];

export const CONTENT_FORMAT = ["info", "vlog", "hybrid"] as const;
export type ContentFormat = (typeof CONTENT_FORMAT)[number];

export const AB_DECISIVENESS = ["decisive", "marginal", "inconclusive"] as const;
export type AbDecisiveness = (typeof AB_DECISIVENESS)[number];

/**
 * verified 합격 정의(§5) — DB CHECK와 동일 규칙을 코드에서도 재사용(§17 P1).
 * is_financial이면 source_tier='primary' 강제.
 */
export function isVerifiedValid(f: {
  verificationStatus: VerificationStatus;
  independentOriginCount: number;
  citationVerified: boolean;
  isFinancial: boolean;
  sourceTier: SourceTier | null;
  quoteExcerpt: string | null;
}): boolean {
  if (f.verificationStatus !== "verified") return true; // verified가 아니면 이 게이트 무관
  if (f.independentOriginCount < 2) return false;
  if (!f.citationVerified) return false;
  if (!f.quoteExcerpt) return false;
  if (f.isFinancial && f.sourceTier !== "primary") return false;
  return true;
}
