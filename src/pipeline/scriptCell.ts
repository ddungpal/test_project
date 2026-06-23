// 짠펜 스크립트 단계 — 최종 합류점(§7·§12). 제안단계와 다른 골격(lineage 저장).
//   research_approved → scripting → [freshness 게이트 → callLLM(scribe) → 표절 가드 → segments+lineage 저장] → script_ready.
//   rework: 사용할 fact가 stale이면 scripting→researching 재진입(needs_research).

import type { CostGuard, InMemoryCostLedger } from "../llm/costGuard.js";
import type { LlmConfig } from "../llm/config.js";
import { getRun, transitionRun, setProgress, type Supa } from "./runState.js";
import { bumpRework, abortRun, MAX_REWORK, flushLedger } from "./runGuards.js";
import { getSelectedStagePayload, getToneProfile } from "./context.js";
import { buildCorpusShingles, containment, PLAGIARISM_THRESHOLD, PLAGIARISM_BLOCK_THRESHOLD } from "./scriptGuards.js";
import { scribeStep } from "../agents/scribe/step.js";

export interface ScriptStageDeps {
  supa: Supa;
  config: LlmConfig;
  costGuard: CostGuard;
  ledger?: InMemoryCostLedger;
}

export interface ScriptStageResult {
  runId: string;
  state: "script_ready" | "researching" | "aborted";
  segmentCount: number;
  plagiarismMax: number; // 0~1, 최대 표절 포함도
  flaggedSegments: number; // 임계 초과 segment 수
  reworkNeeded: boolean; // freshness stale → researching 재진입
  skipped: boolean;
}

