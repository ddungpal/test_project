// 썸네일 '개별 슬롯' 재생성 Inngest 함수 — "run/thumbnail-slot.requested" → 무전이 in-place 1회.
//   thumbnailStage는 executeProposalStage(ProposalStageSpec)를 쓰지만, 슬롯 교체는 제안계약 모양이 아니라
//   withStageRuntime를 직접 써서 regenerateThumbnailSlot를 실행한다(deps 조립·비용가드는 동일 기반).
import { inngest } from "../client.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { regenerateThumbnailSlot } from "../../pipeline/thumbnailSlot.js";
import { captureStageFailure } from "../onFailure.js";

export const thumbnailSlotStageFn = inngest.createFunction(
  { id: "thumbnail-slot-stage", name: "썸네일메이커 — 슬롯 1개 재생성", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("thumbnail") },
  { event: "run/thumbnail-slot.requested" },
  async ({ event, step }) =>
    step.run("thumbnail-slot-regenerate", () =>
      withStageRuntime(event.data.runId, (deps) => regenerateThumbnailSlot(deps, event.data.runId, event.data.slotIdx, event.data.reason)),
    ),
);
