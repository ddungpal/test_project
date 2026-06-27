// 구성 스타일 추출 — corpus 완성 스크립트 → style_profiles(component_type='structure', version). step0.
//   파이프라인 단계가 아니라 코퍼스 위에서 1회 도는 학습 작업(ingest·extract-tone·extract-style과 동격). Inngest 없음.
//   흐름: DB읽기(type='script', is_final 우선) → 결정적 prep → callLLM 1회 → fold/normalize → (검수) → DB저장(draft).
//
//   실행(.env 필요 + claude-p 백엔드 = $0):
//     set -a; . ./.env; set +a
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/extract-structure-style.ts          # dry-run: corpus/structure/에 JSON(DB 미반영)
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/extract-structure-style.ts --commit  # 검수 후 style_profiles(structure, draft) + provenance INSERT
//   record 모드 = 첫 호출만 실호출(구독 $0), 이후 fixture 리플레이로 재현·재실행 $0.

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { callLLM } from "../src/llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import { loadConfig } from "../src/llm/config.js";
import { FixtureMissError } from "../src/llm/fixtures.js";
import {
  STRUCTURE_STYLE_SCHEMA,
  STRUCTURE_EXTRACTION_SYSTEM,
  type StructureExtractionOutput,
  type StructureStylePatterns,
} from "../src/agents/structure_extractor/schema.js";

const COMMIT = process.argv.includes("--commit");
const COMPONENT_TYPE = "structure" as const;
const OUT_DIR = "corpus/structure";
const RUN_ID = "structure-extract"; // 비용 귀속 키(production_run 아님 — 학습 작업).

interface ScriptEdition {
  edition_id: string;
  topic: string;
  content: string;
}

/**
 * LLM(claude-p)이 banned/confidence/tentative_notes 를 patterns 밖 top-level 에 둔 경우 patterns 안으로 접어넣는다(순수).
 *   patterns 내부 값이 있으면 그쪽 우선(이중 출력 방어). 둘 다 없으면 미설정. DB·IO 없음.
 *   ★ exactOptionalPropertyTypes 준수 — 값이 있을 때만 키를 spread(undefined 명시 할당 금지).
 *   반환된 patterns 를 normalizeStructurePatterns 가 받으면 nested 구조로 정규화된다 — 다운스트림 불변.
 */
