// 짠펜 단일 세그먼트 재생성 Inngest 함수 — "run/segment.regen.requested" → 그 세그먼트 하나만 다시 씀(무전이).
//   scriptStage 미러: withStageRuntime(deps 조립·비용가드) 위에서 regenerateSegment 한 줄. concurrency runId.
import { inngest } from "../client.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { regenerateSegment } from "../../pipeline/segmentRegen.js";
import { captureStageFailure } from "../onFailure.js";

export const segmentRegenFn = inngest.createFunction(
  { id: "segment-regen", name: "짠펜 — 세그먼트 1개 재생성", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("script") },
  { event: "run/segment.regen.requested" },
  async ({ event, step }) => {
    const { runId, segmentId, reason, softAck } = event.data;
    return step.run("segment-regenerate", () =>
      withStageRuntime(runId, (deps) => regenerateSegment(runId, segmentId, reason ?? "", deps), { softAck }),
    );
  },
);
