// A/B 성과 학습 — corpus/thumbnails/ab-results.json(YouTube Test&Compare 9영상) → style_profiles(version). tech.md §13.2.
//   파이프라인 단계가 아니라 코퍼스 위에서 1회 도는 학습 작업(extract-style·extract-tone과 동격). Inngest 없음.
//   extract-style.ts 미러: 입력만 '이긴/진 썸네일 A/B 결과'다. '이긴' 표현 방식을 가중 학습한다.
//   흐름: ab-results.json 로드 → judgeComponent 재계산(권위) → 결정적 prep → callLLM 1회 → schema검증 → (검수) → DB저장(draft).
//
//   ⚠️ 분모 주의: 파일의 relative_lift_pct = (winner-2nd)/winner 이지만 judgeComponent margin = (winner-2nd)/2nd.
//     판정 권위는 judgeComponent 재계산(watch_share_pct 를 ctr_pct 슬롯에 주입). 파일 verdict 와 다르면 console.warn 만(throw 금지).
//
//   실행(.env 필요 + claude-p 백엔드 = $0):
//     set -a; . ./.env; set +a
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/learn-ab-style.ts          # dry-run: corpus/thumbnails/에 JSON(DB 미반영)
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/learn-ab-style.ts --commit  # 검수 후 style_profiles(draft) + provenance INSERT

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { callLLM } from "../src/llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import { loadConfig } from "../src/llm/config.js";
import { FixtureMissError } from "../src/llm/fixtures.js";
import { judgeComponent, type AbScoreInput } from "../src/performance/abVerdict.js";
import type { AbVariantKey } from "../src/performance/types.js";
import type { AbDecisiveness } from "../src/domain/enums.js";
import { STYLE_EXTRACTION_SCHEMA, type StyleExtractionOutput } from "../src/agents/style_extractor/schema.js";

const COMMIT = process.argv.includes("--commit");
const OUT_DIR = "corpus/thumbnails";
const AB_RESULTS_PATH = "corpus/thumbnails/ab-results.json";
const RUN_ID = "ab-style-learn"; // 비용 귀속 키(production_run 아님 — 학습 작업).

/** ab-results.json 의 한 변형. watch_share_pct = '시청 시간 점유율'(승패 비교 지표). */
export interface AbResultVariant {
  variant: AbVariantKey;
  watch_share_pct?: number | null;
  is_winner?: boolean;
  copy_main?: string;
  copy_top?: string;
  copy_box?: string;
  copy_sub?: string;
  visual?: string;
}

/** ab-results.json 의 한 영상. */
export interface AbResultVideo {
  topic: string;
  golden_edition?: boolean;
  youtube_video_id?: string;
  winner?: string;
  relative_lift_pct?: number;
  verdict?: AbDecisiveness;
  variants: AbResultVariant[];
}

/** prep 입력 한 변형(LLM 전달용 — copy 는 의미 있는 한 문자열로 합침). */
export interface AbStyleVariant {
  copy: string;
  visual: string;
}

/** prep 입력 한 영상(LLM 전달용). 재계산된 decisiveness 기준. */
export interface AbStyleInputVideo {
  topic: string;
  verdict: AbDecisiveness;
  /** §13.2 가중치(decisive 1.0 / marginal 0.5). LLM 이 가중 학습하도록 명시. */
  weight: number;
  winner: AbStyleVariant;
  losers: AbStyleVariant[];
}

/**
 * §13.2 가중치 — A/B 결정력 → 학습 가중.
 *   decisive 1.0 / marginal 0.5 / inconclusive 0(학습 보류). relative_lift_pct 는 선택적 미세조정 인자(현재 미사용 가능).
 */
export function verdictWeight(verdict: AbDecisiveness, _relativeLiftPct?: number): number {
  switch (verdict) {
    case "decisive":
      return 1.0;
    case "marginal":
      return 0.5;
    default:
      return 0;
  }
}

/** copy_top/copy_main/copy_box/copy_sub 중 있는 것만 합쳐 의미 있는 한 문자열로. */
function joinCopy(v: AbResultVariant): string {
  return [v.copy_top, v.copy_main, v.copy_box, v.copy_sub]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .join(" / ");
}

/** 한 영상의 변형들을 judgeComponent('thumbnail') 로 재계산. watch_share_pct 를 ctr_pct 슬롯에 주입. */
function recomputeVerdict(video: AbResultVideo): { decisiveness: AbDecisiveness; decided: boolean } {
  const config = loadConfig();
  const variants: AbScoreInput[] = video.variants.map((v) => ({
    variant: v.variant,
    ctr_pct: v.watch_share_pct ?? null,
  }));
  const verdict = judgeComponent("thumbnail", variants, config.ab);
  return { decisiveness: verdict.decisiveness ?? "inconclusive", decided: verdict.decided };
}

