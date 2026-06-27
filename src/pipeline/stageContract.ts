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
import { decideStageEntry } from "./regenerateDecision.js";
import { buildRegenerateAugmentedSystem } from "./regenerateVariation.js";

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
  /** 활성 스켈레톤+런 주제로 로컬 후보 생성($0). 반환 null=로컬 불가→callLLM 폴백. mode=llm/forceLlm이면 호출 안 함. */
  localCandidates?(supa: Supa, prep: { input: unknown }, ctx: { offset: number }): Promise<Candidate[] | null>;
}

/**
 * 로컬 생성 vs LLM 단락 판정(순수) — 'callLLM 스킵' 의사결정의 단일 진실.
 *   forceLlm 또는 mode==="llm" → 항상 "llm"(localCandidates 호출 안 함은 호출부 책임).
 *   mode==="local" → 항상 "local"(localCount가 null/0이어도 로컬, callLLM 절대 안 함).
 *   mode==="hybrid" → 로컬 후보가 1개 이상(localCount>0)이면 "local", 아니면 "llm" 폴백.
 *   ★ localCount=null = 로컬 불가(훅 없음·스켈레톤 없음·mode=llm·forceLlm) → hybrid에선 항상 "llm".
 */
export function decideLocalGen(args: {
  mode: "hybrid" | "llm" | "local";
  forceLlm: boolean;
  localCount: number | null;
}): "local" | "llm" {
  const { mode, forceLlm, localCount } = args;
  if (forceLlm || mode === "llm") return "llm";
  if (mode === "local") return "local";
  // hybrid
  return localCount !== null && localCount > 0 ? "local" : "llm";
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
  opts: { force?: boolean; reason?: string; forceLlm?: boolean; postConfirm?: boolean } = {}, // reason: '다시 생성' 사용자 이유(transient·프롬프트용). 비/공백이면 무영향. forceLlm: 로컬 스킵하고 LLM 강제('새로 써줘', 동작은 step3). postConfirm: 확정(selectedState) 후 재생성 — entry 가드 우회·상태 전이/낙관잠금 없이 새 proposal만 INSERT(비용 patch는 id로만).
): Promise<ProposalStageResult> {
  const { runId, descriptor } = spec;
  const { supa, config } = deps;
  const run = await getRun(supa, runId);
  const postConfirm = !!opts.postConfirm;

  // 진입 판정(순수): force=false면 기존 멱등·정상·가드 분기와 정확히 동치.
  const entry = decideStageEntry({
    state: run.state,
    fromState: descriptor.fromState,
    proposedState: descriptor.proposedState,
    force: !!opts.force,
  });

  // 0) 멱등: 이미 제안 완료 상태면 기존 proposal 반환(재과금 0). force면 우회(run-in-place).
  //    ★ postConfirm은 memoized/reject 분기를 모두 우회하고 진입 허용 — 확정(selectedState)에서도 새 후보를 낸다.
  if (entry === "memoized" && !postConfirm) {
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
    // proposal 행이 없으면(이론상 비정상) 기존엔 fromState 가드에 걸려 에러였다 — 동치 유지.
    throw new Error(`${descriptor.stage} 단계는 '${descriptor.fromState}'에서만 시작(현재 '${run.state}').`);
  }

  // 1) 진입 가드: fromState에서만 시작. (run-in-place는 proposedState에서 진입하므로 통과)
  //    ★ postConfirm이면 reject(selectedState 등)도 진입 허용 — 확정 후 재생성 경로.
  if (entry === "reject" && !postConfirm) {
    throw new Error(`${descriptor.stage} 단계는 '${descriptor.fromState}'에서만 시작(현재 '${run.state}').`);
  }

  // 2) "작업 중" 마커 set — 멱등/reject early-return 이후, 실제 생성 시작 지점.
  //    제안 단계는 run.state가 생성 중에도 이전 *_selected/proposed에 머물러 phase!=="working"이라
  //    isWorking=false가 되던 버그 → 이 마커로 getProgress(state, note)가 작업 중을 인지하게 한다.
  //    ★ parseSubProgress 정규식(^\d+/\d+·...)에 안 맞는 한 줄 → 서브바 없이 "작업 중"만 표시(의도).
  //    setProgress는 절대 throw 안 함(runState.ts) → finally 안전. 성공·에러 양쪽에서 null로 클리어.
  await setProgress(supa, runId, "제안 생성 중");
  try {
    // 2) 결정적 prep(AI 없음).
    const prep = await spec.prepare(supa);

    // 2-1) 회차 nonce(offset)·이전 후보: run-in-place(force 재생성)·postConfirm(확정 후 재생성)이면
    //   이 (run, stage)의 기존 제안 개수=다음 회차 nonce, 최근 candidates=priorCandidates.
    //   forward/memoized는 offset=0·이전 후보 없음(기존 동작 동치 — prep 미변형 → promptHash 보존).
    //   offset은 로컬 생성 변주(스켈레톤 회전)와 LLM 변주(buildRegenerateAugmentedSystem) 둘 다의 nonce로 공유한다.
    const regenerate = postConfirm || entry === "run-in-place";
    let offset = 0;
    let priorCandidates: Candidate[] = [];
    if (regenerate) {
      const { data: priors } = await supa
        .from("stage_proposals")
        .select("candidates, created_at")
        .eq("run_id", runId)
        .eq("stage", descriptor.stage)
        .order("created_at", { ascending: false });
      offset = priors?.length ?? 0; // 기존 제안 개수 = 다음 회차 nonce
      priorCandidates = (priors?.[0]?.candidates as unknown as Candidate[] | undefined) ?? [];
    }

    // 2-2) 로컬 생성 시도(copy-local-gen). mode=llm/forceLlm이면 로컬 미허용 → 훅 미호출(localCount=null → 항상 LLM).
    //   localCandidates 훅이 없는 단계(topic/structure/research/script)도 localCount=null → 항상 LLM(기존 동작 불변).
    const mode = config.copyGenMode;
    const localAllowed = mode !== "llm" && !opts.forceLlm;
    const localCands =
      localAllowed && spec.localCandidates
        ? await spec.localCandidates(supa, { input: prep.input }, { offset })
        : null;
    const decision = decideLocalGen({
      mode,
      forceLlm: !!opts.forceLlm,
      localCount: spec.localCandidates && localAllowed ? (localCands?.length ?? 0) : null,
    });

    // 2-3) 분기 결과(candidates + 비용/메타). 두 경로가 이후 insert·전이를 공유한다.
    let candidates: Candidate[];
    let costUsd: number;
    let provider: string;
    let latencyMs: number;
    let promptHash: string;

    if (decision === "local") {
      // ★ 로컬 경로: callLLM 절대 호출 안 함($0·픽스처 무영향). localCands가 null(mode=local에서 훅 부재)이면 빈 후보.
      candidates = localCands ?? [];
      provider = "local";
      costUsd = 0;
      latencyMs = 0;
      promptHash = "local";
    } else {
      // LLM 경로(기존 동작 동치). 재생성(run-in-place·postConfirm)만 prep.system을 변주 — '다시 생성'이 이전과
      //   바이트 동일한 후보를 내던 버그 수정.
      //   ⚠ run-forward/memoized 등은 prep을 절대 건드리지 않는다 → forward promptHash 불변(기존 parity/eval 픽스처 보존).
      //   ponytail: 재생성은 새 promptHash라 replay 전용($0 동결)에선 픽스처 미스 throw가 정상(설계).
      if (regenerate) {
        prep.system = buildRegenerateAugmentedSystem(prep.system, priorCandidates, offset, opts.reason);
      }
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
      candidates = spec.toCandidates(res.data, prep.input);
      provider = res.provider;
      costUsd = res.costUsd;
      latencyMs = res.latencyMs;
      promptHash = res.promptHash;
    }

    // 4) proposed 저장(컨펌 전 = 저장 후 표시).
    const { data: proposal, error: pe } = await supa
      .from("stage_proposals")
      .insert({ run_id: runId, stage: descriptor.stage, candidates: candidates as unknown as Json, prompt_run_ref: promptHash })
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

    // 6) 마지막에 run 갱신. run-forward는 fromState→proposedState 전이(기존 동작 동치).
    //    run-in-place(force 재생성)는 전이 없이 같은 proposedState로 비용/모델/지연만 update —
    //    상태가 안 바뀌니 DB 전이 트리거 무관(migration 불필요). 새 proposal만 추가된다.
    //    postConfirm(확정 후 재생성)은 run 상태가 selectedState라 proposedState 낙관잠금이 안 맞는다 →
    //    상태 조건 없이 id로만 비용 patch(전이도 낙관잠금도 없음). 새 proposal만 추가된다.
    const patch = {
      cost_usd: run.cost_usd + costUsd,
      model: `${provider}`,
      prompt_version: promptHash,
      latency_ms: latencyMs,
    };
    if (postConfirm) {
      const { error: ue } = await supa
        .from("production_runs")
        .update(patch)
        .eq("id", runId); // id로만 — 상태 조건 없음(selectedState 등 어떤 상태든 비용만 반영)
      if (ue) throw new Error(`run 비용 갱신 실패(postConfirm): ${ue.message}`);
    } else if (entry === "run-in-place") {
      const { data: upd, error: ue } = await supa
        .from("production_runs")
        .update(patch)
        .eq("id", runId)
        .eq("state", descriptor.proposedState) // 낙관 잠금: 같은 state일 때만(경합 안전)
        .select("id");
      if (ue) throw new Error(`run 비용 갱신 실패(in-place): ${ue.message}`);
      if (!upd || upd.length === 0) throw new Error(`in-place 갱신 무효: run ${runId}가 더 이상 '${descriptor.proposedState}'가 아님.`);
    } else {
      await transitionRun(supa, runId, descriptor.fromState, descriptor.proposedState, patch);
    }
    return {
      runId, stage: descriptor.stage, proposalId: proposal.id, candidates,
      state: descriptor.proposedState, costUsd, provider, skipped: false,
    };
  } finally {
    // 마커 클리어(성공·에러 양쪽). setProgress는 throw 안 함 → finally 안전.
    //   ★ 기존 성공 시 setProgress(null)을 여기로 통합 — 중복 클리어 방지.
    await setProgress(supa, runId, null);
  }
}
