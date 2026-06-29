// 셜록 셀 Inngest 함수 — "run/research.requested" → step.run으로 durable 1회.
//   ★ 상태 분기: structure_selected → scope 제안(runResearchScope, fan-out 없음·게이트용),
//     그 외(researching 재개 등) → 기존 리서치 셀(runResearchCell, scope→병렬→리콘실→반론).
//   scope/cell 두 경로는 공존한다 — scope가 사용자 선택을 받기 위한 후보를 내고, 선택 후 셀이 검증을 돈다.
import { inngest } from "../client.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { runResearchCell } from "../../pipeline/researchCell.js";
import { runResearchScope } from "../../pipeline/researchScope.js";
import { getRun } from "../../pipeline/runState.js";
import { captureStageFailure } from "../onFailure.js";

export const researchStageFn = inngest.createFunction(
  { id: "research-stage", name: "셜록 — 리서치 셀(fan-out/join)", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("research") },
  { event: "run/research.requested" },
  async ({ event, step }) =>
    step.run("research-cell", async () => {
      const guarded = await withStageRuntime(
        event.data.runId,
        async (deps) => {
          // structure_selected면 scope 제안(게이트)만 — fan-out 검증은 사용자 선택 후. 그 외는 기존 셀.
          const run = await getRun(deps.supa, event.data.runId);
          if (run.state === "structure_selected") return runResearchScope(event.data.runId, deps);
          // fromStep='examples'면 셈이·유이만 재생성(②③⑦ 스킵·research_facts 보존). 없으면 'full'(현행).
          return runResearchCell(event.data.runId, deps, { fromStep: event.data.fromStep ?? "full" });
        },
        { softAck: event.data.softAck },
      );
      if (guarded.status !== "ok") return { runId: event.data.runId, status: guarded.status };
      const res = guarded.value;
      // 두 결과 형태(research_scoped | research_ready) 모두 수용 — 없는 필드는 옵셔널로 비운다.
      return {
        runId: res.runId,
        status: "ok" as const,
        state: res.state,
        ...("factCount" in res ? { facts: res.factCount, assets: res.assetCount, escalated: res.escalatedCount } : {}),
        ...("candidateCount" in res ? { candidates: res.candidateCount } : {}),
        skipped: res.skipped,
      };
    }),
);
