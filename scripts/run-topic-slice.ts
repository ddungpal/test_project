// 파이프라인 슬라이스 통합 검증 — 요청→DB→agent→DB(proposed)→게이트를 단계마다 $0(claude-p)로 관통.
//   촉이→훅이→구다리 3단계를 연쇄 검증. Inngest 함수가 부르는 runProposalStage를 그대로 호출(durable 래퍼만 빠짐).
//
//   실행:
//     set -a; . ./.env; set +a
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/run-topic-slice.ts            # 실행+검증(데이터 남김)
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/run-topic-slice.ts --cleanup  # 끝나고 테스트 run 삭제

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.js";
import { loadConfig } from "../src/llm/config.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import { runProposalStage, type ProposalStageSpec } from "../src/pipeline/stageContract.js";
import { selectProposal } from "../src/pipeline/gate.js";
import { STAGE_DESCRIPTORS, type StageDescriptor } from "../src/pipeline/stages.js";
import { getRun, type Supa } from "../src/pipeline/runState.js";
import { topicStageSpec } from "../src/agents/topic_scout/stage.js";
import { hookStageSpec } from "../src/agents/hook_maker/stage.js";
import { structureStageSpec } from "../src/agents/structurer/stage.js";
import { runResearchCell } from "../src/pipeline/researchCell.js";
import { enterResearchReview, approveResearch } from "../src/pipeline/researchGate.js";
import { runScriptStage } from "../src/pipeline/scriptCell.js";
import { enterScriptReview, approveScript } from "../src/pipeline/scriptGate.js";

const CLEANUP = process.argv.includes("--cleanup");
const config = loadConfig();
const ledger = new InMemoryCostLedger();
const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`❌ ${msg}`);
  console.log(`  ✓ ${msg}`);
}

