// 짠펜 단일 세그먼트 재생성 — 전체 대본(runScriptStage) 재작성이 아니라 그 세그먼트 하나만 다시 쓴다.
//   대상 세그먼트 + 앞뒤 이웃(text) + 그 세그먼트 lineage 사실/자산 + 사유를 입력으로 짠펜 부분 모드 1회 호출 →
//   그 script_segments 행만 update(kind/payload 정규화) + 그 세그먼트 lineage만 재설정.
//   ★ 전량 delete-insert·표절검사·다른 세그먼트·used_in_script 전체 리셋 절대 없음(단일 세그먼트 스코프).
//   ★ scriptCell의 factsInput(caution 라벨)·lineage 매핑(범위 밖 무시·dedup) 패턴을 이 세그먼트 하나에만 적용.

import type { CostGuard, InMemoryCostLedger } from "../llm/costGuard.js";
import type { LlmConfig } from "../llm/config.js";
import type { Supa } from "./runState.js";
import type { Json } from "../lib/supabase/database.types.js";
import { getSelectedStagePayload, getToneProfile } from "./context.js";
import { parseAxStages, resolveToneInjection } from "./axFlag.js";
import { normalizeSegmentPayload } from "./segmentBlock.js";
import { scribeSegmentStep } from "../agents/scribe/step.js";
import type { ScribeSegmentOutput } from "../agents/scribe/schema.js";

export interface SegmentRegenDeps {
  supa: Supa;
  config: LlmConfig;
  costGuard: CostGuard;
  ledger?: InMemoryCostLedger;
}

// 짠펜 부분 모드 호출을 주입 가능하게(테스트에서 실제 callLLM 없이 DB 로직만 검증).
export type ScribeSegmentFn = (
  input: {
    tone: unknown;
    reason: string;
    target: string;
    neighbors: { prev?: string; next?: string };
    facts: unknown;
    assets: unknown;
    target_persona?: string;
  },
) => Promise<ScribeSegmentOutput>;

interface FactRow {
  id: string;
  claim: string;
  verification_status: string;
  is_financial: boolean;
}
interface AssetRow {
  id: string;
}

/**
 * 단일 세그먼트 재생성. deps는 ScriptStageDeps류(supa·config·costGuard·ledger).
 *   scribeFn을 넘기지 않으면 scribeSegmentStep(실 callLLM)을 쓴다(주입은 테스트용).
 */
