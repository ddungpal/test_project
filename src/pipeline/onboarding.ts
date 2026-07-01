// 쏙이(온보더) 온디맨드 배선 로직 — 선형 상태체인 밖(off-chain). 아크·금맥은 stage_proposals/stage_selections 재사용.
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "C. 배선 — 온디맨드".
//   ★ 온보딩은 Stage가 아니다(선형 전이 없음) — stage="onboarding"은 stage_proposals 저장 슬롯일 뿐.
//   ★ 아크 → stage_proposals(stage="onboarding", candidates[0].payload). 금맥 → 그 proposal에 붙는 stage_selections(edited_payload).
//   ★ getSelectedStagePayload는 stage:Stage만 받으므로 재사용 불가 — 얇은 전용 리더(loadOnboardingArc)를 쓴다.
import type { Supa } from "./runState.js";
import type { StageRuntimeDeps } from "./stageRuntime.js";
import type { Json } from "../lib/supabase/database.types.js";
import { prepareOnboarder } from "../agents/onboarder/prepare.js";
import { onboarderStep } from "../agents/onboarder/step.js";
import type { OnboardingArc, OnboardingGold } from "../agents/onboarder/schema.js";

const ONBOARDING_STAGE = "onboarding" as const;

/** 이 run의 최신 onboarding proposal id를 반환(없으면 null). 얇은 전용 리더(Stage 아님). */
async function latestOnboardingProposalId(supa: Supa, runId: string): Promise<string | null> {
  const { data } = await supa
    .from("stage_proposals")
    .select("id")
    .eq("run_id", runId)
    .eq("stage", ONBOARDING_STAGE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** onboarding proposal의 candidates[0].payload를 OnboardingArc로 반환(없으면 null). */
export async function loadOnboardingArc(supa: Supa, runId: string): Promise<OnboardingArc | null> {
  const { data } = await supa
    .from("stage_proposals")
    .select("candidates")
    .eq("run_id", runId)
    .eq("stage", ONBOARDING_STAGE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const cands = (data.candidates as unknown as { idx: number; payload: unknown }[]) ?? [];
  const first = cands.find((c) => c.idx === 0) ?? cands[0];
  return (first?.payload as OnboardingArc | undefined) ?? null;
}

/** onboarding proposal의 최신 stage_selection.edited_payload를 OnboardingGold로 반환(없으면 null). 얇은 전용 리더·throw 0. */
export async function loadOnboardingGold(supa: Supa, runId: string): Promise<OnboardingGold | null> {
  const proposalId = await latestOnboardingProposalId(supa, runId);
  if (!proposalId) return null;
  const { data } = await supa
    .from("stage_selections")
    .select("edited_payload")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const payload = data?.edited_payload;
  if (!payload) return null;
  return payload as unknown as OnboardingGold;
}

/** 김짠부 응답에서 뽑은 금맥을 onboarding proposal에 붙는 stage_selection으로 저장. proposal 없으면 throw. */
export async function saveOnboardingGold(supa: Supa, runId: string, gold: OnboardingGold): Promise<void> {
  const proposalId = await latestOnboardingProposalId(supa, runId);
  if (!proposalId) throw new Error("온보딩 아크가 없습니다 — 먼저 이해하기를 실행하세요.");
  const { error } = await supa.from("stage_selections").insert({
    proposal_id: proposalId,
    chosen_idx: 0,
    edited_payload: gold as unknown as Json,
  });
  if (error) throw new Error(`온보딩 금맥 저장 실패: ${error.message}`);
}

/**
 * 쏙이 아크 생성·저장(온디맨드) — 멱등.
 *   - 이 run의 onboarding proposal이 이미 있고 force가 아니면 재생성 없이 기존 아크 반환($0).
 *   - 없으면 prepareOnboarder(결정적) → onboarderStep(callLLM 1회) → stage_proposals insert.
 *   deps는 withStageRuntime가 주는 StageRuntimeDeps({supa,config,costGuard,ledger}) — onboarderStep의 CallLLMDeps를 구조적으로 만족.
 */
export async function runOnboarding(
  runId: string,
  deps: StageRuntimeDeps,
  opts: { force?: boolean } = {},
): Promise<{ runId: string; arc: OnboardingArc; skipped: boolean }> {
  const { supa } = deps;

  if (!opts.force) {
    const existing = await loadOnboardingArc(supa, runId);
    if (existing) return { runId, arc: existing, skipped: true };
  }

  const input = await prepareOnboarder(supa, runId);
  const arc = await onboarderStep(deps, runId, input);

  const candidates = [{ idx: 0, payload: arc, reason: "온보딩 아크", evidence_ids: [] as string[] }];
  const { error } = await supa
    .from("stage_proposals")
    .insert({ run_id: runId, stage: ONBOARDING_STAGE, candidates: candidates as unknown as Json });
  if (error) throw new Error(`온보딩 아크 저장 실패: ${error.message}`);

  return { runId, arc, skipped: false };
}
