// 촉이 단계 Inngest 함수 — durable 실행(§8.3). 이벤트 "run/topic.requested" → step.run 1회 멱등.
//   단계 전체를 단일 durable step으로 감싼다 → 크래시 시에만 재시도, 끝난 단계는 재호출 안 함.
import { inngest } from "../client.js";
import { executeProposalStage } from "./_shared.js";
import { captureStageFailure } from "../onFailure.js";
import { topicStageSpec } from "../../agents/topic_scout/stage.js";

export const topicStageFn = inngest.createFunction(
  // concurrency 1/run: 같은 run의 중복 이벤트 직렬화 → 멱등 스킵으로 이중 과금 차단(코드리뷰 P1).
  { id: "topic-stage", name: "촉이 — 주제 제안", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("topic") },
  { event: "run/topic.requested" },
  async ({ event, step }) =>
    step.run("topic-propose", () =>
      executeProposalStage(topicStageSpec(event.data.runId, { levelSplit: !!event.data.levelSplit, ...(event.data.targetPersona ? { targetPersona: event.data.targetPersona } : {}) }), { softAck: event.data.softAck, force: event.data.force, reason: event.data.reason }),
    ),
);
