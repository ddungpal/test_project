// 반장 마감 가드(§8) — 비용 2단캡(per-run)·kill switch·max_rework를 파이프라인에 연결.
//   개발(claude-p)은 $0라 캡이 안 걸리지만(스킵), 운영(api)에선 편 전체 누계로 SOFT/HARD가 동작한다.

import { SoftCapPause, HardCapExceededError, type CostGuard, type InMemoryCostLedger } from "../llm/costGuard.js";
import { getRun, transitionRun, type Supa } from "./runState.js";
import type { RunState } from "../domain/enums.js";

export const MAX_REWORK = 2; // config_registry pipeline.max_rework 와 동기화(정적-A 기본).

/** 비용 캡 신호인가(강등 대상이 아니라 일시정지/중단 대상). */
export function isCapError(e: unknown): boolean {
  return e instanceof SoftCapPause || e instanceof HardCapExceededError;
}

/**
 * in-memory ledger를 cost_ledger로 flush하고 '이 단계'의 실비 합을 반환(코드리뷰 P0).
 * ★ 단계 비용은 costGuard.spentUsd가 아니라 ledger 합으로 구한다 — spentUsd는 seed로 run 누계를 포함해
 *   `run.cost_usd + spentUsd`가 누계를 이중계산하기 때문. ledger 합 = 순수 이 단계 비용.
 */
export async function flushLedger(supa: Supa, runId: string, ledger?: InMemoryCostLedger): Promise<number> {
  if (!ledger) return 0;
  const entries = ledger.entries.filter((e) => e.runId === runId);
  const stageCost = entries.reduce((s, e) => s + e.costUsd, 0);
  if (entries.length) {
    const rows = entries.map((e) => ({ run_id: runId, category: e.category as "llm", detail: e.detail, cost_usd: e.costUsd }));
    const { error } = await supa.from("cost_ledger").insert(rows);
    if (error) throw new Error(`cost_ledger insert 실패: ${error.message}`);
    ledger.entries.length = 0;
  }
  return stageCost;
}

export type GuardedResult<T> =
  | { status: "ok"; value: T }
  | { status: "paused" } // SOFT 캡 → paused_soft_cap(사람 확인 대기)
  | { status: "aborted" }; // HARD 캡 / kill switch

/** kill switch — 어느 비종료 상태에서든 aborted로. 사유 기록(감사·대시보드). 멱등. */
export async function abortRun(supa: Supa, runId: string, reason: string): Promise<void> {
  const run = await getRun(supa, runId);
  if (run.state === "aborted" || run.state === "published") return;
  await transitionRun(supa, runId, run.state, "aborted", { abort_reason: reason });
}

/**
 * 단계 실행을 비용 가드로 감싼다:
 *  - 시작 시 run 누계(cost_usd)를 CostGuard에 시드 → 캡이 편 전체 기준(반장 마감 핵심).
 *  - 이미 aborted면 실행 거부(kill switch 존중).
 *  - SoftCapPause → researching/scripting이면 paused_soft_cap, 아니면 abort.
 *  - HardCapExceededError → abort.
 */
export async function runStageGuarded<T>(
  supa: Supa,
  runId: string,
  costGuard: CostGuard,
  fn: () => Promise<T>,
  opts: { softAck?: boolean | undefined } = {},
): Promise<GuardedResult<T>> {
  const run = await getRun(supa, runId);
  if (run.state === "aborted") return { status: "aborted" };
  // 코드리뷰 P1: paused 상태 run에 이벤트 재전달되면 진입가드에서 에러로 retry 소음 → 무동작 일시정지로 단락.
  if (run.state === "paused_soft_cap") return { status: "paused" };
  costGuard.seed(runId, run.cost_usd);
  if (opts.softAck) costGuard.acknowledgeSoftCap(runId); // 사람이 SOFT 승인 후 재개

  try {
    return { status: "ok", value: await fn() };
  } catch (e) {
    if (e instanceof HardCapExceededError) {
      await abortRun(supa, runId, `HARD 비용캡 초과: ${e.message}`);
      return { status: "aborted" };
    }
    if (e instanceof SoftCapPause) {
      const cur = await getRun(supa, runId);
      if (cur.state === "researching" || cur.state === "scripting") {
        // 멈춘 단계를 DB에 보존(코드리뷰 P1) — 재개 시 서버가 단계를 알아야 한다(클라 임의선택 차단).
        const pausedStage = cur.state === "researching" ? "research" : "script";
        await transitionRun(supa, runId, cur.state, "paused_soft_cap", {
          abort_reason: `SOFT 캡 도달($${e.spentUsd.toFixed(2)}) — 사람 확인 대기`,
          paused_stage: pausedStage,
        });
        return { status: "paused" };
      }
      await abortRun(supa, runId, "SOFT 캡(일시정지 불가 단계에서 도달) → 중단");
      return { status: "aborted" };
    }
    throw e; // 그 외 에러는 그대로(Inngest 재시도).
  }
}

/**
 * 재개할 단계를 서버가 판정(코드리뷰 P1) — 클라이언트 입력 신뢰 금지.
 *  - 1순위: migration 13의 paused_stage(멈춘 시점에 보존).
 *  - 폴백(컬럼 미적용/구버전 행): research_facts 존재 → 'script'(리서치 완료·승인 후), 없으면 'research'.
 */
export async function resolveResumeStage(supa: Supa, runId: string): Promise<"research" | "script"> {
  const { data, error } = await supa.from("production_runs").select("paused_stage").eq("id", runId).maybeSingle();
  if (!error) {
    const s = (data as { paused_stage: "research" | "script" | null } | null)?.paused_stage;
    if (s === "research" || s === "script") return s;
  }
  const { count } = await supa.from("research_facts").select("id", { count: "exact", head: true }).eq("run_id", runId);
  return (count ?? 0) > 0 ? "script" : "research";
}

/** SOFT 일시정지 해제 — 사람 승인 후 재개. 멈춘 단계는 서버가 판정(클라 미신뢰). (이벤트 재발행 시 softAck=true 동반) */
export async function resumeFromSoftCap(supa: Supa, runId: string): Promise<{ stage: "research" | "script" }> {
  const stage = await resolveResumeStage(supa, runId);
  const toState: Extract<RunState, "researching" | "scripting"> = stage === "research" ? "researching" : "scripting";
  await transitionRun(supa, runId, "paused_soft_cap", toState, { abort_reason: null, paused_stage: null });
  return { stage };
}

/** rework 1회 증가 + 상한 초과 여부(max_rework). 초과면 호출부가 abort 처리.
 *  rework_count는 migration 12(반장 마감) 컬럼 — 미적용이면 명확한 에러를 던진다(rework 경로에서만 닿음). */
export async function bumpRework(supa: Supa, runId: string, max = MAX_REWORK): Promise<{ count: number; exceeded: boolean }> {
  const { data, error: se } = await supa.from("production_runs").select("rework_count").eq("id", runId).single();
  if (se) throw new Error(`rework_count 조회 실패(migration 12 적용 필요?): ${se.message}`);
  const count = ((data as { rework_count?: number }).rework_count ?? 0) + 1;
  const { error } = await supa.from("production_runs").update({ rework_count: count }).eq("id", runId);
  if (error) throw new Error(`rework_count 갱신 실패: ${error.message}`);
  return { count, exceeded: count > max };
}
