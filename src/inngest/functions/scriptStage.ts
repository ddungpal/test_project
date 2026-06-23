// 짠펜 단계 Inngest 함수 — "run/script.requested" → step.run으로 스크립트 단계 1회 durable.
//   공통 런타임(withStageRuntime) 위에서 runScriptStage 한 줄. deps·비용가드는 런타임이 담당.
import { inngest } from "../client.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { runScriptStage } from "../../pipeline/scriptCell.js";
import { captureStageFailure } from "../onFailure.js";

export const scriptStageFn = inngest.createFunction(
  { id: "script-stage", name: "짠펜 — 대본 작성", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("script") },
  { event: "run/script.requested" },
  async ({ event, step }) =>
    step.run("script-write", async () => {
      const guarded = await withStageRuntime(event.data.runId, (deps) => runScriptStage(event.data.runId, deps), { softAck: event.data.softAck });
      if (guarded.status !== "ok") return { runId: event.data.runId, status: guarded.status };
      const res = guarded.value;
      return { runId: res.runId, status: "ok" as const, state: res.state, segments: res.segmentCount, plagiarismMax: res.plagiarismMax, rework: res.reworkNeeded, skipped: res.skipped };
    }),
);
