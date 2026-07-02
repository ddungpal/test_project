// 쏙이 온보딩 Inngest 함수 — "run/onboarding.requested" → step.run으로 durable 1회.
//   온디맨드(강제 게이트 아님·선형 상태체인 밖) — 구다리는 여전히 thumbnails_selected에서 독립 진입.
//   researchStage.ts 패턴 미러: withStageRuntime로 deps 조립 + 비용가드. 멱등은 runOnboarding 내부(기존 아크면 $0 반환).
//   captureStageFailure는 stage:string을 받으므로 "onboarding" 그대로 넘긴다(Stage 캐스팅 불필요).
import { inngest } from "../client.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { runOnboarding, appendOnboardingQuestions } from "../../pipeline/onboarding.js";
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
      const guarded = await withStageRuntime<OnboardingResult>(
        runId,
        (deps) =>
          more
            ? appendOnboardingQuestions(runId, deps, more.difficulty)
            : runOnboarding(runId, deps, { force: event.data.force ?? false }),
        { softAck: event.data.softAck },
      );
      if (guarded.status !== "ok") return { runId, status: guarded.status };
      const res = guarded.value;
      // res.skipped는 more 경로엔 없음(undefined·무해).
      return { runId: res.runId, status: "ok" as const, questions: res.arc.questions.length, skipped: res.skipped };
    });
  },
);
