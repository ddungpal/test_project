// 말투 추출 — corpus 스크립트 → tone_profile(version). tech.md §7·§12, Phase 2 0단계.
//   파이프라인 단계가 아니라 코퍼스 위에서 1회 도는 학습 작업(ingest와 동격). Inngest 없음.
//   흐름(§8.1 정신 계승): DB읽기(코퍼스) → 결정적 prep → callLLM 1회 → schema검증 → (검수) → DB저장(draft).
//
//   실행(.env 필요 + claude-p 백엔드 = $0):
//     set -a; . ./.env; set +a
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/extract-tone.ts          # dry-run: corpus/tone/에 JSON + 요약(DB 미반영)
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/extract-tone.ts --commit  # 검수 후 tone_profile(draft) + provenance INSERT
//   record 모드 = 첫 호출만 실호출(구독 $0), 이후 fixture 리플레이로 재현·재실행 $0.

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { callLLM } from "../src/llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import { loadConfig } from "../src/llm/config.js";
import { FixtureMissError } from "../src/llm/fixtures.js";
import { TONE_EXTRACTION_SCHEMA, TONE_EXTRACTION_SYSTEM, type ToneExtractionOutput } from "../src/agents/tone_extractor/schema.js";

const COMMIT = process.argv.includes("--commit");
const OUT_DIR = "corpus/tone";
const RUN_ID = "tone-extract"; // 비용 귀속 키(production_run 아님 — 학습 작업).

interface ScriptEdition {
  edition_id: string;
  topic: string;
  edition_date: string | null;
  content: string;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const supa = createClient(url, key, { auth: { persistSession: false } });

  // 1) DB 읽기 — 학습대상(include_in_training) 편의 완성(is_final) 스크립트 컴포넌트.
  const { data: eds, error: ee } = await supa
    .from("corpus_editions")
    .select("id, topic, edition_date, status, include_in_training")
    .eq("include_in_training", true)
    .eq("status", "done");
  if (ee) throw new Error(`corpus_editions 조회 실패: ${ee.message}`);
  if (!eds?.length) throw new Error("학습대상 corpus_editions 0편 — ingest-corpus를 먼저 커밋했는지 확인");

  const scripts: ScriptEdition[] = [];
  for (const ed of eds) {
    const { data: comps, error: ce } = await supa
      .from("corpus_components")
      .select("content, is_final")
      .eq("edition_id", ed.id)
      .eq("type", "script");
    if (ce) throw new Error(`corpus_components 조회 실패(${ed.topic}): ${ce.message}`);
    const finals = comps?.filter((c) => c.is_final) ?? [];
    const chosen = (finals.length ? finals : (comps ?? [])).map((c) => c.content).join("\n\n");
    if (!chosen.trim()) continue; // 스크립트 컴포넌트 없는 편은 제외
    scripts.push({ edition_id: ed.id, topic: ed.topic ?? "(무제)", edition_date: ed.edition_date, content: chosen });
  }
  if (!scripts.length) throw new Error("스크립트 컴포넌트가 있는 편이 0 — 코퍼스 파싱 확인");

  const totalChars = scripts.reduce((s, x) => s + x.content.length, 0);
  console.log(`📚 학습대상 ${scripts.length}편 / 스크립트 ${totalChars.toLocaleString()}자(~${Math.round(totalChars / 2 / 1000)}k토큰)`);
  scripts.forEach((s) => console.log(`   - ${s.topic} (${s.content.length.toLocaleString()}자)`));

  // 2) 결정적 prep — 말투만 추출하므로 주제별 라벨 + 본문만 전달(내용은 말투 아님 §12).
  const input = {
    creator: "김짠부",
    note: "아래는 같은 화자가 쓴 완성 스크립트들이다. 말하는 방식만 추출하라.",
    scripts: scripts.map((s) => ({ topic: s.topic, script: s.content })),
  };

  // 3) callLLM 1회 — opus(tone_extractor 기본), 비용가드·fixtures·schema 강제는 callLLM이 담당.
  const config = loadConfig();
  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

  console.log(`\n🧠 말투 추출 중… (backend=${config.backend} · fixtures=${config.fixtures})`);
  let out;
  try {
    out = await callLLM<ToneExtractionOutput>(
      { roleId: "tone_extractor", system: TONE_EXTRACTION_SYSTEM, input, schema: TONE_EXTRACTION_SCHEMA, runId: RUN_ID, maxTokens: 4096 },
      { config, costGuard },
    );
  } catch (e) {
    if (e instanceof FixtureMissError) {
      console.error(`\n⚠️ fixture 없음 — 첫 실행은 LLM_FIXTURES=record 로 돌려 실호출(claude-p=$0)하고 fixture를 만드세요.`);
    }
    throw e;
  }

  const { components, evidence_summary } = out.data;
  console.log(`✅ 추출 완료 · ${out.provider} · ${out.latencyMs}ms · $${out.costUsd.toFixed(4)}`);
  console.log(`\n— 근거 요약 —\n${evidence_summary}\n`);
  console.log("— components —");
  console.log(JSON.stringify(components, null, 2));

  // 4) 산출물 파일(검수용) — 항상 기록(dry-run/commit 공통).
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const source_ref = `corpus:editions=${scripts.length},chars=${totalChars} @${stamp}`;
  const artifact = { source_ref, provider: out.provider, promptHash: out.promptHash, editions: scripts.map((s) => ({ edition_id: s.edition_id, topic: s.topic })), components, evidence_summary };
  const outPath = join(OUT_DIR, `tone-proposed-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`\n💾 검수 산출물: ${outPath}`);

  if (!COMMIT) {
    console.log(`\nℹ️ dry-run(미반영). 위 components를 검수 후 --commit 으로 tone_profile(draft) 저장.`);
    return;
  }

  // 5) DB 저장 — tone_profile(draft, version=max+1) + provenance(편별 1행).
  const { data: maxRow, error: me } = await supa.from("tone_profile").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
  if (me) throw new Error(`version 조회 실패: ${me.message}`);
  const version = (maxRow?.version ?? 0) + 1;

  const { data: tp, error: te } = await supa
    .from("tone_profile")
    .insert({ version, components, source_ref, status: "draft" })
    .select("id, version, status")
    .single();
  if (te) throw new Error(`tone_profile insert 실패: ${te.message}`);

  const provenance = scripts.map((s) => ({ profile_type: "tone" as const, tone_profile_id: tp.id, edition_id: s.edition_id, weight: 1 }));
  const { error: pe } = await supa.from("profile_training_sources").insert(provenance);
  if (pe) throw new Error(`provenance insert 실패: ${pe.message}`);

  console.log(`\n✅ 저장 — tone_profile v${tp.version} (${tp.status}, id=${tp.id}) · provenance ${provenance.length}편`);
  console.log(`   다음: 검수 후 status를 'active'로 승격하면 짠펜이 사용. (현재 draft)`);
}

main().catch((e) => {
  console.error("\nextract-tone 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