export function foldStructureStrayFields(data: StructureExtractionOutput): StructureExtractionOutput["patterns"] {
  const p = data.patterns;
  // patterns 내부 우선, 없을 때만 top-level. 값이 있을 때만 키를 얹는다(undefined 명시 할당 금지).
  const banned = p.banned ?? data.banned;
  const confidence = p.confidence ?? data.confidence;
  const tentative_notes = p.tentative_notes ?? data.tentative_notes;
  return {
    ...p,
    ...(banned !== undefined ? { banned } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(tentative_notes !== undefined ? { tentative_notes } : {}),
  };
}

/** rawP(LLM 산출 patterns)를 StructureStylePatterns 로 안전 정규화(빈 가능 배열 ?? [] + 옵셔널 신뢰도). */
export function normalizeStructurePatterns(rawP: StructureExtractionOutput["patterns"]): StructureStylePatterns {
  return {
    section_archetypes: rawP.section_archetypes ?? [],
    flow_principles: rawP.flow_principles ?? [],
    hook_placement: rawP.hook_placement,
    anxiety_relief: rawP.anxiety_relief,
    misconception_handling: rawP.misconception_handling,
    ordering_notes: rawP.ordering_notes,
    banned: rawP.banned ?? [],
    // confidence·tentative_notes 는 값 있을 때만 키 포함(exactOptionalPropertyTypes 준수).
    ...(rawP.confidence !== undefined ? { confidence: rawP.confidence } : {}),
    ...(rawP.tentative_notes !== undefined ? { tentative_notes: rawP.tentative_notes } : {}),
  };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  // untyped client — 'structure'가 아직 생성된 database.types 의 union에 없어 typecheck 깨짐 방지.
  const supa = createClient(url, key, { auth: { persistSession: false } });

  // 1) DB 읽기 — 학습대상(include_in_training) 편의 완성(is_final 우선) 스크립트 컴포넌트.
  const { data: eds, error: ee } = await supa
    .from("corpus_editions")
    .select("id, topic, status, include_in_training")
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
    if (ce) throw new Error(`corpus_components 조회 실패(${ed.topic ?? ed.id}): ${ce.message}`);
    const finals = comps?.filter((c) => c.is_final) ?? [];
    const chosen = (finals.length ? finals : (comps ?? [])).map((c) => c.content).join("\n\n");
    if (!chosen.trim()) continue; // 스크립트 컴포넌트 없는 편은 제외
    scripts.push({ edition_id: ed.id, topic: ed.topic ?? "(무제)", content: chosen });
  }
  if (!scripts.length) throw new Error("스크립트 컴포넌트가 있는 편이 0 — 코퍼스 파싱 확인");

  const totalChars = scripts.reduce((s, x) => s + x.content.length, 0);
  console.log(`📚 학습대상 ${scripts.length}편 / 스크립트 ${totalChars.toLocaleString()}자(~${Math.round(totalChars / 2 / 1000)}k토큰)`);
  scripts.forEach((s) => console.log(`   - ${s.topic} (${s.content.length.toLocaleString()}자)`));

  // 2) 결정적 prep — 구성/전개만 추출하므로 주제 라벨 + 본문만 전달.
  const input = {
    creator: "김짠부",
    note: "아래는 같은 크리에이터가 쓴 완성 스크립트들이다. 구성/전개 방식만 추출하라(말투·썸네일 아님).",
    scripts: scripts.map((s) => ({ topic: s.topic, script: s.content })),
  };

  // 3) callLLM 1회 — opus(structure_extractor 기본). 비용가드·fixtures·schema 강제는 callLLM이 담당.
  const config = loadConfig();
  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

  console.log(`\n🧠 구성 스타일 추출 중… (backend=${config.backend} · fixtures=${config.fixtures})`);
  let out;
  try {
    out = await callLLM<StructureExtractionOutput>(
      { roleId: "structure_extractor", system: STRUCTURE_EXTRACTION_SYSTEM, input, schema: STRUCTURE_STYLE_SCHEMA, runId: RUN_ID, maxTokens: 4096 },
      { config, costGuard },
    );
  } catch (e) {
    if (e instanceof FixtureMissError) {
      console.error(`\n⚠️ fixture 없음 — 첫 실행은 LLM_FIXTURES=record 로 돌려 실호출(claude-p=$0)하고 fixture를 만드세요.`);
    }
    throw e;
  }

  // fold(top-level stray → patterns) → normalize(빈 가능 배열 ?? []).
  const patterns = normalizeStructurePatterns(foldStructureStrayFields(out.data));
  const evidence_summary = out.data.evidence_summary;

  console.log(`✅ 추출 완료 · ${out.provider} · ${out.latencyMs}ms · $${out.costUsd.toFixed(4)}`);
  console.log(`\n— 근거 요약 —\n${evidence_summary}\n`);
  console.log("— patterns —");
  console.log(JSON.stringify(patterns, null, 2));

  // 4) 산출물 파일(검수용) — 항상 기록(dry-run/commit 공통).
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const source_ref = `corpus:editions=${scripts.length},chars=${totalChars} @${stamp}`;
  const artifact = {
    source_ref,
    provider: out.provider,
    promptHash: out.promptHash,
    editions: scripts.map((s) => ({ edition_id: s.edition_id, topic: s.topic })),
    patterns,
    evidence_summary,
  };
  const outPath = join(OUT_DIR, `structure-proposed-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`\n💾 검수 산출물: ${outPath}`);

  if (!COMMIT) {
    console.log(`\nℹ️ dry-run(미반영). 위 patterns를 검수 후 --commit 으로 style_profiles(structure, draft) 저장.`);
    return;
  }

  // 5) DB 저장 — style_profiles(draft, version=max+1, component_type='structure') + provenance(편별 1행).
  const { data: maxRow, error: me } = await supa
    .from("style_profiles")
    .select("version")
    .eq("component_type", COMPONENT_TYPE)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (me) throw new Error(`version 조회 실패: ${me.message}`);
  const version = (maxRow?.version ?? 0) + 1;

  const { data: sp, error: se } = await supa
    .from("style_profiles")
    .insert({ component_type: COMPONENT_TYPE, version, patterns, status: "draft" })
    .select("id, version, status")
    .single();
  if (se) throw new Error(`style_profiles insert 실패: ${se.message}`);

  const provenance = scripts.map((s) => ({
    profile_type: COMPONENT_TYPE,
    style_profile_id: sp.id,
    edition_id: s.edition_id,
    weight: 1,
  }));
  const { error: pe } = await supa.from("profile_training_sources").insert(provenance);
  if (pe) throw new Error(`provenance insert 실패: ${pe.message}`);

  console.log(`\n✅ 저장 — style_profiles(structure) v${sp.version} (${sp.status}, id=${sp.id}) · provenance ${provenance.length}편`);
  console.log(`   다음: 검수 후 activate-structure-style.ts 로 'active' 승격하면 구다리가 사용. (현재 draft)`);
}

// 직접 실행(tsx scripts/extract-structure-style.ts)일 때만 main() 구동. import 시(테스트)에는 헬퍼만 노출.
const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invokedDirectly) {
  main().catch((e) => {
    console.error("\nextract-structure-style 실패:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
