import type { RunState } from "../../domain/enums.js";

// §F staleness 판정(순수) — 구성 확정 후 편집이 이후 단계(리서치·스크립트)를 낡게 만드는지.
//   PostConfirmStructureEdit이 이 판정만 경고 배너에 쓴다(차단 없음). 컴포넌트와 분리해 vitest(alias 미설정)에서
//   .js 상대경로로 단위 테스트 가능하게 둔다.

// structure_selected 이후(다운스트림 시작) 상태 집합 — structure_selected 자신은 제외(아직 시작 전).
const STRUCTURE_DOWNSTREAM_STATES: readonly RunState[] = [
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
];

export function isStructureDownstreamStarted(state: RunState): boolean {
  return STRUCTURE_DOWNSTREAM_STATES.includes(state);
}
