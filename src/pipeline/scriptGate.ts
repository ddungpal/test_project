// 스크립트 사람 게이트(§8.1) — script_ready → script_review → approved | scripting(rework).
//   AI 0회. 승인 = 상태 전환만. 수정요청(rework) = scripting 재진입.
import { getRun, transitionRun, type Supa } from "./runState.js";
import { bumpRework, abortRun, MAX_REWORK } from "./runGuards.js";

export async function enterScriptReview(supa: Supa, runId: string): Promise<void> {
  const run = await getRun(supa, runId);
  if (run.state === "script_review") return; // 멱등
  await transitionRun(supa, runId, "script_ready", "script_review");
}

/** 최종 승인 → approved(이후 published는 업로드 후 별도). */
export async function approveScript(supa: Supa, runId: string): Promise<{ state: "approved" }> {
  const run = await getRun(supa, runId);
  if (run.state !== "script_review") throw new Error(`승인은 'script_review'에서만(현재 '${run.state}').`);
  await transitionRun(supa, runId, "script_review", "approved");
  return { state: "approved" };
}

/** 수정요청 → scripting 재진입(짠펜 재생성). max_rework 초과 시 중단(반장 마감). */
export async function requestScriptRework(supa: Supa, runId: string): Promise<{ state: "scripting" | "aborted" }> {
  const run = await getRun(supa, runId);
  if (run.state !== "script_review") throw new Error(`rework는 'script_review'에서만(현재 '${run.state}').`);
  const rw = await bumpRework(supa, runId);
  if (rw.exceeded) {
    await abortRun(supa, runId, `max_rework(${MAX_REWORK}) 초과 — 대본 수정 반복`);
    return { state: "aborted" };
  }
  await transitionRun(supa, runId, "script_review", "scripting");
  return { state: "scripting" };
}

/**
 * 승인된 런을 대본 재생성용으로 재오픈 — approved → scripting.
 *   ★ 오너의 의도적 재생성이므로 bumpRework(자동 rework 루프 가드)는 걸지 않는다
 *     — max_rework 소진으로 오너 액션이 막히면 안 된다. freshness 재-rework 내부 가드는 runScriptStage가 자체 처리.
 */
export async function reopenApprovedForScript(supa: Supa, runId: string): Promise<{ state: "scripting" }> {
  const run = await getRun(supa, runId);
  if (run.state !== "approved") throw new Error(`대본 재생성 재오픈은 'approved'에서만(현재 '${run.state}').`);
  await transitionRun(supa, runId, "approved", "scripting");
  return { state: "scripting" };
}

/**
 * 단일 최종 검수(autoflow §D) — 완성 스크립트 검수 중 '보류(pending)' fact에 사람 최종확인을 박는다.
 *   거버넌스 불변식: 보류 fact의 human_approved=true 확정은 오직 이 사람 액션에서만(자동/암묵 승인 금지).
 *
 *   1) 이 run의 보류 fact = escalated_to_human=true && human_approved is null
 *      (= isFactPending 술어와 동일 — 여기선 DB 쿼리 필터라 컬럼조건으로 쓴다).
 *      · rejectFactIds에 든 것 → human_approved=false(짠펜이 사용 못 함).
 *      · 나머지 보류 fact → human_approved=true(사람 최종확인).
 *   2) 분기: reject 비었으면 approveScript(→approved), 있으면 requestScriptRework(→scripting, 전체 재작성 재사용).
 *      부적격(false) fact는 짠펜 isFactUsableForScript가 자동 제외 — 새 부분재생성 경로를 만들지 않는다.
 *   ★ 모든 update는 .eq("run_id", runId) 스코프(타 run 오염 금지 — approveResearch 패턴 미러).
 */
export async function reviewScript(supa: Supa, runId: string, rejectFactIds: string[]): Promise<{ state: string }> {
  // 보류 목록을 DB에서 컬럼조건으로 조회(escalated && human_approved is null = isFactPending과 동일 의미).
  const { data: pending, error: pe } = await supa
    .from("research_facts")
    .select("id")
    .eq("run_id", runId)
    .eq("escalated_to_human", true)
    .is("human_approved", null);
  if (pe) throw new Error(`보류 fact 조회 실패: ${pe.message}`);

  const pendingIds = (pending ?? []).map((f) => f.id);
  const rejectSet = new Set(rejectFactIds);
  // reject는 '보류 목록'에 실제 든 것만 유효(타 run·비보류 id가 섞여도 무시 — 스코프 안전).
  const rejectIds = pendingIds.filter((id) => rejectSet.has(id));
  const approveIds = pendingIds.filter((id) => !rejectSet.has(id));

  if (rejectIds.length) {
    const { error } = await supa.from("research_facts").update({ human_approved: false }).eq("run_id", runId).in("id", rejectIds);
    if (error) throw new Error(`fact 반려 갱신 실패: ${error.message}`);
  }
  if (approveIds.length) {
    const { error } = await supa.from("research_facts").update({ human_approved: true }).eq("run_id", runId).in("id", approveIds);
    if (error) throw new Error(`human_approved 갱신 실패: ${error.message}`);
  }

  // reject가 있으면 전체 재작성(rework), 없으면 승인. 부적격 fact 제외는 짠펜이 isFactUsableForScript로 자동 처리.
  if (rejectIds.length) {
    return requestScriptRework(supa, runId);
  }
  return approveScript(supa, runId);
}
