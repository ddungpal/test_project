// 구다리 단계 Inngest 함수 — "run/structure.requested" → step.run 1회 durable.
import { inngest } from "../client.js";
import { executeProposalStage } from "./_shared.js";
import { captureStageFailure } from "../onFailure.js";
import { structureStageSpec } from "../../agents/structurer/stage.js";

export const structureStageFn = inngest.createFunction(
  { id: "structure-stage", name: "구다리 — 구성 제안", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("structure") },
  { event: "run/structure.requested" },
  async ({ event, step }) => step.run("structure-propose", () => executeProposalStage(structureStageSpec(event.data.runId), { softAck: event.data.softAck })),
);
