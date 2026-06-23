// 골든 A/B — 짠펜(scribe) 말투 비교: Opus 4.8(claude-p·구독 $0) vs GPT-5.5(openai·종량·하드캡 $3).
//   동일한 짠펜 입력(tone/outline/facts/assets)을 두 모델에 먹여 대본을 받아 '블라인드'로 비교한다.
//   판정: 사람(김짠부)이 모델 가린 채 A/B 대본을 읽고 선택(원칙: "김짠부는 선택만"). 비용·지연·모델명은
//   누출 방지를 위해 블라인드 칼럼에 노출하지 않고 reveal 섹션에만 둔다.
//
// 사용(set -a; . ./.env; set +a 로 env 로드 후):
//   1) 준비: 기존 런 재사용 + 파이프라인으로 추가 런 생성(research_approved까지, claude-p $0)
//      npx tsx scripts/golden-ab.ts prepare --reuse <run-uuid> --new 2
//   2) 실행: 매니페스트의 런들에 Opus vs GPT 짠펜 A/B → corpus/golden-ab/{results.json,ab.html}
//      LLM_FIXTURES=off npx tsx scripts/golden-ab.ts run
//   3) 정리: prepare가 만든 테스트 런 삭제(--reuse 런은 보존)
//      npx tsx scripts/golden-ab.ts cleanup

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "../src/lib/supabase/database.types.js";
import { loadConfig, type LlmConfig } from "../src/llm/config.js";
import { CostGuard } from "../src/llm/costGuard.js";
import { callLLM } from "../src/llm/callLLM.js";
import { SCRIBE_SCHEMA, SCRIBE_SYSTEM, type ScribeOutput } from "../src/agents/scribe/schema.js";
import { getSelectedStagePayload, getToneProfile } from "../src/pipeline/context.js";
import { buildCorpusShingles, containment } from "../src/pipeline/scriptGuards.js";
import { runProposalStage, type ProposalStageSpec } from "../src/pipeline/stageContract.js";
import { selectProposal } from "../src/pipeline/gate.js";
import { STAGE_DESCRIPTORS, type StageDescriptor } from "../src/pipeline/stages.js";
import { getRun, type Supa } from "../src/pipeline/runState.js";
import { topicStageSpec } from "../src/agents/topic_scout/stage.js";
import { hookStageSpec } from "../src/agents/hook_maker/stage.js";
import { structureStageSpec } from "../src/agents/structurer/stage.js";
import { runResearchCell } from "../src/pipeline/researchCell.js";
import { enterResearchReview, approveResearch } from "../src/pipeline/researchGate.js";

const OUT_DIR = join(process.cwd(), "corpus", "golden-ab");
const MANIFEST = join(OUT_DIR, "manifest.json");
const GPT_HARD_CAP = Number(process.env.GOLDEN_AB_CAP_USD ?? "3");

interface ManifestRun {
  runId: string;
  prepared: boolean; // true = 이 하니스가 만든 테스트 런(cleanup 대상), false = 재사용
  contentId?: string;
  topicLabel?: string;
}
interface Manifest {
  runs: ManifestRun[];
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST)) return { runs: [] };
  return JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
}
function saveManifest(m: Manifest): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2), "utf8");
}

function supaClient(): Supa {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  return createClient<Database>(url, key, { auth: { persistSession: false } }) as unknown as Supa;
}

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// ── 짠펜 입력 수집(scriptCell.ts의 컨텍스트 로딩을 그대로 미러; lineage 불필요) ──
interface ScribeInput {
  tone: unknown;
  outline: unknown;
  facts: { idx: number; claim: string; verification_status: string; is_financial: boolean; caution: string | null }[];
  assets: { idx: number; concept: string; kind: string; numeric_example: string | null; analogy: string | null }[];
}

