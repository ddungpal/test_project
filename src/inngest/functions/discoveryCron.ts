// 매일 발굴 Cron(B) — durable 스케줄 실행. topic_candidates 신선도 유지(외부 트렌드·경쟁·댓글).
//   트리거 2개: ① cron(매일 06:00 KST) ② "discovery/refresh.requested"(수동 — 개발 검증·UI 버튼).
//   멱등(upsert) → retries 안전. LLM 0회 → ~$0(운영은 검색 API만, 개발은 fixtures $0).
import { inngest } from "../client.js";
import { refreshTopicCandidates } from "../../agents/topic_scout/discovery.js";
import { createAdminClient } from "../../lib/supabase/admin.js";

export const discoveryCronFn = inngest.createFunction(
  {
    id: "daily-discovery",
    name: "매일 발굴 — topic_candidates 신선도",
    retries: 1,
    // 동시 실행 1로 직렬화(cron + 수동이 겹쳐도 중복 upsert 경합 방지).
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: Error }) => {
      const { captureError } = await import("../../lib/observability/captureError.js");
      await captureError("inngest", error, { stage: "daily-discovery" });
    },
  },
  [{ cron: "TZ=Asia/Seoul 0 6 * * *" }, { event: "discovery/refresh.requested" }],
  async ({ step }) =>
    step.run("refresh-candidates", () => refreshTopicCandidates(createAdminClient())),
);
