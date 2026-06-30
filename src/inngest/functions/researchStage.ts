// 셜록 셀 Inngest 함수 — "run/research.requested" → step.run으로 durable 1회.
//   ★ 상태 분기: structure_selected → scope 제안(runResearchScope, fan-out 없음·게이트용),
//     그 외(researching 재개 등) → 기존 리서치 셀(runResearchCell, scope→병렬→리콘실→반론).
//   scope/cell 두 경로는 공존한다 — scope가 사용자 선택을 받기 위한 후보를 내고, 선택 후 셀이 검증을 돈다.
import { inngest } from "../client.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { runResearchCell } from "../../pipeline/researchCell.js";
import { runResearchScope, autoAdvanceResearchScope } from "../../pipeline/researchScope.js";
import { autoPassResearchReview } from "../../pipeline/researchGate.js";
import { getRun } from "../../pipeline/runState.js";
import { captureStageFailure } from "../onFailure.js";

// 무중단 자동화(§A~C) — 단일 invocation 안에서 inline 연속(각 단계 별도 step.run으로 durable).
//   fresh-start(structure_selected→scope)면 s1이 research_scoped로 끝난다 → 그 신호로만 자동 흐름을 탄다.
//   재진입(reverify/examples)은 state=researching로 들어와 s1이 곧장 research_ready라 cameFromScope=false →
//   자동 흐름 안 탐(재진입은 사람이 research_ready로 돌아가길 기대 — 절대 자동발행 금지). 새 이벤트/함수 없음.
export const researchStageFn = inngest.createFunction(
  { id: "research-stage", name: "셜록 — 리서치 셀(fan-out/join)", retries: 2, concurrency: [{ key: "event.data.runId", limit: 1 }], onFailure: captureStageFailure("research") },
  { event: "run/research.requested" },
  async ({ event, step }) => {
    const runId = event.data.runId;

    // s1) 기존 cell — structure_selected면 scope 제안(research_scoped), 그 외는 검증 셀(research_ready).
    const s1 = await step.run("research-cell", async () => {
      const guarded = await withStageRuntime(
        runId,
        async (deps) => {
          // structure_selected면 scope 제안(게이트)만 — fan-out 검증은 사용자 선택 후. 그 외는 기존 셀.
          const run = await getRun(deps.supa, runId);
          if (run.state === "structure_selected") return runResearchScope(runId, deps);
          // fromStep='examples'면 셈이·유이만 재생성(②③⑦ 스킵·research_facts 보존). 없으면 'full'(현행).
          return runResearchCell(runId, deps, { fromStep: event.data.fromStep ?? "full" });
        },
        { softAck: event.data.softAck },
      );
      if (guarded.status !== "ok") return { runId, status: guarded.status };
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
    });

    // 판별: fresh-start(structure_selected→scope) 신호. 재진입은 state=researching로 들어와 곧장 research_ready라 false.
    //   durable: crash 후 retry 시 메모된 s1.state===research_scoped에서 재유도 → 일관.
    const cameFromScope = s1.status === "ok" && s1.state === "research_scoped";
    if (!cameFromScope) return s1;

    // s2) 자동 scope 전진(정책 나) + 검증 셀 — cell의 costGuard가 비용 하드캡 그대로 강제(우회 없음).
    const s2 = await step.run("research-autoselect-cell", async () => {
      const guarded = await withStageRuntime(
        runId,
        async (deps) => {
          await autoAdvanceResearchScope(deps.supa, runId); // research_scoped→researching(멱등)
          return runResearchCell(runId, deps, { fromStep: "full" });
        },
        { softAck: event.data.softAck },
      );
      if (guarded.status !== "ok") return { runId, status: guarded.status };
      const res = guarded.value;
      return {
        runId: res.runId,
        status: "ok" as const,
        state: res.state,
        facts: res.factCount,
        assets: res.assetCount,
        escalated: res.escalatedCount,
        skipped: res.skipped,
      };
    });
    if (s2.status !== "ok") return s2; // 캡 일시정지·실패면 그대로(기존 captureStageFailure 경로)

    // s3) 자동 검수 통과 — research_ready→research_review→research_approved 전이만.
    //   ★ research_facts.human_approved는 건드리지 않는다(null 유지 = 보류). 사람 최종확인은 Phase 2 스크립트 검수.
    await step.run("research-auto-approve", async () => {
      const { createAdminClient } = await import("../../lib/supabase/admin.js");
      return autoPassResearchReview(createAdminClient(), runId);
    });

    // s4) 스크립트 자동 발행 — 짠펜 자동 시작(requestScript 액션 말고 직접 send — requireOwner 불필요).
    await step.run("script-dispatch", async () => {
      await inngest.send({ name: "run/script.requested", data: { runId } });
      return { dispatched: true };
    });

    return { ...s2, state: "research_approved" as const };
  },
);
