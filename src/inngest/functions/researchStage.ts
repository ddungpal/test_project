// 셜록 셀 Inngest 함수 — "run/research.requested" → step.run으로 fan-out/join 셀 1회 durable.
//   공통 런타임(withStageRuntime) 위에서 runResearchCell(scope→병렬→리콘실→반론) 한 줄. 검색 백엔드는 env.
import { inngest } from "../client.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { runResearchCell } from "../../pipeline/researchCell.js";
import { captureStageFailure } from "../onFailure.js";

export const researchStageFn = inngest.createFunction(
  { id: "research-stage", name: "셜록 — 리서치 셀(fan-out/join)", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("research") },
  { event: "run/research.requested" },
  async ({ event, step }) =>
    step.run("research-cell", async () => {
      const guarded = await withStageRuntime(event.data.runId, (deps) => runResearchCell(event.data.runId, deps), { softAck: event.data.softAck });
      if (guarded.status !== "ok") return { runId: event.data.runId, status: guarded.status };
      const res = guarded.value;
      return { runId: res.runId, status: "ok" as const, state: res.state, facts: res.factCount, assets: res.assetCount, escalated: res.escalatedCount, skipped: res.skipped };
    }),
);