/** 한 제안 단계: 실행 → 검증 → 멱등 재실행 → 0번 선택. 반환 = 선택된 후보 payload. */
async function runAndSelect<TOut>(
  supa: Supa, runId: string, label: string, spec: ProposalStageSpec<TOut>, descriptor: StageDescriptor, minCandidates: number,
): Promise<unknown> {
  console.log(`\n🧠 [${label}] 단계 실행…`);
  const r = await runProposalStage(spec, { supa, config, costGuard, ledger });
  assert(!r.skipped, `${label}: 첫 실행 실제 제안`);
  assert(r.state === descriptor.proposedState, `${label}: state=${descriptor.proposedState}`);
  assert(r.candidates.length >= minCandidates, `${label}: 후보 ≥${minCandidates} (실제 ${r.candidates.length})`);
  assert(r.candidates.every((c) => c.evidence_ids.length >= 1), `${label}: 모든 후보 evidence_ids 보유`);
  r.candidates.forEach((c) => console.log(`    [${c.idx}] ${JSON.stringify(c.payload).slice(0, 90)}… · 근거 ${c.evidence_ids.slice(0, 3).join(",")}`));

  const r2 = await runProposalStage(spec, { supa, config, costGuard, ledger });
  assert(r2.skipped && r2.proposalId === r.proposalId && r2.costUsd === 0, `${label}: 멱등 재실행(재호출·재과금 0)`);

  const sel = await selectProposal(supa, descriptor, { runId, proposalId: r.proposalId, chosenIdx: 0, selectionReason: `[slice] ${label} 0번 채택` });
  assert(sel.state === descriptor.selectedState, `${label}: 선택 후 state=${descriptor.selectedState}`);
  return r.candidates[0]!.payload;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const supa = createClient<Database>(url, key, { auth: { persistSession: false } });

  // [Server Action 대역] content + run(created).
  const { data: content, error: ce } = await supa.from("contents").insert({ source: "produced", status: "in_production", topic: "[slice-test]" }).select("id").single();
  if (ce) throw new Error(`contents insert: ${ce.message}`);
  const { data: run, error: re } = await supa.from("production_runs").insert({ content_id: content.id }).select("id, state").single();
  if (re) throw new Error(`run insert: ${re.message}`);
  console.log(`▶ run 생성: ${run.id} (backend=${config.backend} · fixtures=${config.fixtures})`);
  assert(run.state === "created", "신규 run=created");

  const topic = await runAndSelect(supa, run.id, "촉이/주제", topicStageSpec(run.id), STAGE_DESCRIPTORS.topic, 3);
  console.log(`  → 선택된 주제: ${JSON.stringify(topic)}`);
  const title = await runAndSelect(supa, run.id, "훅이/제목·썸네일", hookStageSpec(run.id), STAGE_DESCRIPTORS.title_thumb, 3);
  console.log(`  → 선택된 제목: ${(title as { title?: string }).title}`);
  const structure = await runAndSelect(supa, run.id, "구다리/구성", structureStageSpec(run.id), STAGE_DESCRIPTORS.structure, 2);
  const outline = (structure as { outline?: { section: string }[] }).outline ?? [];
  console.log(`  → 선택된 구성: ${(structure as { approach?: string }).approach} · 섹션 ${outline.length}개`);

  // ── 셜록 셀(fan-out/join) ──
  console.log(`\n🔬 [셜록/리서치 셀] 실행(search=${process.env.SEARCH_BACKEND ?? "mock"})…`);
  const rc = await runResearchCell(run.id, { supa, config, costGuard, ledger });
  assert(!rc.skipped, "셜록: 첫 실행");
  assert(rc.state === "research_ready", "셜록 후 state=research_ready");
  assert(rc.factCount >= 1, `research_facts ≥1 (실제 ${rc.factCount})`);
  console.log(`    fact ${rc.factCount} · asset ${rc.assetCount} · 에스컬레이션 ${rc.escalatedCount} · 반론 missing=${rc.critic.missing.length}/counter=${rc.critic.counter_evidence.length}`);
  // DB에서 fact 검증 상태 분포 확인.
  const { data: factRows } = await supa.from("research_facts").select("claim, verification_status, source_tier, is_financial, citation_verified, escalated_to_human").eq("run_id", run.id);
  (factRows ?? []).forEach((f) => console.log(`      [${f.verification_status}/${f.source_tier ?? "-"}${f.is_financial ? "·금융" : ""}${f.escalated_to_human ? "·검수" : ""}] ${f.claim.slice(0, 60)}`));
  const { data: assetRows } = await supa.from("research_facts").select("id").eq("run_id", run.id).eq("verification_status", "verified");
  assert(Array.isArray(assetRows), "research_facts 조회 OK");
  // verified fact는 §5 합격 규칙(독립출처≥2·인용·금융→primary)을 만족해야 DB에 들어간다(CHECK 통과 = 강제됨).
  if (rc.critic.missing.length) console.log(`    🔍 반론 빠진 관점: ${rc.critic.missing.slice(0, 2).join(" / ")}`);

  // ── 트리아지 게이트(§11) ──
  console.log(`\n🙋 [리서치 검수] ready→review→approved (에스컬레이션 ${rc.escalatedCount}건 일괄 승인)…`);
  await enterResearchReview(supa, run.id);
  const ap = await approveResearch(supa, run.id, {});
  assert(ap.state === "research_approved", "승인 후 state=research_approved");
  console.log(`    승인 ${ap.approved}건 → human_approved=true`);

  // ── 짠펜 스크립트(최종 합류) ──
  console.log(`\n✍️  [짠펜/대본] 실행…`);
  const sc = await runScriptStage(run.id, { supa, config, costGuard, ledger });
  assert(!sc.skipped, "짠펜: 첫 실행");
  assert(!sc.reworkNeeded, "짠펜: freshness rework 불필요(facts fresh)");
  assert(sc.state === "script_ready", "짠펜 후 state=script_ready");
  assert(sc.segmentCount >= 3, `script_segments ≥3 (실제 ${sc.segmentCount})`);
  console.log(`    segment ${sc.segmentCount} · 표절포함도 max ${sc.plagiarismMax.toFixed(2)} · 플래그 ${sc.flaggedSegments}`);
  assert(sc.plagiarismMax < 0.6, `표절 가드: 코퍼스 복사 아님(max ${sc.plagiarismMax.toFixed(2)} < 0.6)`);
  // lineage 확인.
  const { count: lineageFacts } = await supa.from("script_segment_facts").select("*", { count: "exact", head: true });
  const { data: usedAssets } = await supa.from("explanation_assets").select("id").eq("run_id", run.id).eq("used_in_script", true);
  console.log(`    lineage: segment↔fact ${lineageFacts ?? 0}건 · 대본에 쓰인 asset ${usedAssets?.length ?? 0}건`);
  // 대본 미리보기(첫 2 segment).
  const { data: segs } = await supa.from("script_segments").select("ord, text").eq("run_id", run.id).order("ord").limit(2);
  (segs ?? []).forEach((s) => console.log(`      [${s.ord}] ${s.text.slice(0, 90)}…`));

  // ── 스크립트 검수 게이트 ──
  console.log(`\n🙋 [대본 검수] ready→review→approved…`);
  await enterScriptReview(supa, run.id);
  const ap2 = await approveScript(supa, run.id);
  assert(ap2.state === "approved", "승인 후 state=approved");

  const final = await getRun(supa, run.id);
  assert(final.state === "approved", "최종 state=approved");
  const { data: ledgerRows } = await supa.from("cost_ledger").select("detail").eq("run_id", run.id);
  console.log(`\n💰 cost_ledger ${ledgerRows?.length ?? 0}건 · run.cost_usd=$${final.cost_usd} (claude-p=$0)`);
  console.log(`\n✅ 전체 파이프라인 관통: created →[촉이]→[훅이]→[구다리]→[셜록]→research_approved →[짠펜]→ script_ready →[검수]→ approved`);

  if (CLEANUP) {
    const { error: de } = await supa.from("contents").delete().eq("id", content.id);
    if (de) throw new Error(`cleanup 실패: ${de.message}`);
    console.log(`🧹 테스트 데이터 삭제(content ${content.id} cascade)`);
  } else {
    console.log(`ℹ️ 테스트 데이터 보존(run ${run.id}). 삭제: --cleanup`);
  }
}

main().catch((e) => {
  console.error("\nslice 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