export async function runScriptStage(runId: string, deps: ScriptStageDeps): Promise<ScriptStageResult> {
  const { supa, config, costGuard, ledger } = deps;
  const llm = { config, costGuard };
  const run = await getRun(supa, runId);

  // 0) 멱등: 이미 script_ready + segments 존재면 스킵.
  if (run.state === "script_ready") {
    const { count } = await supa.from("script_segments").select("*", { count: "exact", head: true }).eq("run_id", runId);
    if ((count ?? 0) > 0) return { runId, state: "script_ready", segmentCount: count ?? 0, plagiarismMax: 0, flaggedSegments: 0, reworkNeeded: false, skipped: true };
  }
  if (run.state !== "research_approved" && run.state !== "scripting") {
    throw new Error(`script 단계는 'research_approved'(또는 재개 'scripting')에서만(현재 '${run.state}').`);
  }
  if (run.state === "research_approved") await transitionRun(supa, runId, "research_approved", "scripting");

  // 1) 컨텍스트.
  const { data: runRow, error: re } = await supa.from("production_runs").select("content_id").eq("id", runId).single();
  if (re) throw new Error(`run content_id 조회 실패: ${re.message}`);
  const contentId = runRow.content_id;
  const structure = await getSelectedStagePayload(supa, runId, "structure");
  const tone = await getToneProfile(supa);

  // 사용 가능 fact = 사람 승인됨 OR 자동통과(verified·비에스컬레이션).
  const { data: factRows, error: fe } = await supa
    .from("research_facts")
    .select("id, claim, verification_status, is_financial, freshness, quote_excerpt, recheck_after, human_approved, escalated_to_human")
    .eq("run_id", runId);
  if (fe) throw new Error(`research_facts 조회 실패: ${fe.message}`);
  const usable = (factRows ?? []).filter((f) => f.human_approved === true || (f.escalated_to_human === false && f.verification_status === "verified"));

  // 1b) freshness 게이트(§12) — 사용할 fact 중 stale이 있으면 rework(needs_research).
  const stale = usable.filter((f) => f.freshness === "stale" || (f.recheck_after && new Date(f.recheck_after).getTime() < Date.now()));
  if (stale.length) {
    // max_rework 가드(반장 마감): 상한 초과면 무한 rework 대신 중단.
    const rw = await bumpRework(supa, runId);
    if (rw.exceeded) {
      await abortRun(supa, runId, `max_rework(${MAX_REWORK}) 초과 — stale fact 반복(${stale.length}건)`);
      return { runId, state: "aborted", segmentCount: 0, plagiarismMax: 0, flaggedSegments: 0, reworkNeeded: true, skipped: false };
    }
    await transitionRun(supa, runId, "scripting", "researching"); // rework 재진입
    return { runId, state: "researching", segmentCount: 0, plagiarismMax: 0, flaggedSegments: 0, reworkNeeded: true, skipped: false };
  }

  const { data: assetRows, error: ae } = await supa
    .from("explanation_assets")
    .select("id, concept, kind, numeric_example, analogy, math_verified, distortion_checked")
    .eq("run_id", runId);
  if (ae) throw new Error(`explanation_assets 조회 실패: ${ae.message}`);
  // ★ 코드리뷰 P0(money-safety): 검증 안 된 자산은 대본에 안 넣는다.
  //   숫자=math_verified(코드 검산 통과)만, 비유=distortion_checked(왜곡 점검 완료)만.
  const assets = (assetRows ?? []).filter((a) => (a.kind === "number" ? a.math_verified === true : a.distortion_checked === true));

  // 2) callLLM(짠펜) — 인덱스로 fact/asset 참조(lineage 매핑용).
  // ★ 코드리뷰 P1(money-safety): 미검증 fact는 단정 금지 라벨을 명시적으로 붙여 전달(프롬프트만 의존 X).
  const factsInput = usable.map((f, idx) => ({
    idx,
    claim: f.claim,
    verification_status: f.verification_status,
    is_financial: f.is_financial,
    caution: f.verification_status === "verified" ? null : "미검증 — 단정 금지, 일반 원리로만 설명",
  }));
  const assetsInput = assets.map((a, idx) => ({ idx, concept: a.concept, kind: a.kind, numeric_example: a.numeric_example, analogy: a.analogy }));
  await setProgress(supa, runId, "1/2·대본 작성 (짠펜)");
  const scribe = await scribeStep(llm, runId, { tone: tone?.components ?? null, outline: structure, facts: factsInput, assets: assetsInput });
  const segments = [...scribe.segments].sort((a, b) => a.ord - b.ord);

  // 3) 표절 가드 — 코퍼스 대비 포함도.
  await setProgress(supa, runId, "2/2·표절 검사");
  const { data: corpus } = await supa.from("corpus_components").select("content").eq("type", "script");
  const corpusShingles = buildCorpusShingles((corpus ?? []).map((c) => c.content));
  let plagiarismMax = 0;
  let flaggedSegments = 0;
  const scored = segments.map((s) => {
    const score = containment(s.text, corpusShingles);
    plagiarismMax = Math.max(plagiarismMax, score);
    if (score >= PLAGIARISM_THRESHOLD) flaggedSegments++;
    return score;
  });
  // ★ 코드리뷰 P1: 표절 가드 강제 — '거의 복사'(하드 임계 초과)면 저장 없이 중단(과거 대본 복붙 방지).
  if (plagiarismMax >= PLAGIARISM_BLOCK_THRESHOLD) {
    await abortRun(supa, runId, `표절 의심: 포함도 ${plagiarismMax.toFixed(2)} ≥ ${PLAGIARISM_BLOCK_THRESHOLD}(과거 대본 거의 복사)`);
    return { runId, state: "aborted", segmentCount: segments.length, plagiarismMax, flaggedSegments, reworkNeeded: false, skipped: false };
  }
  // (소프트 플래그 flaggedSegments는 사람 검수 게이트에서 확인 — script_review)

  // 4) 저장(재개 멱등: 기존 segments/lineage 제거 후 재삽입). lineage cascade로 함께 삭제됨.
  await supa.from("script_segments").delete().eq("run_id", runId);
  const segRows = segments.map((s, i) => ({ content_id: contentId, run_id: runId, ord: i, text: s.text }));
  const { data: inserted, error: se } = await supa.from("script_segments").insert(segRows).select("id, ord");
  if (se) throw new Error(`script_segments insert 실패: ${se.message}`);
  const idByOrd = new Map((inserted ?? []).map((r) => [r.ord, r.id]));

  // lineage: segment ↔ fact / asset (인덱스 → id, 범위 검증 + 중복 제거).
  // ★ 코드리뷰 P1: 범위 밖 idx는 무시, 중복 (segment,fact)/(segment,asset)는 dedup(조인 PK 충돌 방지).
  const factLinks: { segment_id: string; fact_id: string }[] = [];
  const assetLinks: { segment_id: string; asset_id: string }[] = [];
  const usedAssetIds = new Set<string>();
  const seenFactLink = new Set<string>();
  const seenAssetLink = new Set<string>();
  segments.forEach((s, i) => {
    const segId = idByOrd.get(i);
    if (!segId) return;
    for (const fi of s.used_fact_idxs) {
      const f = usable[fi];
      if (!f) continue;
      const key = `${segId}:${f.id}`;
      if (seenFactLink.has(key)) continue;
      seenFactLink.add(key);
      factLinks.push({ segment_id: segId, fact_id: f.id });
    }
    for (const ai of s.used_asset_idxs) {
      const a = assets[ai];
      if (!a) continue;
      const key = `${segId}:${a.id}`;
      if (seenAssetLink.has(key)) continue;
      seenAssetLink.add(key);
      assetLinks.push({ segment_id: segId, asset_id: a.id });
      usedAssetIds.add(a.id);
    }
  });
  if (factLinks.length) {
    const { error } = await supa.from("script_segment_facts").insert(factLinks);
    if (error) throw new Error(`script_segment_facts insert 실패: ${error.message}`);
  }
  if (assetLinks.length) {
    const { error } = await supa.from("script_segment_explanation_assets").insert(assetLinks);
    if (error) throw new Error(`script_segment_explanation_assets insert 실패: ${error.message}`);
  }
  // 재개 멱등(코드리뷰 P2): 이 run의 used_in_script를 먼저 리셋 → 이번에 실제로 쓰인 것만 true(이전 시도 stale 제거).
  await supa.from("explanation_assets").update({ used_in_script: false }).eq("run_id", runId).eq("used_in_script", true);
  if (usedAssetIds.size) {
    await supa.from("explanation_assets").update({ used_in_script: true }).in("id", [...usedAssetIds]);
  }

  // 5) cost_ledger flush(전이 전) + 이 단계 실비(코드리뷰 P0: ledger 합, spentUsd 이중계산 회피).
  const stageCost = await flushLedger(supa, runId, ledger);

  // 6) 전이 마지막. 누계 = 이전 + 이 단계.
  await setProgress(supa, runId, null); // 단계 완료 → 서브진행 표시 해제.
  await transitionRun(supa, runId, "scripting", "script_ready", { cost_usd: run.cost_usd + stageCost });

  void scored;
  return { runId, state: "script_ready", segmentCount: segments.length, plagiarismMax, flaggedSegments, reworkNeeded: false, skipped: false };
}
