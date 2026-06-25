// 썸네일 '개별 슬롯' 다시 생성 — 3칸 중 한 칸만 새로 만들고 나머지 2칸은 완전 보존(무전이 in-place).
//   전체 재생성(runProposalStage force=run-in-place)과 달리, 여기선 슬롯 1개만 교체한다.
//   상태 전이 절대 없음(thumbnails_proposed 유지) — 전이 트리거·migration 무관. 새 proposal만 INSERT.
//   썸네일 생성은 thumbnailStageSpec(step1)의 prepare/toCandidates를 그대로 재사용(신규 스키마 없음).
//   변주는 buildRegenerateAugmentedSystem 재사용 → promptHash 차등(record/replay에서 새 결과).

import type { Candidate } from "./stageContract.js";
import type { Json } from "../lib/supabase/database.types.js";
import { callLLM } from "../llm/callLLM.js";
import { getRun } from "./runState.js";
import type { StageRuntimeDeps } from "./stageRuntime.js";
import { thumbnailStageSpec } from "../agents/thumbnail_maker/stage.js";
import { buildRegenerateAugmentedSystem } from "./regenerateVariation.js";
import { STAGE_DESCRIPTORS } from "./stages.js";
import type { ThumbnailMakerOutput } from "../agents/thumbnail_maker/schema.js";

const THUMB = STAGE_DESCRIPTORS.thumbnail;

/**
 * 3칸 중 slotIdx만 새 payload/reason/evidenceIds로 교체. 나머지 칸은 완전 불변(idx·payload·reason·evidence_ids).
 *   순수·결정적: 같은 입력 → 같은 출력. slotIdx 범위 밖이면 throw(크래시 말고 명확한 에러).
 */
export function composeSlotReplacement(
  existing: Candidate[],
  slotIdx: number,
  newPayload: unknown,
  reason: string,
  evidenceIds: string[],
): Candidate[] {
  if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= existing.length) {
    throw new Error(`composeSlotReplacement: slotIdx ${slotIdx}가 범위(0..${existing.length - 1}) 밖.`);
  }
  return existing.map((c, i) =>
    i === slotIdx
      ? { idx: c.idx, payload: newPayload, reason, evidence_ids: evidenceIds }
      : c, // 나머지 칸은 그대로 참조 보존(완전 불변)
  );
}

export interface ThumbnailSlotResult {
  runId: string;
  proposalId: string;
  slotIdx: number;
  candidates: Candidate[];
  state: typeof THUMB.proposedState;
  costUsd: number;
  provider: string;
}

/**
 * 썸네일 슬롯 1개 in-place 재생성. 상태 전이 없음(thumbnails_proposed 유지·낙관잠금).
 *   가드: state≠thumbnails_proposed·proposal 없음·후보<3·slotIdx 범위 밖 → throw(명확 메시지).
 *   썸네일 1개 생성: thumbnailStageSpec.prepare → 변주 system → callLLM ≤1회 → toCandidates[0] 사용.
 */
export async function regenerateThumbnailSlot(
  deps: StageRuntimeDeps,
  runId: string,
  slotIdx: number,
  reason?: string, // '다시 생성' 시 사용자가 적은 선택적 이유(transient·프롬프트용). 비/공백이면 출력 바이트 불변(픽스처 보존).
): Promise<ThumbnailSlotResult> {
  const { supa } = deps;

  // 1) 가드: thumbnails_proposed에서만(전이 트리거 충돌 방지).
  const run = await getRun(supa, runId);
  if (run.state !== THUMB.proposedState) {
    throw new Error(`썸네일 슬롯 재생성은 '${THUMB.proposedState}'에서만 가능(현재 '${run.state}').`);
  }

  // 2) 최신 thumbnail proposal candidates 읽기. 없거나 후보<3 → reject.
  const { data: latest } = await supa
    .from("stage_proposals")
    .select("candidates, created_at")
    .eq("run_id", runId)
    .eq("stage", THUMB.stage)
    .order("created_at", { ascending: false });
  const priors = latest ?? [];
  const existing = (priors[0]?.candidates as unknown as Candidate[] | undefined) ?? [];
  if (existing.length < 3) {
    throw new Error(`썸네일 슬롯 재생성: 최신 thumbnail 제안이 없거나 후보가 3개 미만(현재 ${existing.length}).`);
  }

  // 3) slotIdx 유효성(0..2).
  if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx > 2) {
    throw new Error(`썸네일 슬롯 재생성: slotIdx ${slotIdx}가 범위(0..2) 밖.`);
  }

  // 4) 썸네일 1개 생성 — step1 스펙 재사용. system을 기존 candidates·attempt로 변주(promptHash 차등).
  const spec = thumbnailStageSpec(runId);
  const prep = await spec.prepare(supa);
  const attempt = priors.length; // 기존 제안 개수 = 회차 nonce
  const augmentedSystem = buildRegenerateAugmentedSystem(prep.system, existing, attempt, reason);

  const res = await callLLM<ThumbnailMakerOutput>(
    {
      roleId: THUMB.roleId,
      system: augmentedSystem,
      input: prep.input,
      schema: prep.schema,
      runId,
      ...(prep.maxTokens !== undefined ? { maxTokens: prep.maxTokens } : {}),
    },
    { config: deps.config, costGuard: deps.costGuard },
  );

  // 검증된 출력 → 후보 매핑(ref_similarity·style_conformance 포함). 그 중 하나(0번)를 새 칸으로.
  const mapped = spec.toCandidates(res.data, prep.input);
  const fresh = mapped[0];
  if (!fresh) throw new Error("썸네일 슬롯 재생성: LLM 출력에서 후보를 만들지 못함.");

  // 5) 슬롯 합성(1칸만 교체, 나머지 보존).
  const composed = composeSlotReplacement(existing, slotIdx, fresh.payload, fresh.reason, fresh.evidence_ids);

  // 6) 새 proposal INSERT(합성 결과). prompt_run_ref=차등 promptHash.
  const { data: proposal, error: pe } = await supa
    .from("stage_proposals")
    .insert({ run_id: runId, stage: THUMB.stage, candidates: composed as unknown as Json, prompt_run_ref: res.promptHash })
    .select("id")
    .single();
  if (pe) throw new Error(`stage_proposals insert 실패: ${pe.message}`);

  // 7) cost_ledger flush — 전이 '전'(여기선 run update 전). runProposalStage 패턴 동일.
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

  // 8) run 무전이 update — 비용/모델/지연만. 낙관잠금: 여전히 thumbnails_proposed일 때만.
  //    ★ transitionRun 호출 금지(상태 전이 절대 없음).
  const { data: upd, error: ue } = await supa
    .from("production_runs")
    .update({
      cost_usd: run.cost_usd + res.costUsd,
      model: `${res.provider}`,
      prompt_version: res.promptHash,
      latency_ms: res.latencyMs,
    })
    .eq("id", runId)
    .eq("state", THUMB.proposedState)
    .select("id");
  if (ue) throw new Error(`run 비용 갱신 실패(슬롯 in-place): ${ue.message}`);
  if (!upd || upd.length === 0) throw new Error(`슬롯 in-place 갱신 무효: run ${runId}가 더 이상 '${THUMB.proposedState}'가 아님.`);

  return {
    runId,
    proposalId: proposal.id,
    slotIdx,
    candidates: composed,
    state: THUMB.proposedState,
    costUsd: res.costUsd,
    provider: res.provider,
  };
}
