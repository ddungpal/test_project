// A/B 스타일 재학습 자동 트리거(운영 자동화 ②) — 새 A/B 표본이 마지막 학습 이후 늘면 재학습 draft 를 제안.
//   트리거 2개: ① "style/relearn.requested"(수동·필수) ② cron(주1회 월 08:00 KST, 누락 보정).
//   ★ retrospectiveCron 미러: concurrency 1·retries 1·onFailure captureError. 멱등(provenance 카운트) → 중복 이벤트 안전.
//   ★ draft 까지만 — activate 는 사람게이트(styleRelearnSweep 내부에서 보장). 개발=claude-p $0, 운영=적격 시 LLM 1회.
import { inngest } from "../client.js";
import { styleRelearnSweep } from "../../performance/styleRelearn.js";
import { createAdminClient } from "../../lib/supabase/admin.js";

export const styleRelearnCronFn = inngest.createFunction(
  {
    id: "style-relearn-sweep",
    name: "A/B 스타일 재학습 — 표본 증가분 재학습(draft)",
    retries: 1,
    // 동시 실행 1 — sweep 이 겹치면 같은 표본으로 중복 draft 를 만들 수 있어 직렬화.
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: Error }) => {
      const { captureError } = await import("../../lib/observability/captureError.js");
      await captureError("inngest", error, { stage: "style-relearn-sweep" });
    },
  },
  [{ event: "style/relearn.requested" }, { cron: "TZ=Asia/Seoul 0 8 * * 1" }],
  async ({ step }) => step.run("sweep", () => styleRelearnSweep(createAdminClient(), {})),
);
