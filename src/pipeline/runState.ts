// run 상태 읽기/전이 헬퍼 — 코드 가드(enums.ALLOWED_TRANSITIONS) + DB 트리거(이중 안전망).
// DB의 enforce_run_transition 트리거가 최종 강제선이지만, 코드에서도 먼저 막아 명확한 에러를 준다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types.js";
import { canTransition, type RunState } from "../domain/enums.js";

export type Supa = SupabaseClient<Database>;

export interface RunRow {
  id: string;
  state: RunState;
  cost_usd: number;
}

/**
 * 단계 내부 서브진행 기록(best-effort) — 'i/n·라벨' 형식(예: "2/3·외부 검색").
 *   긴 단계가 "작업 중"으로만 보이지 않게 현재 서브단계를 남긴다. 완료 시 null로 클리어.
 *   ★ 절대 throw 안 함 — migration 15 미적용(컬럼 없음)이어도 단계 실행을 깨지 않는다.
 */
export async function setProgress(supa: Supa, runId: string, note: string | null): Promise<void> {
  const { error } = await supa.from("production_runs").update({ progress_note: note }).eq("id", runId);
  if (error) console.warn(`[progress] 기록 실패(무시·migration 15?): ${error.message}`);
}

export async function getRun(supa: Supa, runId: string): Promise<RunRow> {
  const { data, error } = await supa.from("production_runs").select("id, state, cost_usd").eq("id", runId).single();
  if (error) throw new Error(`run 조회 실패(${runId}): ${error.message}`);
  return data as RunRow;
}

/** 전이 가드 + DB 반영. patch로 cost_usd·model 등 동시 갱신(전이 트리거가 같은 UPDATE를 검사). */
export async function transitionRun(
  supa: Supa,
  runId: string,
  from: RunState,
  to: RunState,
  patch: Partial<Database["public"]["Tables"]["production_runs"]["Update"]> = {},
): Promise<void> {
  if (from !== to && !canTransition(from, to)) {
    throw new Error(`불법 상태 전이(코드 가드): ${from} → ${to}`);
  }
  // 동시성 가드: state가 아직 from일 때만 전이(낙관적 잠금 → 중복 트리거 멱등, §8.2).
  const { data, error } = await supa
    .from("production_runs")
    .update({ state: to, ...patch })
    .eq("id", runId)
    .eq("state", from)
    .select("id");
  if (error) throw new Error(`전이 실패 ${from}→${to}: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`전이 무효: run ${runId}가 더 이상 '${from}' 상태가 아님(이미 진행됐거나 경합).`);
  }
}