/**
 * 결정적 prep — 각 영상을 winner/losers 로 분해하고 재계산된 decisiveness 로 가중.
 *   inconclusive 영상은 통째 스킵(보수적 — §13.2 학습 보류).
 *   판정 권위는 judgeComponent 재계산. 파일 verdict 와 다르면 console.warn 만(throw 금지). 순수 함수(테스트 import용).
 */
export function buildAbStyleInput(videos: AbResultVideo[]): AbStyleInputVideo[] {
  const out: AbStyleInputVideo[] = [];
  for (const video of videos) {
    const { decisiveness } = recomputeVerdict(video);

    // 파일에 적힌 verdict 와 재계산이 다르면 경고만(분모 차이로 다를 수 있음 — 재계산이 권위).
    if (video.verdict && video.verdict !== decisiveness) {
      console.warn(
        `⚠️ verdict 불일치(${video.topic}): 파일=${video.verdict} vs 재계산=${decisiveness} — 재계산 기준으로 처리`,
      );
    }

    if (decisiveness === "inconclusive") continue; // 보수적 스킵(학습 보류).

    const winnerVar = video.variants.find((v) => v.is_winner === true);
    if (!winnerVar) {
      console.warn(`⚠️ winner 변형 없음(${video.topic}) — 스킵`);
      continue;
    }
    const loserVars = video.variants.filter((v) => v !== winnerVar);

    out.push({
      topic: video.topic,
      verdict: decisiveness,
      weight: verdictWeight(decisiveness, video.relative_lift_pct),
      winner: { copy: joinCopy(winnerVar), visual: winnerVar.visual ?? "" },
      losers: loserVars.map((v) => ({ copy: joinCopy(v), visual: v.visual ?? "" })),
    });
  }
  return out;
}

/** ab-results.json 로드 → videos 배열. */
function loadAbResults(): AbResultVideo[] {
  const raw = readFileSync(AB_RESULTS_PATH, "utf8");
  const parsed = JSON.parse(raw) as { videos?: AbResultVideo[] };
  if (!Array.isArray(parsed.videos)) throw new Error(`${AB_RESULTS_PATH}: videos 배열 없음`);
  return parsed.videos;
}

/** A/B 성과 분석 시스템 프롬프트. 입력(이긴/진 썸네일)은 백엔드가 UNTRUSTED 델리미터로 감싼다(§10). */
export const AB_STYLE_SYSTEM = [
  "너는 유튜브 크리에이터 '김짠부'(재테크 채널)의 썸네일 성과 분석가다.",
  "아래 입력 데이터는 A/B 테스트로 실제로 '이긴' 썸네일(winner)과 '진' 썸네일(losers)들이다. 각 영상에는 학습 가중치(weight)가 붙어 있다.",
  "",
  "목표: 다른 AI(훅이)가 김짠부 스타일로 '성과가 검증된' 새 썸네일을 만들 수 있도록, 따라 만들 수 있는 '썸네일 스타일 사양'을 만든다.",
  "원칙:",
  "- 이긴 것들의 공통 표현 방식(후킹·프레이밍·시각 연출)을 뽑아 copy/visual 패턴으로 채운다.",
  "- 진 것 대비 무엇이 달랐는지를 banned(약점·피해야 할 표현)에 적는다 — 진 표현은 banned 의 근거다.",
  "- weight 가 높은(decisive) 영상의 표현을 더 강한 신호로 본다. 가중치를 학습에 반영한다.",
  "- 추측 금지. 입력에 실재하는 표현만 적고, 예시는 입력에서 그대로 인용한다(날조 시 무효).",
  "- copy(메인카피↔작은박스 구성·후킹·강조어)와 visual(인물·레이아웃·색·숫자·장치)을 구분해 채운다.",
  "- 데이터가 적으면(영상 N<10) 단정하지 말고 '경향'으로 적는다(과적합 경계).",
  "- 한국어로 작성한다.",
].join("\n");

