// 단계 계약 골격(§8.1) — 모든 제안 단계가 공유하는 단 하나의 모양.
//   [DB읽기 → 결정적 prep] → [callLLM ≤1회 → 스키마검증] → [proposed 저장 → 상태 전이] → 비용 정산
// AI는 단계당 정확히 1회. 앞(prep)·뒤(전이)는 결정적 로직. "저장 후 표시" = 컨펌 전 proposed로 DB에 박는다.
//
// 멱등성(§8.2/8.3): 이미 proposedState이고 해당 (run,stage) proposal이 있으면 재호출 없이 기존 결과 반환
//   → 중복 이벤트/버튼/재시도가 재과금하지 않는다. (claude-p는 어차피 $0, api에서 비용 누수 차단.)

import type { JsonSchema } from "../llm/types.js";
import type { Json } from "../lib/supabase/database.types.js";
import { callLLM } from "../llm/callLLM.js";
import type { CostGuard, InMemoryCostLedger } from "../llm/costGuard.js";
import type { LlmConfig } from "../llm/config.js";
import { getRun, transitionRun, setProgress, type Supa } from "./runState.js";
import type { StageDescriptor } from "./stages.js";
import type { ProposalSource } from "../lib/dashboard/proposalTypes.js";

/** stage_proposals.candidates 한 항목(제안=임시, lineage 정규화는 채택 후). */
export interface Candidate {
  idx: number;
  payload: unknown;
  reason: string;
  evidence_ids: string[];
}

export interface ProposalStageSpec<TOut> {
  runId: string;
  descriptor: StageDescriptor;
  /** DB 컨텍스트 읽기 + 결정적 가공 → LLM 호출 재료. AI 미사용(§8.1). */
  prepare(supa: Supa): Promise<{ system: string; input: unknown; schema: JsonSchema; maxTokens?: number; sources?: ProposalSource[] }>;
  /** 검증된 LLM 출력 → 후보 배열(stage_proposals.candidates). 2번째 인자(opt)=prepare가 만든 input(파생 필드·가드용). */
  toCandidates(out: TOut, input?: unknown): Candidate[];
}

export interface ProposalStageDeps {
  supa: Supa;
  config: LlmConfig;
  costGuard: CostGuard;
  /** callLLM이 reconcile로 채우는 in-memory ledger. 단계 종료 후 cost_ledger로 flush. */
  ledger?: InMemoryCostLedger;
}

export interface ProposalStageResult {
  runId: string;
  stage: StageDescriptor["stage"];
  proposalId: string;
  candidates: Candidate[];
  state: StageDescriptor["proposedState"];
  costUsd: number;
  provider: string;
  skipped: boolean; // 멱등 재호출이면 true
}

export async function runProposalStage<TOut>(
  spec: ProposalStageSpec<TOut>,
  deps: ProposalStageDeps,
): Promise<ProposalStageResult> {
  const { runId, descriptor } = spec;
  const { supa } = deps;
  const run = await getRun(supa, runId);

  // 0) 멱등: 이미 제안 완료 상태면 기존 proposal 반환(재과금 0).
  if (run.state === descriptor.proposedState) {
    const { data: existing } = await supa
      .from("stage_proposals")
      .select("id, candidates")
      .eq("run_id", runId)
      .eq("stage", descriptor.stage)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        runId, stage: descriptor.stage, proposalId: existing.id,
        candidates: existing.candidates as unknown as Candidate[],
        state: descriptor.proposedState, costUsd: 0, provider: "memoized", skipped: true,
      };
    }
  }

  // 1) 진입 가드: fromState에서만 시작.
  if (run.state !== descriptor.fromState) {
    throw new Error(`${descriptor.stage} 단계는 '${descriptor.fromState}'에서만 시작(현재 '${run.state}').`);
  }

  // 2) 결정적 prep(AI 없음).
  const prep = await spec.prepare(supa);

  // 3) AI 정확히 1회 — 비용가드·fixtures·스키마강제는 callLLM이 담당.
  const res = await callLLM<TOut>(
    {
      roleId: descriptor.roleId,
      system: prep.system,
      input: prep.input,
      schema: prep.schema,
      runId,
      ...(prep.maxTokens !== undefined ? { maxTokens: prep.maxTokens } : {}),
    },
    { config: deps.config, costGuard: deps.costGuard },
  );

  // 4) proposed 저장(컨펌 전 = 저장 후 표시).
  const candidates = spec.toCandidates(res.data, prep.input);
  const { data: proposal, error: pe } = await supa
    .from("stage_proposals")
    .insert({ run_id: runId, stage: descriptor.stage, candidates: candidates as unknown as Json, prompt_run_ref: res.promptHash })
    .select("id")
    .single();
  if (pe) throw new Error(`stage_proposals insert 실패: ${pe.message}`);

  // 4-1) 검색 출처 저장(best-effort) — migration 16 컬럼 없어도 단계는 안 깨진다. 토글 노출용.
  if (prep.sources && prep.sources.length) {
    const { error: srcErr } = await supa
      .from("stage_proposals")
      .update({ sources: prep.sources as unknown as Json })
      .eq("id", proposal.id);
    if (srcErr) console.warn(`[sources] 저장 실패(무시·migration 16?): ${srcErr.message}`);
  }

  // 5) cost_ledger flush — 전이 '전'에(코드리뷰 P1: 전이 후 실패 시 원장 유실+멱등 재시도가 flush 건너뜀).
  if (deps.ledger && deps.ledger.entries.length) {
    const rows = deps.ledger.entries
      .filter((e) => e.runId === runId)
      .map((e) => ({ run_id: runId, category: e.category as "llm", detail: e.detail, cost_usd: e.costUsd }));
    if (rows.length) {
      const { error: le } = await supa.from("cost_ledger").insert(rows);
      if (le) throw new Error(`cost_ledger insert 실패: ${le.message}`);
      deps.ledger.entries.length = 0; // flush 후 비움(중복 적재 방지)
    }
  }

  // 6) 상태 전이를 '마지막'에 + 비용/모델/지연 갱신(같은 UPDATE).
  await transitionRun(supa, runId, descriptor.fromState, descriptor.proposedState, {
    cost_usd: run.cost_usd + res.costUsd,
    model: `${res.provider}`,
    prompt_version: res.promptHash,
    latency_ms: res.latencyMs,
  });
  await setProgress(supa, runId, null); // 서브진행 클리어(단계 완료)

  return {
    runId, stage: descriptor.stage, proposalId: proposal.id, candidates,
    state: descriptor.proposedState, costUsd: res.costUsd, provider: res.provider, skipped: false,
  };
}
