// 제목 스타일 추출 — 채널 raw 제목(corpus/titles/channel-recent.json) → style_profiles(component_type='title', draft).
//   파이프라인 단계가 아니라 코퍼스 위에서 1회 도는 학습 작업(extract-tone·learn-ab-style과 동격). Inngest 없음.
//   learn-ab-style 미러: 단, 입력이 CTR·A/B 가 아니라 '같은 채널에 발행된 raw 제목들'이다 — 순수 '제목 스타일'만 학습한다.
//   ⚠️ CTR/performance/ab_variants 일절 안 읽음(가중 없음). provenance(profile_training_sources) 도 INSERT 안 함
//     (raw 제목은 corpus edition 이 아니라 edition_id FK 가 없다 → source_ref 에만 근거 남김).
//   흐름(§8.1 정신 계승): 파일읽기 → 결정적 prep → callLLM 1회 → schema검증 → (검수) → DB저장(draft, 활성화 절대 안 함).
//
//   실행(.env 필요 + claude-p 백엔드 = $0):
//     set -a; . ./.env; set +a
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/extract-title-style.ts          # dry-run: corpus/titles/에 JSON(DB 미반영)
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/extract-title-style.ts --commit  # 검수 후 style_profiles(title, draft) INSERT

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { callLLM } from "../src/llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import { loadConfig } from "../src/llm/config.js";
import { FixtureMissError } from "../src/llm/fixtures.js";
import {
  TITLE_STYLE_SYSTEM,
  normalizePatterns,
  foldStrayPatternFields,
} from "./learn-ab-style.js";
import {
  STYLE_EXTRACTION_SCHEMA,
  type StyleExtractionOutput,
} from "../src/agents/style_extractor/schema.js";

const COMMIT = process.argv.includes("--commit");
const OUT_DIR = "corpus/titles";
const TITLES_PATH = "corpus/titles/channel-recent.json";
const RUN_ID = "title-style-extract"; // 비용 귀속 키(production_run 아님 — 학습 작업).

/** channel-recent.json 의 한 항목(step0 ingest 산출물). */
export interface ChannelTitle {
  video_id: string;
  title: string;
  published_at: string;
}

/** LLM 전달용 결정적 입력. CTR/performance 무관 — 순수 제목 스타일. */
export interface TitleStyleInput {
  creator: string;
  note: string;
  titles: string[];
}

/**
 * 결정적 prep — raw 제목 항목들을 LLM 입력으로 구성한다(순수, 파일·DB·LLM 미접근 → 테스트 import 안전).
 *   title 이 비-문자열/공백인 항목은 거른다. 유효 제목 0개면 throw(학습할 신호 없음).
 */
export function buildTitleStyleInput(titles: ChannelTitle[]): TitleStyleInput {
  const valid = titles
    .map((t) => (typeof t?.title === "string" ? t.title.trim() : ""))
    .filter((s) => s.length > 0);
  if (valid.length === 0) throw new Error("유효한 제목 0개 — channel-recent.json 의 title 필드를 확인하세요");
  return {
    creator: "김짠부",
    note: "아래는 같은 채널에 실제 발행된 영상 제목들이다. 제목 짓는 방식(어휘·구조·길이·후킹 장치)만 추출하라. 내용 주제가 아니라 '제목 스타일'을 학습한다.",
    titles: valid,
  };
}

/** channel-recent.json 로드. 파일 없으면 명확한 에러. */
function loadChannelTitles(): ChannelTitle[] {
  let raw: string;
  try {
    raw = readFileSync(TITLES_PATH, "utf8");
  } catch {
    throw new Error(`${TITLES_PATH} 없음 — step0 ingest를 먼저 --commit으로 실행하세요`);
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${TITLES_PATH}: 제목 배열이 아닙니다`);
  return parsed as ChannelTitle[];
}

async function main() {
  // 1) 파일 읽기 + 결정적 prep(순수 함수). CTR/ab_variants 일절 안 읽음.
  const titles = loadChannelTitles();
  const input = buildTitleStyleInput(titles);
  console.log(`📝 채널 제목 ${titles.length}개(유효 ${input.titles.length}개)로 제목 스타일 학습`);

  // 2) callLLM 1회 — opus(title_extractor 기본), 비용가드·fixtures·schema 강제는 callLLM이 담당.
  const config = loadConfig();
  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

  console.log(`\n🧠 제목 스타일 추출 중… (backend=${config.backend} · fixtures=${config.fixtures})`);
  let out;
  try {
    out = await callLLM<StyleExtractionOutput>(
      { roleId: "title_extractor", system: TITLE_STYLE_SYSTEM, input, schema: STYLE_EXTRACTION_SCHEMA, runId: RUN_ID, maxTokens: 4096 },
      { config, costGuard },
    );
  } catch (e) {
    if (e instanceof FixtureMissError) {
      console.error(`\n⚠️ fixture 없음 — 첫 실행은 LLM_FIXTURES=record 로 돌려 실호출(claude-p=$0)하고 fixture를 만드세요.`);
    }
    throw e;
  }

  // learn-ab-style 과 동일 정규화(appendTitleStyle 소비 형태 보장 — top-level stray 필드 접기 + ?? [] 안전 수령).
  const patterns = normalizePatterns(foldStrayPatternFields(out.data));
  const evidence_summary = out.data.evidence_summary;
  console.log(`✅ 추출 완료 · ${out.provider} · ${out.latencyMs}ms · $${out.costUsd.toFixed(4)}`);
  console.log(`\n— 근거 요약 —\n${evidence_summary}\n`);
  console.log("— patterns —");
  console.log(JSON.stringify(patterns, null, 2));

  // 3) 산출물 파일(검수용) — 항상 기록(dry-run/commit 공통).
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const source_ref = `channel:titles=${input.titles.length} @${stamp}`;
  const artifact = { source_ref, patterns, evidence_summary };
  const outPath = join(OUT_DIR, `title-style-proposed-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`\n💾 검수 산출물: ${outPath}`);

  if (!COMMIT) {
    console.log(`\nℹ️ dry-run(미반영). 위 patterns를 검수 후 --commit 으로 style_profiles(title, draft) 저장.`);
    return;
  }

  // 4) DB 저장 — style_profiles(draft, version=max+1 component_type='title' 스코프). provenance 없음(edition_id FK 부재).
  //    ★ version 은 반드시 component_type='title' 필터로 조회(thumbnail_copy 등 다른 타입과 섞지 마라).
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const supa = createClient(url, key, { auth: { persistSession: false } });

  const { data: maxRow, error: me } = await supa
    .from("style_profiles")
    .select("version")
    .eq("component_type", "title")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (me) throw new Error(`version 조회 실패: ${me.message}`);
  const version = (maxRow?.version ?? 0) + 1;

  const { data: sp, error: se } = await supa
    .from("style_profiles")
    .insert({ component_type: "title", version, patterns, status: "draft" })
    .select("id, version, status")
    .single();
  if (se) throw new Error(`style_profiles insert 실패: ${se.message}`);

  console.log(`\n✅ 저장 — style_profiles(title) v${sp.version} (${sp.status}, id=${sp.id}) · source_ref: ${source_ref}`);
  console.log(`   다음: 검수 후 'active'로 승격하면 훅이(제목)가 사용. (현재 draft — 활성화는 사람 게이트)`);
}

// 직접 실행(tsx scripts/extract-title-style.ts)일 때만 main() 구동. import 시(테스트)에는 헬퍼만 노출.
const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invokedDirectly) {
  main().catch((e) => {
    console.error("\nextract-title-style 실패:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
