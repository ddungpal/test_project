// 리서치 단계 내부 되돌림(re-entry, migration 28) — 사용자가 리서치 결과/검수에서 이전으로 복귀해 다시 돈다.
//   세 종류(kind): 'scope' = scope 재선택만(research_scoped 전이·셀/이벤트 없음),
//                  'reverify' = 다시 검증(researching → run/research.requested fromStep='full'),
//                  'examples' = 예시만 재생성(researching → run/research.requested fromStep='examples').
//   ★ 가드: research_ready | research_review 에서만 허용(아니면 throw). ★ rework_count 미증가(내부 재진입 — step0 정책).
//   액션(topicRun.ts)은 requireOwner + 이 헬퍼 + 조건부 inngest.send + auditLog 의 얇은 래퍼. 헬퍼만 fake supa로 테스트 가능.

import { getRun, transitionRun, type Supa } from "./runState.js";
import type { RunState } from "../domain/enums.js";

export type ReentryKind = "scope" | "reverify" | "examples";

/** 헬퍼 결과 — 액션이 이벤트 발행 여부와 fromStep을 알 수 있게 반환. scope는 이벤트 없음. */
export type ReentryResult =
  | { event: false }
  | { event: true; fromStep: "full" | "examples" };

const ALLOWED_FROM: readonly RunState[] = ["research_ready", "research_review"];

/**
 * 상태 가드 + 전이 수행. 이벤트는 발행하지 않는다(액션이 결과를 보고 조건부로 보낸다 — 테스트 가능성).
 *   - scope:    현재state → research_scoped (전이만).
 *   - reverify: 현재state → researching, 반환 fromStep='full'.
 *   - examples: 현재state → researching, 반환 fromStep='examples'.
 *   transitionRun patch는 비움 — rework_count 등 일절 갱신 안 함(내부 재진입 정책).
 */
export async function reenterResearch(supa: Supa, runId: string, kind: ReentryKind): Promise<ReentryResult> {
  const run = await getRun(supa, runId);
  if (!ALLOWED_FROM.includes(run.state)) {
    throw new Error(`리서치 결과/검수 상태에서만 가능합니다(현재: ${run.state}).`);
  }
  const from = run.state;

  if (kind === "scope") {
    await transitionRun(supa, runId, from, "research_scoped");
    return { event: false };
  }
  // reverify | examples — 둘 다 researching 으로 보낸 뒤 셀을 fromStep과 함께 깨운다.
  await transitionRun(supa, runId, from, "researching");
  return { event: true, fromStep: kind === "examples" ? "examples" : "full" };
}