async function gatherScribeInput(supa: Supa, runId: string): Promise<ScribeInput> {
  const structure = await getSelectedStagePayload(supa, runId, "structure");
  const tone = await getToneProfile(supa);
  const { data: factRows } = await supa
    .from("research_facts")
    .select("claim, verification_status, is_financial, human_approved, escalated_to_human")
    .eq("run_id", runId);
  const usable = (factRows ?? []).filter(
    (f) => f.human_approved === true || (f.escalated_to_human === false && f.verification_status === "verified"),
  );
  const { data: assetRows } = await supa
    .from("explanation_assets")
    .select("concept, kind, numeric_example, analogy, math_verified, distortion_checked")
    .eq("run_id", runId);
  const assets = (assetRows ?? []).filter((a) => (a.kind === "number" ? a.math_verified === true : a.distortion_checked === true));

  return {
    tone: tone?.components ?? null,
    outline: structure,
    facts: usable.map((f, idx) => ({
      idx,
      claim: f.claim,
      verification_status: f.verification_status,
      is_financial: f.is_financial,
      caution: f.verification_status === "verified" ? null : "미검증 — 단정 금지, 일반 원리로만 설명",
    })),
    assets: assets.map((a, idx) => ({
      idx,
      concept: a.concept,
      kind: a.kind,
      numeric_example: a.numeric_example ?? null,
      analogy: a.analogy ?? null,
    })),
  };
}

// ── 한 모델로 짠펜 1회 호출 ──
interface ScribeRunResult {
  model: "opus" | "gpt";
  backend: "claude-p" | "openai";
  segments: { ord: number; text: string }[];
  totalChars: number;
  plagiarismMax: number;
  costUsd: number;
  latencyMs: number;
  inTok: number;
  outTok: number;
}

async function scribeOnce(
  baseConfig: LlmConfig,
  runId: string,
  input: ScribeInput,
  corpusShingles: Set<string>,
  which: "opus" | "gpt",
): Promise<ScribeRunResult> {
  const backend = which === "opus" ? ("claude-p" as const) : ("openai" as const);
  const config: LlmConfig = { ...baseConfig, backend, fixtures: "off" };
  // GPT는 하드캡($3)으로 보호. Opus(claude-p)는 $0 → 캡 무의미하지만 동일 구조 유지.
  const costGuard = new CostGuard({
    softCapUsd: which === "gpt" ? GPT_HARD_CAP : 1000,
    hardCapUsd: which === "gpt" ? GPT_HARD_CAP : 1000,
  });
  const res = await callLLM<ScribeOutput>(
    // model:"opus"를 양쪽 동일하게 전달 → 프롬프트(promptHash) 동일·공정. openai 드라이버는 티어 무시, OPENAI_MODEL 사용.
    { roleId: "scribe", system: SCRIBE_SYSTEM, input, schema: SCRIBE_SCHEMA, runId, maxTokens: 8192, model: "opus" },
    { config, costGuard },
  );
  const segments = [...res.data.segments].sort((a, b) => a.ord - b.ord).map((s) => ({ ord: s.ord, text: s.text }));
  let plagiarismMax = 0;
  for (const s of segments) plagiarismMax = Math.max(plagiarismMax, containment(s.text, corpusShingles));
  return {
    model: which,
    backend,
    segments,
    totalChars: segments.reduce((n, s) => n + s.text.length, 0),
    plagiarismMax,
    costUsd: res.costUsd,
    latencyMs: res.latencyMs,
    inTok: res.usage.inTok,
    outTok: res.usage.outTok,
  };
}

// ── prepare: 파이프라인으로 런을 research_approved까지 ──
async function runAndSelect<TOut>(
  supa: Supa,
  config: LlmConfig,
  runId: string,
  label: string,
  spec: ProposalStageSpec<TOut>,
  descriptor: StageDescriptor,
  chosenIdx: number,
): Promise<unknown> {
  const guard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd });
  const r = await runProposalStage(spec, { supa, config, costGuard: guard });
  const idx = Math.min(chosenIdx, r.candidates.length - 1);
  const sel = await selectProposal(supa, descriptor, {
    runId,
    proposalId: r.proposalId,
    chosenIdx: idx,
    selectionReason: `[golden-ab] ${label} ${idx}번 채택`,
  });
  if (sel.state !== descriptor.selectedState) throw new Error(`${label} 선택 실패: state=${sel.state}`);
  return r.candidates[idx]?.payload ?? null;
}