export async function regenerateSegment(
  runId: string,
  segmentId: string,
  reason: string,
  deps: SegmentRegenDeps,
  scribeFn?: ScribeSegmentFn,
): Promise<void> {
  const { supa, config, costGuard } = deps;
  const scribe: ScribeSegmentFn =
    scribeFn ?? ((input) => scribeSegmentStep({ config, costGuard }, runId, input));

  // 1) 대상 세그먼트 로드(run+id 스코프) — ord·text·content_id 필요.
  const { data: target, error: te } = await supa
    .from("script_segments")
    .select("id, ord, text, content_id")
    .eq("run_id", runId)
    .eq("id", segmentId)
    .single();
  if (te || !target) throw new Error(`대상 세그먼트 조회 실패(run=${runId}, seg=${segmentId}): ${te?.message ?? "없음"}`);
  const targetOrd = target.ord as number;

  // 2) 앞뒤 이웃 text 로드(같은 run, ord = target.ord ± 1).
  const { data: neighborRows, error: ne } = await supa
    .from("script_segments")
    .select("ord, text")
    .eq("run_id", runId)
    .in("ord", [targetOrd - 1, targetOrd + 1]);
  if (ne) throw new Error(`이웃 세그먼트 조회 실패: ${ne.message}`);
  const neighbors: { prev?: string; next?: string } = {};
  for (const n of neighborRows ?? []) {
    if (n.ord === targetOrd - 1) neighbors.prev = n.text as string;
    if (n.ord === targetOrd + 1) neighbors.next = n.text as string;
  }

  // 3) 이 세그먼트 lineage 사실/자산만 로드(조인테이블 → 원본). scriptView 조인 읽기 참고하되 이 세그먼트 하나만.
  const [sfRes, saRes] = await Promise.all([
    supa.from("script_segment_facts").select("fact_id").eq("segment_id", segmentId),
    supa.from("script_segment_explanation_assets").select("asset_id").eq("segment_id", segmentId),
  ]);
  if (sfRes.error) throw new Error(`segment_facts 조회 실패: ${sfRes.error.message}`);
  if (saRes.error) throw new Error(`segment_assets 조회 실패: ${saRes.error.message}`);
  const factIds = [...new Set((sfRes.data ?? []).map((l) => l.fact_id as string))];
  const assetIds = [...new Set((saRes.data ?? []).map((l) => l.asset_id as string))];

  const [factsRes, assetsRes] = await Promise.all([
    factIds.length
      ? supa.from("research_facts").select("id, claim, verification_status, is_financial").in("id", factIds)
      : Promise.resolve({ data: [] as FactRow[], error: null }),
    assetIds.length
      ? supa.from("explanation_assets").select("id").in("id", assetIds)
      : Promise.resolve({ data: [] as AssetRow[], error: null }),
  ]);
  if (factsRes.error) throw new Error(`research_facts 조회 실패: ${factsRes.error.message}`);
  if (assetsRes.error) throw new Error(`explanation_assets 조회 실패: ${assetsRes.error.message}`);
  const facts = (factsRes.data ?? []) as FactRow[];
  const assets = (assetsRes.data ?? []) as AssetRow[];

  // fact 입력 = scriptCell factsInput 미러(미검증 fact는 단정 금지 caution 라벨).
  const factsInput = facts.map((f, idx) => ({
    idx,
    claim: f.claim,
    verification_status: f.verification_status,
    is_financial: f.is_financial,
    caution: f.verification_status === "verified" ? null : "미검증 — 단정 금지, 일반 원리로만 설명",
  }));
  const assetsInput = assets.map((_a, idx) => ({ idx }));

  // 4) tone·persona 조립(scriptCell 동일 경로).
  const tone = await getToneProfile(supa);
  const toneInjection = resolveToneInjection("script", tone?.components ?? null, parseAxStages());
  const topicPayload = (await getSelectedStagePayload(supa, runId, "topic")) as { target_persona?: string } | null;

  const scribeInput: Parameters<ScribeSegmentFn>[0] = {
    tone: toneInjection,
    reason,
    target: target.text as string,
    neighbors,
    facts: factsInput,
    assets: assetsInput,
  };
  if (topicPayload?.target_persona) scribeInput.target_persona = topicPayload.target_persona;

  const out = await scribe(scribeInput);

  // 5) 그 행만 update(kind/payload 정규화). run_id+id 스코프.
  const { kind, payload } = normalizeSegmentPayload(out.kind, out.payload);
  const { error: ue } = await supa
    .from("script_segments")
    .update({ text: out.text, kind, payload: payload as Json | null })
    .eq("run_id", runId)
    .eq("id", segmentId);
  if (ue) throw new Error(`세그먼트 update 실패: ${ue.message}`);

  // 6) lineage 재설정 = 그 세그먼트 것만(.eq segment_id). delete 후 매핑 재insert(범위 밖 idx 무시·dedup).
  await supa.from("script_segment_facts").delete().eq("segment_id", segmentId);
  await supa.from("script_segment_explanation_assets").delete().eq("segment_id", segmentId);

  const factLinks: { segment_id: string; fact_id: string }[] = [];
  const seenFact = new Set<string>();
  for (const fi of out.used_fact_idxs ?? []) {
    const f = facts[fi];
    if (!f) continue; // 범위 밖 무시
    if (seenFact.has(f.id)) continue; // dedup
    seenFact.add(f.id);
    factLinks.push({ segment_id: segmentId, fact_id: f.id });
  }
  const assetLinks: { segment_id: string; asset_id: string }[] = [];
  const seenAsset = new Set<string>();
  for (const ai of out.used_asset_idxs ?? []) {
    const a = assets[ai];
    if (!a) continue;
    if (seenAsset.has(a.id)) continue;
    seenAsset.add(a.id);
    assetLinks.push({ segment_id: segmentId, asset_id: a.id });
  }
  if (factLinks.length) {
    const { error } = await supa.from("script_segment_facts").insert(factLinks);
    if (error) throw new Error(`script_segment_facts insert 실패: ${error.message}`);
  }
  if (assetLinks.length) {
    const { error } = await supa.from("script_segment_explanation_assets").insert(assetLinks);
    if (error) throw new Error(`script_segment_explanation_assets insert 실패: ${error.message}`);
  }
  // ★ used_in_script 전체 리셋·표절검사·다른 세그먼트 재실행 없음(단일 세그먼트 스코프).
}
