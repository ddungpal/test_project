// 짠펜 스크립트 단계 — 최종 합류점(§7·§12). 제안단계와 다른 골격(lineage 저장).
//   research_approved → scripting → [freshness 게이트 → callLLM(scribe) → 표절 가드 → segments+lineage 저장] → script_ready.
//   rework: 사용할 fact가 stale이면 scripting→researching 재진입(needs_research).

import type { CostGuard, InMemoryCostLedger } from "../llm/costGuard.js";
import type { LlmConfig } from "../llm/config.js";
import { getRun, transitionRun, setProgress, type Supa } from "./runState.js";
import { bumpRework, abortRun, MAX_REWORK, flushLedger } from "./runGuards.js";
import { getSelectedStagePayload, getToneProfile } from "./context.js";
import { buildCorpusShingles, containment, PLAGIARISM_THRESHOLD, PLAGIARISM_BLOCK_THRESHOLD } from "./scriptGuards.js";
import { parseAxStages, resolveToneInjection } from "./axFlag.js";
import { scribeStep, scribeSectionStep } from "../agents/scribe/step.js";
import type { ScriptSegmentOut } from "../agents/scribe/schema.js";
import { buildPriorTail } from "../lib/scribe/priorTail.js";
import { normalizeSegmentPayload } from "./segmentBlock.js";
import { isAssetUsable, buildAssetsInput, type AssetRowForScribe } from "./comparisonAsset.js";
import { isFactUsableForScript } from "./scriptFactEligibility.js";
import type { Json } from "../lib/supabase/database.types.js";