async function prepareOneRun(supa: Supa, config: LlmConfig, topicIdx: number): Promise<ManifestRun> {
  const { data: content, error: ce } = await supa
    .from("contents")
    .insert({ source: "produced", status: "in_production", topic: "[golden-ab]" })
    .select("id")
    .single();
  if (ce) throw new Error(`contents insert: ${ce.message}`);
  const { data: run, error: re } = await supa.from("production_runs").insert({ content_id: content.id }).select("id").single();
  if (re) throw new Error(`run insert: ${re.message}`);
  console.log(`  ▶ run ${run.id.slice(0, 8)} 생성(topic idx=${topicIdx})…`);

  const topic = await runAndSelect(supa, config, run.id, "촉이", topicStageSpec(run.id), STAGE_DESCRIPTORS.topic, topicIdx);
  const topicLabel = JSON.stringify(topic).slice(0, 80);
  console.log(`     주제: ${topicLabel}`);
  await runAndSelect(supa, config, run.id, "훅이", hookStageSpec(run.id), STAGE_DESCRIPTORS.title_thumb, 0);
  await runAndSelect(supa, config, run.id, "구다리", structureStageSpec(run.id), STAGE_DESCRIPTORS.structure, 0);
  const guard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd });
  const rc = await runResearchCell(run.id, { supa, config, costGuard: guard });
  console.log(`     셜록: fact ${rc.factCount} · asset ${rc.assetCount} · 에스컬레이션 ${rc.escalatedCount}`);
  try {
    await enterResearchReview(supa, run.id);
    const ap = await approveResearch(supa, run.id, {});
    if (ap.state !== "research_approved") throw new Error(`research 승인 실패: ${ap.state}`);
    console.log(`     ✓ research_approved (승인 ${ap.approved}건)`);
  } catch (e) {
    // 낙관적 전이가 네트워크 재시도로 0행 보고될 수 있음(상태는 실제로 전이됨) → 실제 상태 재확인.
    const cur = await getRun(supa, run.id);
    if (cur.state !== "research_approved") throw e;
    console.log(`     ✓ research_approved (전이 경합 무시 — 실제 상태 확인)`);
  }
  return { runId: run.id, prepared: true, contentId: content.id, topicLabel };
}

async function cmdPrepare(): Promise<void> {
  const supa = supaClient();
  const config = loadConfig();
  const m = loadManifest();
  const reuse = getFlag("--reuse");
  const newCount = Number(getFlag("--new") ?? "0");

  if (reuse && !m.runs.some((r) => r.runId === reuse)) {
    // 재사용 런 라벨(주제) 조회.
    const { data: rr } = await supa.from("production_runs").select("content_id").eq("id", reuse).single();
    let topicLabel = "(재사용)";
    if (rr) {
      const t = await getSelectedStagePayload(supa, reuse, "topic");
      if (t) topicLabel = JSON.stringify(t).slice(0, 80);
    }
    m.runs.push({ runId: reuse, prepared: false, topicLabel });
    console.log(`♻️  재사용 런 추가: ${reuse.slice(0, 8)} · ${topicLabel}`);
  }

  const idxOverride = getFlag("--idx");
  for (let i = 0; i < newCount; i++) {
    // 다양성: 재사용(idx0)과 겹치지 않게 topic idx를 1,2,… 로(--idx로 고정 가능).
    const topicIdx = idxOverride !== undefined ? Number(idxOverride) : i + 1;
    const run = await prepareOneRun(supa, config, topicIdx);
    m.runs.push(run);
    saveManifest(m);
  }
  saveManifest(m);
  console.log(`\n✅ prepare 완료 — 매니페스트 런 ${m.runs.length}개. 다음: npx tsx scripts/golden-ab.ts run`);
}

