// 리서치 트리아지 게이트(§11) — 위험기반 사람 검수. 김짠부는 '선택자', 고위험만 '검수자'.
//   research_ready → research_review(검수 진입) → research_approved(승인) | researching(rework 재진입).
//   에스컬레이션된 fact(금융·미검증·충돌·stale)만 사람이 본다. 나머지 verified·비금융은 자동 통과.

import { transitionRun, getRun, type Supa } from "./runState.js";

/** 검수 진입 — 에스컬레이션 목록을 띄우기 위한 상태 전환(AI 0회). */
export async function enterResearchReview(supa: Supa, runId: string): Promise<void> {
  const run = await getRun(supa, runId);
  if (run.state === "research_review") return; // 멱등
  await transitionRun(supa, runId, "research_ready", "research_review");
}

/** 에스컬레이션된 fact 목록(사람이 검수할 대상). */
export async function listEscalatedFacts(supa: Supa, runId: string) {
  const { data, error } = await supa
    .from("research_facts")
    .select("id, claim, verification_status, source_tier, is_financial, freshness, primary_source_url, quote_excerpt")
    .eq("run_id", runId)
    .eq("escalated_to_human", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`escalated facts 조회 실패: ${error.message}`);
  return data ?? [];
}

export interface ResearchApproval {
  approveFactIds?: string[]; // 사람이 승인한 fact(미지정 시 에스컬레이션 전체 승인)
  rejectFactIds?: string[]; // 반려(human_approved=false) — 짠펜이 사용 못 함
}

/** 검수 승인 — research_review → research_approved. 승인 fact에 human_approved=true. */
export async function approveResearch(supa: Supa, runId: string, approval: ResearchApproval = {}): Promise<{ state: "research_approved"; approved: number }> {
  const run = await getRun(supa, runId);
  if (run.state !== "research_review") throw new Error(`승인은 'research_review'에서만(현재 '${run.state}').`);

  // 코드리뷰 P1: 모든 fact 갱신을 runId로 스코프(다른 run의 fact 승인/반려 차단).
  if (approval.rejectFactIds?.length) {
    await supa.from("research_facts").update({ human_approved: false }).eq("run_id", runId).in("id", approval.rejectFactIds);
  }
  // 승인 대상: 명시 목록 or 에스컬레이션 전체.
  let approveIds = approval.approveFactIds;
  if (!approveIds) {
    const esc = await listEscalatedFacts(supa, runId);
    approveIds = esc.map((f) => f.id).filter((id) => !approval.rejectFactIds?.includes(id));
  }
  if (approveIds.length) {
    const { error } = await supa.from("research_facts").update({ human_approved: true }).eq("run_id", runId).in("id", approveIds);
    if (error) throw new Error(`human_approved 갱신 실패: ${error.message}`);
  }

  await transitionRun(supa, runId, "research_review", "research_approved");
  return { state: "research_approved", approved: approveIds.length };
}

/** 자동 검수 통과(autoflow·§B) — research_ready → research_review → research_approved 전이만.
 *  ★ 핵심 불변식: research_facts.human_approved를 절대 건드리지 않는다(null 유지 = '미검수·보류').
 *    approveResearch(human_approved=true 박음)를 호출하지 않는다 — 에스컬레이션 fact의 사람 최종확인은
 *    Phase 2 스크립트 최종검수로 미룬다(거버넌스 '사람 최종확인'을 가짜로 만들지 않음).
 *  ★ 멱등: 이미 research_approved면 no-op. research_ready면 review로, research_review면 approved로
 *    (각 전이 전 현재 state 확인) — durable replay/retry 안전. */
export async function autoPassResearchReview(supa: Supa, runId: string): Promise<{ state: "research_approved" }> {
  let run = await getRun(supa, runId);
  if (run.state === "research_approved") return { state: "research_approved" }; // 멱등

  if (run.state === "research_ready") {
    await transitionRun(supa, runId, "research_ready", "research_review");
    run = await getRun(supa, runId);
  }
  if (run.state === "research_review") {
    await transitionRun(supa, runId, "research_review", "research_approved");
    return { state: "research_approved" };
  }
  throw new Error(`자동 검수 통과는 'research_ready'/'research_review'에서만(현재 '${run.state}').`);
}
