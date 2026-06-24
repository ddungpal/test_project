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
  critic: { roleId: "critic", name: "반론", defaultModel: "opus", tools: ["web", "fetch"] },
  scribe: { roleId: "scribe", name: "짠펜", defaultModel: "opus", tools: [] }, // web/fetch 없음(§10). 골든 A/B(2026-06-23): Opus 4.8 > GPT-5.5 → 말투 품질 우선 opus.
  // 학습 작업(파이프라인 단계 아님) — corpus 위에서 1회 도는 말투 추출(§12). 짠펜이 의존하는 자산 생성.
  tone_extractor: { roleId: "tone_extractor", name: "말투추출", defaultModel: "opus", tools: [] }, // 기반·저빈도 → 품질 우선 opus
  style_extractor: { roleId: "style_extractor", name: "스타일추출", defaultModel: "opus", tools: [] }, // 기반·저빈도 → 품질 우선 opus. 파이프라인 단계 아님.
  // 학습 루프 회고(Phase 4) — 발행 후 성과+선택+반응을 인과로 복기→인사이트 draft. 편당 1회·저빈도·고가치 → opus.
  retrospectivist: { roleId: "retrospectivist", name: "회고", defaultModel: "opus", tools: [] },
} as const satisfies Record<string, AgentRole>;

export type RoleId = keyof typeof ROLES;

export function resolveModel(roleId: string): ModelTier {
  const role = (ROLES as Record<string, AgentRole>)[roleId];
  return role?.defaultModel ?? "sonnet";
}

export function roleTools(roleId: string): readonly string[] {
  return (ROLES as Record<string, AgentRole>)[roleId]?.tools ?? [];
}
