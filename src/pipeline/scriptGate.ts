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
