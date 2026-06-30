// 짠펜 단계 Inngest 함수 — "run/script.requested" → step.run으로 스크립트 단계 1회 durable.
//   공통 런타임(withStageRuntime) 위에서 runScriptStage 한 줄. deps·비용가드는 런타임이 담당.
import { inngest } from "../client.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { runScriptStage } from "../../pipeline/scriptCell.js";
import { captureStageFailure } from "../onFailure.js";

export const scriptStageFn = inngest.createFunction(
  { id: "script-stage", name: "짠펜 — 대본 작성", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("script") },
  { event: "run/script.requested" },
  async ({ event, step }) => {
    const runId = event.data.runId;

    // s1) 기존 스크립트 작성 — 정상 완료면 script_ready, rework면 scripting, 캡/실패면 status!=="ok".
    const s1 = await step.run("script-write", async () => {
      const guarded = await withStageRuntime(runId, (deps) => runScriptStage(runId, deps), { softAck: event.data.softAck });
      if (guarded.status !== "ok") return { runId, status: guarded.status };
      const res = guarded.value;
      return { runId: res.runId, status: "ok" as const, state: res.state, segments: res.segmentCount, plagiarismMax: res.plagiarismMax, rework: res.reworkNeeded, skipped: res.skipped };
    });

    // s2) 정상 완료(script_ready)일 때만 검수 화면까지 자동 전진 = 단일 사람 접점(autoflow §B/§D).
    //   rework(scripting)·aborted·status!=="ok"(캡 일시정지/실패)면 절대 호출 안 함 — 검수할 대본이 없거나 재작성 중.
    //   별도 step.run으로 분리(durable) — script-write 메모 후 crash 재시도 시 enter만 다시 탄다. enterScriptReview는 멱등.
    if (s1.status === "ok" && s1.state === "script_ready") {
      await step.run("enter-script-review", async () => {
        const { createAdminClient } = await import("../../lib/supabase/admin.js");
        const { enterScriptReview } = await import("../../pipeline/scriptGate.js");
        await enterScriptReview(createAdminClient(), runId);
        return { state: "script_review" as const };
      });
      return { ...s1, state: "script_review" as const };
    }
    return s1;
  },
);
