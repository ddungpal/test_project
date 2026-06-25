// 썸네일메이커 단계 Inngest 함수 — "run/thumbnails.requested" → step.run 1회 durable.
import { inngest } from "../client.js";
import { executeProposalStage } from "./_shared.js";
import { captureStageFailure } from "../onFailure.js";
import { thumbnailStageSpec } from "../../agents/thumbnail_maker/stage.js";

export const thumbnailStageFn = inngest.createFunction(
  { id: "thumbnail-stage", name: "썸네일메이커 — 썸네일 제안", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("thumbnail") },
  { event: "run/thumbnails.requested" },
  async ({ event, step }) => step.run("thumbnail-propose", () => executeProposalStage(thumbnailStageSpec(event.data.runId), { softAck: event.data.softAck, force: event.data.force, reason: event.data.reason })),
);
