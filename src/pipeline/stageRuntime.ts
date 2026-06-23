// 단계 실행 공통 런타임 — 모든 단계(제안·셀)가 거치는 단 하나의 부트스트랩(§8).
//   deps(supa·config·ledger·costGuard) 조립 + 비용가드(runStageGuarded)를 한 곳에.
//   이전: _shared.ts·researchStage.ts·scriptStage.ts에 같은 5줄이 3벌 복제 → 여기로 단일화.
import { createAdminClient } from "../lib/supabase/admin.js";
import { loadConfig, type LlmConfig } from "../llm/config.js";
import { CostGuard, InMemoryCostLedger } from "../llm/costGuard.js";
import { runStageGuarded, type GuardedResult } from "./runGuards.js";
import type { Supa } from "./runState.js";

export interface StageRuntimeDeps {
  supa: Supa;
  config: LlmConfig;
  costGuard: CostGuard;
  ledger: InMemoryCostLedger;
}

/**
 * 단계 본체(fn)를 deps 조립 + 비용가드로 감싼다. 단계는 fn 안에서 자기 일만 한다.
 * 반환은 GuardedResult — 호출부(Inngest 함수)가 ok/paused/aborted를 그대로 전달.
 */
export async function withStageRuntime<T>(
  runId: string,
  fn: (deps: StageRuntimeDeps) => Promise<T>,
  opts: { softAck?: boolean | undefined } = {},
): Promise<GuardedResult<T>> {
  const supa = createAdminClient();
  const config = loadConfig();
  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });
  return runStageGuarded(supa, runId, costGuard, () => fn({ supa, config, costGuard, ledger }), opts);
}
