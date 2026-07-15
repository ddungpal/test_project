// 에이전트 stable role_id 레지스트리 — tech.md §7. 로그·라우팅·fixture 키의 안정 식별자.
// role_id는 절대 바꾸지 않는다(과거 fixture·lineage가 깨짐). 표시명만 변경 가능.

import type { ModelTier } from "../llm/types.js";

export interface AgentRole {
  roleId: string;
  name: string; // 한국어 표시명
  defaultModel: ModelTier;
  /** 인젝션 방어(§10): 이 역할이 쓸 수 있는 도구 화이트리스트. */
  tools: readonly ("web" | "fetch" | "code")[];
}

// ★ 모델 정책(2026-06-24): 전 역할 opus 통일 — 품질 우선. defaultModel="opus" 티어는 백엔드에서
//   '별칭'으로 해석돼 **항상 최신 Opus를 자동 추적**한다(claude-p: `--model opus` / api: MODEL_ID `claude-opus-4-8`,
//   둘 다 날짜 핀 없음). Anthropic이 Opus를 업그레이드하면 코드 변경 없이 새 버전이 적용된다.
//   (특정 역할만 더 싼 티어로 내리려면 그 역할의 defaultModel만 sonnet/haiku로 바꾸면 됨.)
export const ROLES = {
  topic_scout: { roleId: "topic_scout", name: "촉이", defaultModel: "opus", tools: ["web"] },
  hook_maker: { roleId: "hook_maker", name: "훅이", defaultModel: "opus", tools: [] },
  thumbnail_maker: { roleId: "thumbnail_maker", name: "썸네일메이커", defaultModel: "opus", tools: [] }, // 선택된 제목에 맞춘 썸네일 전용(훅이에서 분리). roleId 영구·변경 금지.
  structurer: { roleId: "structurer", name: "구다리", defaultModel: "opus", tools: [] },
  sherlock_lead: { roleId: "sherlock_lead", name: "셜록", defaultModel: "opus", tools: ["web", "fetch"] },
  fact_verifier: { roleId: "fact_verifier", name: "팩트검증가", defaultModel: "opus", tools: ["web", "fetch"] },
  numbers: { roleId: "numbers", name: "셈이", defaultModel: "opus", tools: ["code"] },
  analogist: { roleId: "analogist", name: "유이", defaultModel: "opus", tools: [] },
  // 비교가 — 검증된 사실만 entity×dimension×cell 비교로 구조화(§7·§10). web/fetch 없음: 새 사실 생성·인젝션 차단(검증 후 형제). roleId 영구.
  comparator: { roleId: "comparator", name: "비교가", defaultModel: "opus", tools: [] },
  // 분기가 — 검증된 사실 + 댓글 집계 신호(원문 비전송)로 '상황→결과' 케이스 분기 구조화(§7·§10·governance C). web/fetch/code 없음: 새 사실 생성·인젝션 차단(검증 후 형제), 댓글 원문 미수신. roleId 영구.
  case_miner: { roleId: "case_miner", name: "분기가", defaultModel: "opus", tools: [] },
  // 쏙이 — 구다리 전 '궁금증 아크'(듀얼훅·클리프행어 문항) 생성(§7). web/fetch/code 없음: 자체 웹검색 안 함, 입력(자막·영상사실)은 prepare가 공급·인젝션 차단(§10 도구경계). roleId 영구.
  onboarder: { roleId: "onboarder", name: "쏙이", defaultModel: "opus", tools: [] },
  critic: { roleId: "critic", name: "반론", defaultModel: "opus", tools: ["web", "fetch"] },
  scribe: { roleId: "scribe", name: "짠펜", defaultModel: "opus", tools: [] }, // web/fetch 없음(§10). 골든 A/B(2026-06-23): Opus 4.8 > GPT-5.5 → 말투 품질 우선 opus.
  // 학습 작업(파이프라인 단계 아님) — corpus 위에서 1회 도는 말투 추출(§12). 짠펜이 의존하는 자산 생성.
  tone_extractor: { roleId: "tone_extractor", name: "말투추출", defaultModel: "opus", tools: [] }, // 기반·저빈도 → 품질 우선 opus
  style_extractor: { roleId: "style_extractor", name: "스타일추출", defaultModel: "opus", tools: [] }, // 기반·저빈도 → 품질 우선 opus. 파이프라인 단계 아님.
  analogy_extractor: { roleId: "analogy_extractor", name: "비유추출", defaultModel: "opus", tools: [] }, // 레퍼런스 릴스 트랜스크립트에서 비유 기법 1회 추출(유이 의존 자산). 파이프라인 단계 아님. roleId 영구.
  owner_feedback_extractor: { roleId: "owner_feedback_extractor", name: "오너피드백추출", defaultModel: "opus", tools: [] }, // 김짠부 직접 피드백을 최우선 규칙으로 1회 증류(훅이·썸네일 의존 자산). 파이프라인 단계 아님. roleId 영구.
  title_extractor: { roleId: "title_extractor", name: "제목스타일추출", defaultModel: "opus", tools: [] }, // 채널 raw 제목에서 제목 스타일 1회 추출(훅이 의존 자산). 파이프라인 단계 아님. roleId 영구.
  structure_extractor: { roleId: "structure_extractor", name: "구성추출", defaultModel: "opus", tools: [] }, // 코퍼스 구성/전개 패턴 1회 추출(구다리 의존 자산). 파이프라인 단계 아님. roleId 영구.
  // 학습 루프 회고(Phase 4) — 발행 후 성과+선택+반응을 인과로 복기→인사이트 draft. 편당 1회·저빈도·고가치 → opus.
  retrospectivist: { roleId: "retrospectivist", name: "회고", defaultModel: "opus", tools: [] },
  // 교정쌍 차이 분석(파이프라인 단계 아닌 표시·기록용 분석) — 생성↔이상 카피 비교 diff.
  //   전 역할 opus 통일이지만, 가벼운 1쌍 비교라 과하지 않게 기본 tier(sonnet). 학습 권위 아님(patterns 미사용).
  correction_diff: { roleId: "correction_diff", name: "교정차이분석", defaultModel: "sonnet", tools: [] },
} as const satisfies Record<string, AgentRole>;

export type RoleId = keyof typeof ROLES;

// Fable 테스트 토글 대상 역할 — 리서치 단계 전체 + 짠펜(대본). env PIPELINE_MODEL=claude-fable-5 일 때만 fable로.
//   (주제·제목·썸네일·구성·온보딩은 제외 — 사용자 선택 (나): 리서치+작성만.)
const FABLE_ROLES: ReadonlySet<string> = new Set([
  "sherlock_lead", // 셜록(리서치 리드)
  "fact_verifier", // 팩트검증가
  "numbers", // 셈이
  "analogist", // 유이(비유)
  "comparator", // 비교가
  "case_miner", // 분기가
  "critic", // 반론
  "scribe", // 짠펜(대본)
]);

export function resolveModel(roleId: string): ModelTier {
  const role = (ROLES as Record<string, AgentRole>)[roleId];
  const base = role?.defaultModel ?? "sonnet";
  // Fable 테스트 토글: env가 켜져 있고 대상 역할이면 fable로 오버라이드(끄면 base=opus 그대로 → A/B 쉬움).
  //   ★ 미설정/다른 값이면 완전 무영향(base 반환) → promptHash·fixture 보존.
  if (process.env.PIPELINE_MODEL === "claude-fable-5" && FABLE_ROLES.has(roleId)) return "fable";
  return base;
}

export function roleTools(roleId: string): readonly string[] {
  return (ROLES as Record<string, AgentRole>)[roleId]?.tools ?? [];
}
