// 쏙이 온보딩 Inngest 함수 — "run/onboarding.requested" → step.run으로 durable 1회.
//   온디맨드(강제 게이트 아님·선형 상태체인 밖) — 구다리는 여전히 thumbnails_selected에서 독립 진입.
//   researchStage.ts 패턴 미러: withStageRuntime로 deps 조립 + 비용가드. 멱등은 runOnboarding 내부(기존 아크면 $0 반환).
//   captureStageFailure는 stage:string을 받으므로 "onboarding" 그대로 넘긴다(Stage 캐스팅 불필요).
import { inngest } from "../client.js";
import { createAdminClient } from "../../lib/supabase/admin.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { runOnboarding, appendOnboardingQuestions, saveOnboardingFailure } from "../../pipeline/onboarding.js";
import { OnboardingRetryableError } from "../../agents/onboarder/prepare.js";
import { captureStageFailure } from "../onFailure.js";
import type { OnboardingArc } from "../../agents/onboarder/schema.js";

// 두 경로(생성/추가)의 공통 반환 형태 — skipped는 more 경로에 없어 optional.
type OnboardingResult = { runId: string; arc: OnboardingArc; skipped?: boolean; appended?: number };

export const onboardingStageFn = inngest.createFunction(
  { id: "onboarding-stage", name: "쏙이 — 궁금증 아크", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("onboarding") },
  { event: "run/onboarding.requested" },
  async ({ event, step }) => {
    const runId = event.data.runId;
    const more = event.data.more;
    return step.run("onboarding-arc", async () => {
      // more가 있으면 난이도 타겟 추가 문항을 기존 아크에 append(재검색 없음), 없으면 기존 아크 생성.
      // create 경로의 quota 실패(OnboardingRetryableError)는 재시도해도 같은 날 안 풀리니, retries 소진 없이
      //   즉시 실패 마커를 저장하고 정상 반환한다 — 클라가 아크 리더와 같은 경로로 "잠시 후 다시" 안내를 본다(step2).
      //   다른 예외·영구 "온보딩 불가"는 아래에서 잡지 않아 기존 경로(throw → captureStageFailure → errors.jsonl)로 흐른다.
      //   more(append) 경로는 재검색이 없어 quota가 안 나므로 이 처리를 타지 않는다.
      let guarded: Awaited<ReturnType<typeof withStageRuntime<OnboardingResult>>>;
      try {
        guarded = await withStageRuntime<OnboardingResult>(
          runId,
          (deps) =>
            more
              ? appendOnboardingQuestions(runId, deps, more.difficulty)
              : runOnboarding(runId, deps, { force: event.data.force ?? false }),
          { softAck: event.data.softAck },
        );
      } catch (err) {
        if (err instanceof OnboardingRetryableError) {
          await saveOnboardingFailure(createAdminClient(), runId, err.message);
          return { runId, status: "retryable" as const };
        }
        throw err;
      }
      if (guarded.status !== "ok") return { runId, status: guarded.status };
      const res = guarded.value;
      // res.skipped는 more 경로엔 없음(undefined·무해).
      return { runId: res.runId, status: "ok" as const, questions: res.arc.questions.length, skipped: res.skipped };
    });
  },
);