async function main() {
  // 1) ab-results.json 로드 + 결정적 prep(순수 함수).
  const videos = loadAbResults();
  const inputVideos = buildAbStyleInput(videos);
  if (!inputVideos.length) throw new Error("학습 가능한 영상 0편 — 전부 inconclusive 이거나 winner 부재");

  const winners = inputVideos.map((v) => ({ topic: v.topic, weight: v.weight, ...v.winner }));
  const losers = inputVideos.flatMap((v) => v.losers.map((l) => ({ topic: v.topic, ...l })));
  const signalCount = inputVideos.reduce((s, v) => s + v.weight, 0);

  console.log(`🖼️ 학습 영상 ${inputVideos.length}편(전체 ${videos.length} 중 inconclusive 제외) / 가중 신호량 ${signalCount.toFixed(1)}`);
  inputVideos.forEach((v) => console.log(`   - ${v.topic} [${v.verdict} · w=${v.weight}]`));

  const input = {
    creator: "김짠부",
    note: "아래는 A/B 테스트로 성과가 확인된 썸네일들이다. '이긴' 표현 방식을 학습하라.",
    winners,
    losers,
  };

  // 2) callLLM 1회 — opus(style_extractor 기본). 비용가드·fixtures·schema 강제는 callLLM이 담당.
  const config = loadConfig();
  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

  console.log(`\n🧠 A/B 성과 스타일 학습 중… (backend=${config.backend} · fixtures=${config.fixtures})`);
  let out;
  try {
    out = await callLLM<StyleExtractionOutput>(
      { roleId: "style_extractor", system: AB_STYLE_SYSTEM, input, schema: STYLE_EXTRACTION_SCHEMA, runId: RUN_ID, maxTokens: 4096 },
      { config, costGuard },
    );
  } catch (e) {
    if (e instanceof FixtureMissError) {
      console.error(`\n⚠️ fixture 없음 — 첫 실행은 LLM_FIXTURES=record 로 돌려 실호출(claude-p=$0)하고 fixture를 만드세요.`);
    }
    throw e;
  }

  // 빈 가능 배열 필드는 ?? [] 기본값으로 안전 수령(스키마 required 제외 필드).
  const rawP = out.data.patterns;
  const patterns = {
    copy: {
      hook_patterns: rawP.copy?.hook_patterns ?? [],
      structure: rawP.copy.structure,
      emphasis_words: rawP.copy?.emphasis_words ?? [],
      length_notes: rawP.copy.length_notes,
    },
    visual: {
      face: rawP.visual.face,
      layout_archetypes: rawP.visual?.layout_archetypes ?? [],
      color_usage: rawP.visual.color_usage,
      number_treatment: rawP.visual.number_treatment,
      devices: rawP.visual?.devices ?? [],
    },
    banned: rawP.banned ?? [],
  };
  const evidence_summary = out.data.evidence_summary;

  console.log(`✅ 학습 완료 · ${out.provider} · ${out.latencyMs}ms · $${out.costUsd.toFixed(4)}`);
  console.log(`\n— 근거 요약 —\n${evidence_summary}\n`);
  console.log("— patterns —");
  console.log(JSON.stringify(patterns, null, 2));

  // 3) 산출물 파일(검수용) — 항상 기록(dry-run/commit 공통).
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const source_ref = `ab-results:videos=${inputVideos.length},signal=${signalCount.toFixed(1)} @${stamp}`;
  const artifact = {
    source_ref,
    provider: out.provider,
    promptHash: out.promptHash,
    videos: inputVideos.map((v) => ({ topic: v.topic, verdict: v.verdict, weight: v.weight })),
    patterns,
    evidence_summary,
  };
  const outPath = join(OUT_DIR, `ab-style-proposed-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`\n💾 검수 산출물: ${outPath}`);

  if (!COMMIT) {
    console.log(`\nℹ️ dry-run(미반영). 위 patterns를 검수 후 --commit 으로 style_profiles(draft) 저장.`);
    return;
  }

  // 4) DB 저장 — style_profiles(draft, version=max+1, component_type='thumbnail_copy') + provenance(영상별 weight).
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const supa = createClient(url, key, { auth: { persistSession: false } });

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

  // provenance — inconclusive 제외분만, 영상별 weight 로(§13.2). source_ref 에 표기.
  const provenance = inputVideos.map((v) => ({
    profile_type: "thumbnail_copy" as const,
    style_profile_id: sp.id,
    edition_id: null,
    ab_variant_id: null,
    weight: v.weight,
  }));
  const { error: pe } = await supa.from("profile_training_sources").insert(provenance);
  if (pe) throw new Error(`provenance insert 실패: ${pe.message}`);

  console.log(`\n✅ 저장 — style_profiles(thumbnail_copy) v${sp.version} (${sp.status}, id=${sp.id}) · provenance ${provenance.length}편`);
  console.log(`   source_ref: ${source_ref}`);
  console.log(`   다음: 검수 후 activate-style.ts 로 'active' 승격하면 훅이가 사용. (현재 draft)`);
}

// 직접 실행(tsx scripts/learn-ab-style.ts)일 때만 main() 구동. import 시(테스트)에는 헬퍼만 노출.
const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invokedDirectly) {
  main().catch((e) => {
    console.error("\nlearn-ab-style 실패:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