// ── run: A/B 실행 + HTML ──
async function cmdRun(): Promise<void> {
  const supa = supaClient();
  const config = loadConfig();
  const m = loadManifest();
  if (!m.runs.length) throw new Error("매니페스트가 비어있음 — 먼저 prepare 실행.");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 미설정 — GPT 쪽 호출 불가.");

  const { data: corpus } = await supa.from("corpus_components").select("content").eq("type", "script");
  const corpusShingles = buildCorpusShingles((corpus ?? []).map((c) => c.content));

  const editions: EditionResult[] = [];
  for (const mr of m.runs) {
    console.log(`\n🎬 [${mr.runId.slice(0, 8)}] ${mr.topicLabel ?? ""}`);
    const input = await gatherScribeInput(supa, mr.runId);
    if (!input.facts.length) {
      console.log(`  ⚠️ 사용 가능 fact 0 — 건너뜀`);
      continue;
    }
    console.log(`  입력: fact ${input.facts.length} · asset ${input.assets.length}`);
    console.log(`  Opus(claude-p) 호출…`);
    const opus = await scribeOnce(config, mr.runId, input, corpusShingles, "opus");
    console.log(`     segment ${opus.segments.length} · ${opus.totalChars}자 · 표절 ${opus.plagiarismMax.toFixed(2)}`);
    console.log(`  GPT-5.5(openai) 호출…`);
    const gpt = await scribeOnce(config, mr.runId, input, corpusShingles, "gpt");
    console.log(`     segment ${gpt.segments.length} · ${gpt.totalChars}자 · 표절 ${gpt.plagiarismMax.toFixed(2)} · $${gpt.costUsd}`);

    // 블라인드: A/B 라벨을 무작위 배정(스크립트라 Math.random 허용).
    const opusIsA = Math.random() < 0.5;
    editions.push({
      runId: mr.runId,
      topicLabel: mr.topicLabel ?? "",
      factCount: input.facts.length,
      assetCount: input.assets.length,
      A: opusIsA ? opus : gpt,
      B: opusIsA ? gpt : opus,
    });
  }

  if (!editions.length) throw new Error("A/B 가능한 편이 없음(모두 fact 0).");

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "results.json"), JSON.stringify(editions, null, 2), "utf8");
  const html = renderHtml(editions);
  writeFileSync(join(OUT_DIR, "ab.html"), html, "utf8");
  const totalGpt = editions.reduce((n, e) => n + (e.A.model === "gpt" ? e.A.costUsd : e.B.costUsd), 0);
  console.log(`\n✅ run 완료 — ${editions.length}편 A/B. GPT 실비 합계 ≈ $${totalGpt.toFixed(4)} (캡 $${GPT_HARD_CAP})`);
  console.log(`   결과: ${join(OUT_DIR, "ab.html")} (브라우저로 열어 블라인드 비교)`);
}