// 섹션 격리 생성 시 다음 섹션에 넘길 연속성 꼬리 길이(직전 대본 끝부분 최대 문자 수).
const PRIOR_TAIL_CHARS = 500;

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
  // target_persona(전파): 선택된 주제 payload에 실린 시청 대상 한 줄 — 있으면 짠펜에 전달(조건부). edited_payload 우선 반환이라 사람 수정본이 흐른다.
  const topicPayload = await getSelectedStagePayload(supa, runId, "topic") as { target_persona?: string } | null;
  const tone = await getToneProfile(supa);

  // 사용 가능 fact = 명시 반려(human_approved=false)만 배제(= true·null 허용).
  //   ★ autoflow(§B·§D): 고위험 fact는 중간 검수 없이 human_approved=null(보류)로 운반되어 본문에 들어가야
  //     Phase 2 최종검수가 채워진다. 적격성 술어는 scriptFactEligibility의 순수함수로 추출(단위테스트·Phase 2 재사용).
  const { data: factRows, error: fe } = await supa
    .from("research_facts")
    .select("id, claim, verification_status, is_financial, freshness, quote_excerpt, recheck_after, human_approved, escalated_to_human")
    .eq("run_id", runId);
  if (fe) throw new Error(`research_facts 조회 실패: ${fe.message}`);
  const usable = (factRows ?? []).filter((f) => isFactUsableForScript(f));

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
    .select("id, concept, kind, numeric_example, analogy, math_verified, distortion_checked, payload")
    .eq("run_id", runId);
  if (ae) throw new Error(`explanation_assets 조회 실패: ${ae.message}`);
  // ★ 코드리뷰 P0(money-safety): 검증 안 된 자산은 대본에 안 넣는다(isAssetUsable 순수 게이트).
  //   숫자=math_verified(코드 검산 통과)만, 비유=distortion_checked(왜곡 점검 완료)만,
  //   비교=normalizeComparison 유효(구조 깨진 비교는 표로 박제 금지). 게이트 통과 순서가 lineage(assets[ai]) 인덱스.
  const assets = (assetRows ?? []).filter((a) => isAssetUsable(a as AssetRowForScribe));

  // 2) callLLM(짠펜) — 인덱스로 fact/asset 참조(lineage 매핑용).
  // ★ 코드리뷰 P1(money-safety): 미검증 fact는 단정 금지 라벨을 명시적으로 붙여 전달(프롬프트만 의존 X).
  const factsInput = usable.map((f, idx) => ({
    idx,
    claim: f.claim,
    verification_status: f.verification_status,
    is_financial: f.is_financial,
    caution: f.verification_status === "verified" ? null : "미검증 — 단정 금지, 일반 원리로만 설명",
  }));
  // ★ comparison 자산은 payload(정규화된 entities/dimensions/cells)를 함께 전달 — 짠펜이 검증 데이터로 표를 만든다.
  //   number/analogy는 기존 모양 그대로(payload 미포함). assets는 이미 게이트 통과분이라 인덱스가 lineage와 일치.
  const assetsInput = buildAssetsInput(assets as AssetRowForScribe[]);
  await setProgress(supa, runId, "1/2·대본 작성 (짠펜)");
  // AX 단계 전환(§14): 기본(AX_STAGES 미설정)=빈 Set → tone?.components ?? null 그대로(바이트 불변·픽스처 보존).
  const toneInjection = resolveToneInjection("script", tone?.components ?? null, parseAxStages());
  const scribeInput: { tone: unknown; outline: unknown; facts: unknown; assets: unknown; target_persona?: string } = { tone: toneInjection, outline: structure, facts: factsInput, assets: assetsInput };
  // persona 있을 때만 키 포함(없으면 scribeStep input/system 바이트 불변 → promptHash 보존).
  if (topicPayload?.target_persona) scribeInput.target_persona = topicPayload.target_persona;
  // ★ 섹션 격리 생성(가설): outline 섹션을 하나씩 격리 생성하면 경쟁 섹션이 없어
  //   dev(claude-p, maxTokens 미사용) 천장 아래에서 섹션당 더 길게 전개된다 → 총 분량 증가.
  //   outline이 없으면(구조 방어) 기존 단발 scribeStep 경로로 폴백(회귀 안전).
  //   facts/assets 인덱스는 '전역'을 각 섹션 호출에 그대로 넘긴다(로컬 재인덱싱 금지 — lineage 일관).
  const sections = Array.isArray((structure as { outline?: unknown } | null)?.outline)
    ? (structure as { outline: unknown[] }).outline
    : [];

  let allSegments: ScriptSegmentOut[];
  if (sections.length === 0) {
    // 폴백: outline 없으면 기존 단발 경로(scribeStep) 유지 — 회귀 안전.
    const scribe = await scribeStep(llm, runId, scribeInput);
    allSegments = [...scribe.segments].sort((a, b) => a.ord - b.ord);
  } else {
    allSegments = [];
    for (let i = 0; i < sections.length; i++) {
      const prior_tail = buildPriorTail(allSegments, PRIOR_TAIL_CHARS);
      const res = await scribeSectionStep(llm, runId, {
        tone: toneInjection,
        section: sections[i],
        sectionIndex: i,
        totalSections: sections.length,
        prior_tail,
        facts: factsInput, // 전역 인덱스 유지(lineage 일관)
        assets: assetsInput, // 전역 인덱스 유지
        ...(scribeInput.target_persona ? { target_persona: scribeInput.target_persona } : {}),
      });
      allSegments.push(...res.segments);
      await setProgress(supa, runId, `1/2·대본 작성 (짠펜 ${i + 1}/${sections.length})`);
    }
  }
  // 전역 ord 재부여(섹션별 상대 ord를 무시하고 순서대로).
  allSegments = allSegments.map((s, idx) => ({ ...s, ord: idx }));
  // 이후 표절 가드·저장·lineage 로직은 동일한 세그먼트 배열 형태를 소비한다(별칭으로 최소 diff).
  const segments = allSegments;

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
  const segRows = segments.map((s, i) => {
    const { kind, payload } = normalizeSegmentPayload(s.kind, s.payload);
    // payload는 명시 필드만 가진 정규화 결과(table/case/visual) — jsonb 컬럼에 그대로 적재(Json 단언).
    return { content_id: contentId, run_id: runId, ord: i, text: s.text, kind, payload: payload as Json | null };
  });
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
