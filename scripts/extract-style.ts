// 썸네일 스타일 추출 — corpus 썸네일 카피 + 시각 라벨 → style_profiles(version). tech.md §13.2.
//   파이프라인 단계가 아니라 코퍼스 위에서 1회 도는 학습 작업(ingest·extract-tone과 동격). Inngest 없음.
//   흐름: DB읽기(thumbnail_copy) + 라벨 결합 → 결정적 prep → callLLM 1회 → schema검증 → (검수) → DB저장(draft).
//
//   실행(.env 필요 + claude-p 백엔드 = $0):
//     set -a; . ./.env; set +a
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/extract-style.ts          # dry-run: corpus/thumbnails/에 JSON(DB 미반영)
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/extract-style.ts --commit  # 검수 후 style_profiles(draft) + provenance INSERT
//   record 모드 = 첫 호출만 실호출(구독 $0), 이후 fixture 리플레이로 재현·재실행 $0.

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { callLLM } from "../src/llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import { loadConfig } from "../src/llm/config.js";
import { FixtureMissError } from "../src/llm/fixtures.js";
import { STYLE_EXTRACTION_SCHEMA, STYLE_EXTRACTION_SYSTEM, type StyleExtractionOutput } from "../src/agents/style_extractor/schema.js";

const COMMIT = process.argv.includes("--commit");
const OUT_DIR = "corpus/thumbnails";
const LABELS_PATH = "corpus/thumbnails/golden-visual-labels.json";
const RUN_ID = "style-extract"; // 비용 귀속 키(production_run 아님 — 학습 작업).

/** DB에서 모은 한 편(썸네일 카피 묶음). */
export interface ThumbnailEdition {
  edition_id: string;
  topic: string;
  copy: string[];
}

/** 라벨 파일의 visual 형태(전부 빈 문자열일 수 있다). */
export interface VisualLabel {
  face: string;
  layout: string;
  emphasis: string;
  color: string;
  number_treatment: string;
  devices: string;
  notes: string;
}

/** 라벨 파일 한 편의 형태. */
export interface LabelEdition {
  edition_id: string;
  topic?: string;
  visual?: Partial<VisualLabel>;
}

/** prep 입력 한 편(LLM에 전달). */
export interface StyleInputEdition {
  topic: string;
  copy: string[];
  visual: VisualLabel;
}

const EMPTY_VISUAL: VisualLabel = { face: "", layout: "", emphasis: "", color: "", number_treatment: "", devices: "", notes: "" };

/** 라벨의 visual을 안전 정규화 — 누락 키/빈 값 모두 빈 문자열로 채워 구조 보장. */
function normalizeVisual(v?: Partial<VisualLabel>): VisualLabel {
  if (!v) return { ...EMPTY_VISUAL };
  return {
    face: v.face ?? "",
    layout: v.layout ?? "",
    emphasis: v.emphasis ?? "",
    color: v.color ?? "",
    number_treatment: v.number_treatment ?? "",
    devices: v.devices ?? "",
    notes: v.notes ?? "",
  };
}

/**
 * 결정적 prep — DB의 썸네일 카피 편들에 라벨(visual)을 edition_id로 매칭해 결합한다.
 * 라벨 없는 편 / visual 빈 편 모두 안전 처리(빈 VisualLabel). 순수 함수(테스트 import용).
 */
export function buildStyleInput(editions: ThumbnailEdition[], labels: LabelEdition[]): StyleInputEdition[] {
  const byId = new Map<string, LabelEdition>();
  for (const l of labels) {
    if (l?.edition_id) byId.set(l.edition_id, l);
  }
  return editions.map((ed) => {
    const label = byId.get(ed.edition_id);
    return {
      topic: ed.topic,
      copy: ed.copy,
      visual: normalizeVisual(label?.visual),
    };
  });
}

