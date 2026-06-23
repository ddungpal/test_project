// 성과 수집 Cron(운영 자동화 ① Sub-B) — 발행 영상의 도래 윈도우 성과를 YouTube Analytics에서 수집·적재.
//   트리거 2개: ① cron(매일 06:30 KST, 회고 sweep 07:00 직전) ② "performance/collect.requested"(수동).
//   ★ 개발 기본(PERFORMANCE_SOURCE≠youtube)은 collect가 no-op($0·수동 입력 보존). 실수집은 youtube + OAuth.
//   ★ 수집되면 "performance/collected" 발행 → 회고 sweep을 깨워 루프를 잇는다.
import { inngest } from "../client.js";
import { collectPerformance } from "../../performance/collect.js";
import { createAdminClient } from "../../lib/supabase/admin.js";

export const performanceCronFn = inngest.createFunction(
  {
    id: "performance-collect",
    name: "성과 수집 — YouTube Analytics",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: Error }) => {
      const { captureError } = await import("../../lib/observability/captureError.js");
      await captureError("inngest", error, { stage: "performance-collect" });
    },
  },
  [{ cron: "TZ=Asia/Seoul 30 6 * * *" }, { event: "performance/collect.requested" }],
  async ({ step }) => {
    const r = await step.run("collect", () => collectPerformance(createAdminClient()));
    // 새로 수집된 게 있으면 회고 sweep을 깨운다(루프 연결). 없으면 이벤트 생략.
    if (r.collectedContentIds.length > 0) {
      await step.sendEvent("wake-retrospective", { name: "performance/collected", data: {} });
    }
    return r;
  },
);