interface EditionResult {
  runId: string;
  topicLabel: string;
  factCount: number;
  assetCount: number;
  A: ScribeRunResult;
  B: ScribeRunResult;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderColumn(label: string, r: ScribeRunResult): string {
  // 블라인드: 모델·비용·지연은 노출하지 않는다. 누출 없는 중립 지표만.
  const segs = r.segments.map((s) => `<p class="seg"><span class="ord">${s.ord}</span>${esc(s.text)}</p>`).join("\n");
  return `<div class="col">
    <h3>후보 ${label}</h3>
    <div class="meta">단락 ${r.segments.length} · ${r.totalChars}자 · 코퍼스 포함도 ${r.plagiarismMax.toFixed(2)}</div>
    <div class="script">${segs}</div>
  </div>`;
}

function renderHtml(editions: EditionResult[]): string {
  const blocks = editions
    .map((e, i) => {
      const reveal = `편 ${i + 1}: 후보 A = ${e.A.model.toUpperCase()}(${e.A.backend}, $${e.A.costUsd}, ${e.A.latencyMs}ms, in ${e.A.inTok}/out ${e.A.outTok}) · 후보 B = ${e.B.model.toUpperCase()}(${e.B.backend}, $${e.B.costUsd}, ${e.B.latencyMs}ms, in ${e.B.inTok}/out ${e.B.outTok})`;
      return `<section class="edition">
        <h2>편 ${i + 1} <span class="topic">${esc(e.topicLabel)}</span></h2>
        <div class="subtle">입력: 사실 ${e.factCount} · 자료 ${e.assetCount} · 동일 입력을 두 모델에 전달</div>
        <div class="cols">${renderColumn("A", e.A)}${renderColumn("B", e.B)}</div>
        <details class="reveal"><summary>정답 공개(선택 후 클릭)</summary><div class="reveal-body">${esc(reveal)}</div></details>
      </section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>골든 A/B — 짠펜 말투 비교 (블라인드)</title>
<style>
  :root { --bg:#121212; --fg:#fff; --accent:#F8F082; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif; line-height:1.7; }
  .wrap { max-width:1200px; margin:0 auto; padding:32px 24px 80px; }
  h1 { color:var(--accent); font-size:28px; margin:0 0 6px; }
  .lede { color:#bbb; margin:0 0 28px; }
  .edition { border-top:2px solid #333; padding-top:24px; margin-top:32px; }
  h2 { font-size:20px; margin:0 0 4px; }
  .topic { color:#888; font-weight:400; font-size:14px; }
  .subtle { color:#888; font-size:13px; margin-bottom:16px; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  .col { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:8px; padding:18px; }
  .col h3 { color:var(--accent); margin:0 0 4px; font-size:16px; }
  .meta { color:#777; font-size:12px; margin-bottom:14px; border-bottom:1px solid #2a2a2a; padding-bottom:10px; }
  .seg { margin:0 0 12px; }
  .ord { display:inline-block; min-width:22px; color:#555; font-size:12px; margin-right:6px; vertical-align:top; }
  .reveal { margin-top:14px; }
  .reveal summary { cursor:pointer; color:var(--accent); font-size:13px; }
  .reveal-body { color:#aaa; font-size:13px; margin-top:8px; font-family:ui-monospace,monospace; }
  @media (max-width:760px){ .cols{ grid-template-columns:1fr; } }
</style></head>
<body><div class="wrap">
  <h1>골든 A/B — 짠펜 말투 비교</h1>
  <p class="lede">같은 입력(구성·사실·자료)을 두 모델에 먹여 받은 대본입니다. <b>모델은 가려져 있습니다.</b> 편마다 김짠부 말투에 더 가깝고 자연스러운 쪽(A 또는 B)을 고른 뒤, 맨 아래 '정답 공개'를 여세요.</p>
  ${blocks}
</div></body></html>`;
}

async function cmdCleanup(): Promise<void> {
  const supa = supaClient();
  const m = loadManifest();
  let deleted = 0;
  for (const r of m.runs) {
    if (!r.prepared || !r.contentId) continue;
    const { error } = await supa.from("contents").delete().eq("id", r.contentId);
    if (error) console.log(`  ⚠️ ${r.runId.slice(0, 8)} 삭제 실패: ${error.message}`);
    else deleted++;
  }
  m.runs = m.runs.filter((r) => !r.prepared); // 재사용 런만 매니페스트에 남김
  saveManifest(m);
  console.log(`🧹 cleanup — prepared 런 ${deleted}개 삭제(재사용 런 보존).`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "prepare") await cmdPrepare();
  else if (cmd === "run") await cmdRun();
  else if (cmd === "cleanup") await cmdCleanup();
  else {
    console.log("사용: golden-ab.ts <prepare|run|cleanup>");
    console.log("  prepare --reuse <run-uuid> --new <N>   준비(재사용 + 신규 N편 파이프라인)");
    console.log("  run                                     Opus vs GPT 짠펜 A/B → corpus/golden-ab/ab.html");
    console.log("  cleanup                                 prepared 런 삭제");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\ngolden-ab 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
