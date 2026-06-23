// 훅이 단계 Inngest 함수 — "run/titles.requested" → step.run 1회 durable.
import { inngest } from "../client.js";
import { executeProposalStage } from "./_shared.js";
import { captureStageFailure } from "../onFailure.js";
import { hookStageSpec } from "../../agents/hook_maker/stage.js";

export const hookStageFn = inngest.createFunction(
  { id: "titles-stage", name: "훅이 — 제목·썸네일 제안", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("title_thumb") },
  { event: "run/titles.requested" },
  async ({ event, step }) => step.run("titles-propose", () => executeProposalStage(hookStageSpec(event.data.runId), { softAck: event.data.softAck })),
);