/** 라벨 파일 로드(없거나 깨지면 빈 배열 — 라벨 없이도 카피만으로 추출 가능). */
function loadLabels(): LabelEdition[] {
  try {
    const raw = readFileSync(LABELS_PATH, "utf8");
    const parsed = JSON.parse(raw) as { editions?: LabelEdition[] };
    return Array.isArray(parsed.editions) ? parsed.editions : [];
  } catch {
    console.warn(`⚠️ 라벨 파일 로드 실패(${LABELS_PATH}) — 시각 라벨 없이 카피만으로 추출`);
    return [];
  }
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const supa = createClient(url, key, { auth: { persistSession: false } });

  // 1) DB 읽기 — 학습대상(include_in_training) 편의 thumbnail_copy 컴포넌트.
  const { data: eds, error: ee } = await supa
    .from("corpus_editions")
    .select("id, topic, status, include_in_training")
    .eq("include_in_training", true)
    .eq("status", "done");
  if (ee) throw new Error(`corpus_editions 조회 실패: ${ee.message}`);
  if (!eds?.length) throw new Error("학습대상 corpus_editions 0편 — ingest-corpus를 먼저 커밋했는지 확인");

  const editions: ThumbnailEdition[] = [];
  for (const ed of eds) {
    const { data: comps, error: ce } = await supa
      .from("corpus_components")
      .select("content")
      .eq("edition_id", ed.id)
      .eq("type", "thumbnail_copy");
    if (ce) throw new Error(`corpus_components 조회 실패(${ed.topic ?? ed.id}): ${ce.message}`);
    const copy = (comps ?? []).map((c) => c.content).filter((c) => c?.trim());
    if (!copy.length) continue; // 썸네일 카피 없는 편은 제외
    editions.push({ edition_id: ed.id, topic: ed.topic ?? "(무제)", copy });
  }
  if (!editions.length) throw new Error("thumbnail_copy 컴포넌트가 있는 편이 0 — 코퍼스 파싱 확인");

  // 2) 라벨 결합 + 결정적 prep(순수 함수).
  const labels = loadLabels();
  const inputEditions = buildStyleInput(editions, labels);
  const labeledCount = inputEditions.filter((e) => Object.values(e.visual).some((v) => v.trim())).length;

  const totalCopies = editions.reduce((s, e) => s + e.copy.length, 0);
  console.log(`🖼️ 학습대상 ${editions.length}편 / 썸네일 카피 ${totalCopies}개 / 시각라벨 채워진 편 ${labeledCount}편`);
  editions.forEach((e) => console.log(`   - ${e.topic} (카피 ${e.copy.length}개)`));

  const input = {
    creator: "김짠부",
    note: "아래는 같은 크리에이터의 썸네일 카피와 시각 라벨이다. 썸네일 표현 방식만 추출하라(말투 아님).",
    editions: inputEditions,
  };

  // 3) callLLM 1회 — opus(style_extractor 기본). 비용가드·fixtures·schema 강제는 callLLM이 담당.
  const config = loadConfig();
  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

  console.log(`\n🧠 썸네일 스타일 추출 중… (backend=${config.backend} · fixtures=${config.fixtures})`);
  let out;
  try {
    out = await callLLM<StyleExtractionOutput>(
      { roleId: "style_extractor", system: STYLE_EXTRACTION_SYSTEM, input, schema: STYLE_EXTRACTION_SCHEMA, runId: RUN_ID, maxTokens: 4096 },
      { config, costGuard },
    );
  } catch (e) {
    if (e instanceof FixtureMissError) {
      console.error(`\n⚠️ fixture 없음 — 첫 실행은 LLM_FIXTURES=record 로 돌려 실호출(claude-p=$0)하고 fixture를 만드세요.`);
    }
    throw e;
  }

  // 빈 가능 배열 필드는 ?? [] 기본값으로 안전 수령(스키마 required 제외 필드).
  const raw = out.data.patterns;
  const patterns = {
    copy: {
      hook_patterns: raw.copy?.hook_patterns ?? [],
      structure: raw.copy.structure,
      emphasis_words: raw.copy?.emphasis_words ?? [],
      length_notes: raw.copy.length_notes,
    },
    visual: {
      face: raw.visual.face,
      layout_archetypes: raw.visual?.layout_archetypes ?? [],
      color_usage: raw.visual.color_usage,
      number_treatment: raw.visual.number_treatment,
      devices: raw.visual?.devices ?? [],
    },
    banned: raw.banned ?? [],
  };
  const evidence_summary = out.data.evidence_summary;

  console.log(`✅ 추출 완료 · ${out.provider} · ${out.latencyMs}ms · $${out.costUsd.toFixed(4)}`);
  console.log(`\n— 근거 요약 —\n${evidence_summary}\n`);
  console.log("— patterns —");
  console.log(JSON.stringify(patterns, null, 2));

  // 4) 산출물 파일(검수용) — 항상 기록(dry-run/commit 공통).
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const source_ref = `corpus:thumbnails=${editions.length},copies=${totalCopies},labeled=${labeledCount} @${stamp}`;
  const artifact = {
    source_ref,
    provider: out.provider,
    promptHash: out.promptHash,
    editions: editions.map((e) => ({ edition_id: e.edition_id, topic: e.topic })),
    patterns,
    evidence_summary,
  };
  const outPath = join(OUT_DIR, `style-proposed-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`\n💾 검수 산출물: ${outPath}`);

  if (!COMMIT) {
    console.log(`\nℹ️ dry-run(미반영). 위 patterns를 검수 후 --commit 으로 style_profiles(draft) 저장.`);
    return;
  }

  // 5) DB 저장 — style_profiles(draft, version=max+1, component_type='thumbnail_copy') + provenance(편별 1행).
  const { data: maxRow, error: me } = await supa
    .from("style_profiles")
    .select("version")
    .eq("component_type", "thumbnail_copy")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (me) throw new Error(`version 조회 실패: ${me.message}`);
  const version = (maxRow?.version ?? 0) + 1;

  const { data: sp, error: se } = await supa
    .from("style_profiles")
    .insert({ component_type: "thumbnail_copy", version, patterns, status: "draft" })
    .select("id, version, status")
    .single();
  if (se) throw new Error(`style_profiles insert 실패: ${se.message}`);

  const provenance = editions.map((e) => ({
    profile_type: "thumbnail_copy" as const,
    style_profile_id: sp.id,
    edition_id: e.edition_id,
    weight: 1,
  }));
  const { error: pe } = await supa.from("profile_training_sources").insert(provenance);
  if (pe) throw new Error(`provenance insert 실패: ${pe.message}`);

  console.log(`\n✅ 저장 — style_profiles(thumbnail_copy) v${sp.version} (${sp.status}, id=${sp.id}) · provenance ${provenance.length}편`);
  console.log(`   다음: 검수 후 activate-style.ts 로 'active' 승격하면 훅이가 사용. (현재 draft)`);
}

// 직접 실행(tsx scripts/extract-style.ts)일 때만 main() 구동. import 시(테스트)에는 헬퍼만 노출.
const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invokedDirectly) {
  main().catch((e) => {
    console.error("\nextract-style 실패:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
