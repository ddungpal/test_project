// 회고 자동 트리거(운영 자동화 ①) — 성과가 적재됐는데 회고가 없는 콘텐츠를 sweep해 회고 실행.
//   트리거 3개: ① cron(매일 07:00 KST, 누락 보정) ② "performance/collected"(성과 수집 직후) ③ "retro/sweep.requested"(수동).
//   ★ 멱등(회고 생기면 다음 sweep 제외) → retries·중복 이벤트 안전. 개발=claude-p $0, 운영=콘텐츠당 1회 LLM(limit 상한).
import { inngest } from "../client.js";
import { retrospectiveSweep } from "../../agents/retrospectivist/runRetrospective.js";
import { createAdminClient } from "../../lib/supabase/admin.js";

export const retrospectiveCronFn = inngest.createFunction(
  {
    id: "retrospective-sweep",
    name: "회고 자동 — 성과 적재분 복기",
    retries: 1,
    // 동시 실행 1 — sweep이 겹치면 같은 콘텐츠를 이중 회고할 수 있어 직렬화.
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: Error }) => {
      const { captureError } = await import("../../lib/observability/captureError.js");
      await captureError("inngest", error, { stage: "retrospective-sweep" });
    },
  },
  [{ cron: "TZ=Asia/Seoul 0 7 * * *" }, { event: "performance/collected" }, { event: "retro/sweep.requested" }],
  // 1회 트리거당 회고 콘텐츠 상한(운영 LLM 비용 가드) — env로 조정. 백로그는 다음 트리거가 멱등하게 이어 처리.
  async ({ step }) => step.run("sweep", () => retrospectiveSweep(createAdminClient(), { limit: Number(process.env.RETRO_SWEEP_LIMIT ?? 10) })),
);
