// Inngest 함수 레지스트리 — serve()에 넘길 전체 목록. 단계 팬아웃 시 여기에 추가.
import { topicStageFn } from "./topicStage.js";
import { hookStageFn } from "./hookStage.js";
import { thumbnailStageFn } from "./thumbnailStage.js";
import { thumbnailSlotStageFn } from "./thumbnailSlotStage.js";
import { structureStageFn } from "./structureStage.js";
import { researchStageFn } from "./researchStage.js";
import { scriptStageFn } from "./scriptStage.js";
import { segmentRegenFn } from "./segmentRegen.js";
import { onboardingStageFn } from "./onboardingStage.js";
import { discoveryCronFn } from "./discoveryCron.js";
import { retrospectiveCronFn } from "./retrospectiveCron.js";
import { performanceCronFn } from "./performanceCron.js";
import { styleRelearnCronFn } from "./styleRelearnCron.js";

export const functions = [topicStageFn, hookStageFn, thumbnailStageFn, thumbnailSlotStageFn, structureStageFn, researchStageFn, scriptStageFn, segmentRegenFn, onboardingStageFn, discoveryCronFn, retrospectiveCronFn, performanceCronFn, styleRelearnCronFn];
