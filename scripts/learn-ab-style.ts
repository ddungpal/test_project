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
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { callLLM } from "../src/llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import { loadConfig } from "../src/llm/config.js";
import { FixtureMissError } from "../src/llm/fixtures.js";
import {
  judgeComponent,
  ctrWeightedScore,
  verdictWeight,
  LIFT_CAP,
  LIFT_SCALE,
  type AbScoreInput,
} from "../src/performance/abVerdict.js";
import type { AbComponent } from "../src/performance/types.js";
import type { AbVariantKey } from "../src/performance/types.js";
import type { AbDecisiveness } from "../src/domain/enums.js";
import {
  STYLE_EXTRACTION_SCHEMA,
  type StyleExtractionOutput,
  type ThumbnailStylePatterns,
} from "../src/agents/style_extractor/schema.js";
import {
  templateSlotsAllowed,
  extractAllowedSlots,
  type CopySkeletons,
  type TitleSkeleton,
  type ThumbnailSkeleton,
} from "../src/agents/shared/localCopyGen.js";

const COMMIT = process.argv.includes("--commit");
/** `--from <path>` — 검수·완화한 산출물 파일을 LLM 재호출 없이 그대로 draft INSERT 하는 경로. */
function parseFromArg(argv: string[]): string | undefined {
  const i = argv.indexOf("--from");
  if (i === -1) return undefined;
  const p = argv[i + 1];
  if (!p || p.startsWith("--")) throw new Error("--from 뒤에 산출물 파일 경로가 필요합니다");
  return p;
}
const FROM_PATH = parseFromArg(process.argv);
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
  /** 영상(24h) CTR(%). DB 소스에서 채운다(§13.2 CTR 합성). 파일 시드엔 보통 없음(undefined → CTR 무가중·하위호환). */
  video_ctr24h?: number | null;
  /** 영상(24h) 조회수. DB 소스에서 채운다(§13.2 조회수 신뢰도 가중). 파일 시드엔 보통 없음(null → vconf 무가중·하위호환). */
  video_views24h?: number | null;
  /** 학습 모드. "single"=영상 내 비교 없음(제목 단일 — 영상간 CTR 대비). "correction"=교정쌍(이상=winner·생성=loser, CTR 없음·사람 명시 선호 → decisive 고정 가중). 미지정 → "ab"(영상 내 A/B). */
  learn_mode?: "ab" | "single" | "correction";
}

/** prep 입력 한 변형(LLM 전달용 — copy 는 의미 있는 한 문자열로 합침). */
export interface AbStyleVariant {
  copy: string;
  visual: string;
}

/**
 * inconclusive 영상의 '등가 신호'(LLM 전달용 약신호).
 *   A/B 가 동등했던(우열 못 가린) 차원 — positive 학습엔 넣지 않되, "그 차이를 과하게 학습하지 말라"는 신호로 보존.
 */
export interface EquivalentSignal {
  topic: string;
  note: string;
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

// §13.2 가중치 로직(verdictWeight·LIFT_CAP·LIFT_SCALE)은 순환 import 차단을 위해 abVerdict.ts 로 이전했다.
//   여기서는 하위호환을 위해 그대로 재export 한다(기존 테스트·import 보존). CTR 합성은 ctrWeightedScore.
export { verdictWeight, LIFT_CAP, LIFT_SCALE };

/** copy_top/copy_main/copy_box/copy_sub 중 있는 것만 합쳐 의미 있는 한 문자열로. */
function joinCopy(v: AbResultVariant): string {
  return [v.copy_top, v.copy_main, v.copy_box, v.copy_sub]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .join(" / ");
}

/** 한 영상의 변형들을 judgeComponent(component) 로 재계산. watch_share_pct 를 ctr_pct 슬롯에 주입. */
function recomputeVerdict(
  video: AbResultVideo,
  component: AbComponent = "thumbnail",
): { decisiveness: AbDecisiveness; decided: boolean; margin: number | null } {
  const config = loadConfig();
  const variants: AbScoreInput[] = video.variants.map((v) => ({
    variant: v.variant,
    ctr_pct: v.watch_share_pct ?? null,
  }));
  const verdict = judgeComponent(component, variants, config.ab);
  return { decisiveness: verdict.decisiveness ?? "inconclusive", decided: verdict.decided, margin: verdict.margin };
}

/**
 * inconclusive 영상만 '등가 신호'로 추출(positive 학습에서 제외하되 약신호로 보존).
 *   buildAbStyleInput 이 positive(decisive/marginal)만 반환하는 것과 상보적 — 같은 영상이 양쪽에 들지 않는다.
 *   판정 권위는 judgeComponent 재계산(파일 verdict 무관). 순수 함수(테스트 import용, console 출력 없음 — buildAbStyleInput 이 경고 담당).
 */
export function buildEquivalentSignals(videos: AbResultVideo[], component: AbComponent = "thumbnail"): EquivalentSignal[] {
  const out: EquivalentSignal[] = [];
  for (const video of videos) {
    if (video.learn_mode === "single" || video.learn_mode === "correction") continue; // single·correction(영상 내 CTR 비교 없음)은 등가신호 개념 미적용.
    const { decisiveness } = recomputeVerdict(video, component);
    if (decisiveness !== "inconclusive") continue; // positive 는 buildAbStyleInput 담당.
    out.push({
      topic: video.topic,
      note: "A/B 동등(우열 못 가림) — 이 차원은 성과 차이 없음. 이 차이를 과하게 학습하지 말 것.",
    });
  }
  return out;
}

/**
 * 결정적 prep — 각 영상을 winner/losers 로 분해하고 재계산된 decisiveness 로 가중.
 *   inconclusive 영상은 통째 스킵(보수적 — §13.2 학습 보류). 단 그 등가신호는 buildEquivalentSignals 가 별도 보존.
 *   판정 권위는 judgeComponent 재계산. 파일 verdict 와 다르면 console.warn 만(throw 금지). 순수 함수(테스트 import용).
 */
export function buildAbStyleInput(
  videos: AbResultVideo[],
  component: AbComponent = "thumbnail",
  config = loadConfig(),
): AbStyleInputVideo[] {
  // §13.2 조회수 신뢰도 기준 — 코퍼스(학습대상 영상들)의 24h 조회수 최댓값. 영상마다 다시 구하지 않고 1회만 산출.
  //   전부 null/0 이면 spread 가 비어 Math.max(0)=0 → ctrWeightedScore 에서 vconf=1.0(하위호환).
  const viewsReference = Math.max(
    0,
    ...videos
      .map((v) => v.video_views24h)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0),
  );

  const out: AbStyleInputVideo[] = [];
  for (const video of videos) {
    const isCorrection = video.learn_mode === "correction";

    if (isCorrection) {
      // correction 모드(교정쌍) — 이상=winner, 생성=loser. CTR·결정력 비교 없음(사람 명시 선호).
      //   → decisive 고정 가중(verdictWeight("decisive")=1.0). judgeComponent·CTR·vconf 무관(안 탐 → 안전).
      //   single 블록과 동형이되, CTR 가중을 타지 않고 고정 1.0. inconclusive 스킵 없음.
      const winnerVar = video.variants.find((v) => v.is_winner === true);
      if (!winnerVar) {
        console.warn(`⚠️ winner 변형 없음(correction ${video.topic}) — 스킵`);
        continue;
      }
      const loserVars = video.variants.filter((v) => v !== winnerVar);
      out.push({
        topic: video.topic,
        verdict: "decisive", // 교정은 사람 명시 선호 → 항상 강신호(decisive 슬롯 의미: 학습 신호 등급).
        weight: verdictWeight("decisive"), // =1.0 고정(CTR·vconf 무관).
        winner: { copy: joinCopy(winnerVar), visual: winnerVar.visual ?? "" },
        losers: loserVars.map((v) => ({ copy: joinCopy(v), visual: v.visual ?? "" })),
      });
      continue;
    }

    const isSingle = video.learn_mode === "single";

    if (isSingle) {
      // single 모드(제목 단일·영상 내 비교 없음) — 영상간 CTR 대비로 합성된 winner/loser.
      //   가중은 CTR 크기 자체(ctrWeightedScore mode="single"). winner 변형 1개.
      const winnerVar = video.variants.find((v) => v.is_winner === true);
      if (!winnerVar) {
        console.warn(`⚠️ winner 변형 없음(single ${video.topic}) — 스킵`);
        continue;
      }
      const weight = ctrWeightedScore(
        { decisiveness: "decisive", videoCtr24h: video.video_ctr24h ?? null, mode: "single", videoViews24h: video.video_views24h ?? null, viewsReference },
        config.ab,
      );
      if (weight <= 0) continue; // CTR 없거나 0 → 학습 신호 없음(저CTR은 loser 합성에서 처리).
      const loserVars = video.variants.filter((v) => v !== winnerVar);
      out.push({
        topic: video.topic,
        verdict: "decisive", // 영상간 대비에서 상위 → 양의 예시. (decisiveness 슬롯 의미: 학습 신호 등급)
        weight,
        winner: { copy: joinCopy(winnerVar), visual: winnerVar.visual ?? "" },
        losers: loserVars.map((v) => ({ copy: joinCopy(v), visual: v.visual ?? "" })),
      });
      continue;
    }

    const { decisiveness, margin } = recomputeVerdict(video, component);

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

    // weight: CTR 합성(ctrWeightedScore). relative_lift_pct 가 있으면 base 미세조정에 사용.
    //   CTR(video_ctr24h) 없으면(undefined→null) verdictWeight 와 정확히 동일(하위호환).
    const relativeLiftPct = video.relative_lift_pct ?? (margin !== null && margin > 0 ? margin * 100 : undefined);
    const weight = ctrWeightedScore(
      relativeLiftPct === undefined
        ? { decisiveness, videoCtr24h: video.video_ctr24h ?? null, mode: "ab", videoViews24h: video.video_views24h ?? null, viewsReference }
        : { decisiveness, relativeLiftPct, videoCtr24h: video.video_ctr24h ?? null, mode: "ab", videoViews24h: video.video_views24h ?? null, viewsReference },
      config.ab,
    );

    out.push({
      topic: video.topic,
      verdict: decisiveness,
      weight,
      winner: { copy: joinCopy(winnerVar), visual: winnerVar.visual ?? "" },
      losers: loserVars.map((v) => ({ copy: joinCopy(v), visual: v.visual ?? "" })),
    });
  }
  return out;
}

/**
 * LLM(claude-p)이 banned/confidence/tentative_notes/skeletons 를 patterns 밖 top-level 에 둔 경우 patterns 안으로 접어넣는다(순수).
 *   patterns 내부 값이 있으면 그쪽 우선(이중 출력 방어). 둘 다 없으면 미설정. DB·IO 없음.
 *   ★ exactOptionalPropertyTypes 준수 — fallback(`patterns.x ?? data.x`)이 둘 다 undefined 면 키는 undefined 그대로(병합 시 spread 로 키 자체가 안 생김).
 *   반환된 patterns 를 normalizePatterns 가 받으면 기존대로(nested) 동작한다 — 다운스트림 불변.
 */
export function foldStrayPatternFields(data: StyleExtractionOutput): StyleExtractionOutput["patterns"] {
  const p = data.patterns;
  // patterns 내부 우선, 없을 때만 top-level. 값이 있을 때만 키를 얹는다(undefined 명시 할당 금지).
  const banned = p.banned ?? data.banned;
  const confidence = p.confidence ?? data.confidence;
  const tentative_notes = p.tentative_notes ?? data.tentative_notes;
  const skeletons = p.skeletons ?? data.skeletons;
  return {
    ...p,
    ...(banned !== undefined ? { banned } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(tentative_notes !== undefined ? { tentative_notes } : {}),
    ...(skeletons !== undefined ? { skeletons } : {}),
  };
}

/** rawP(LLM 산출 patterns)를 ThumbnailStylePatterns 로 안전 정규화(빈 가능 배열 ?? [] + 옵셔널 신뢰도). */
export function normalizePatterns(rawP: StyleExtractionOutput["patterns"]): ThumbnailStylePatterns {
  return {
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
    ...normalizeConfidence(rawP),
    ...normalizeSkeletons(rawP),
  };
}

/**
 * 학습 산출의 skeletons(재사용 템플릿)를 안전 수령한다(normalizeConfidence 와 동일 패턴 — throw 없음·키 생략).
 *   ★ exactOptionalPropertyTypes: 무효/누락이면 키 자체를 생략한다(undefined 명시 할당 금지).
 *   ★ 슬롯 화이트리스트({number}|{target}|{keyword}|{topic}) 검증은 localCopyGen 의 templateSlotsAllowed/extractAllowedSlots
 *     를 재사용 — 생성 시점 폐기(fillLine 누출 폐기)를 학습 시점에 선차단(의미 일치).
 *   - skeletons 가 객체 아니면 → 키 생략.
 *   - title: 배열 아니면 무시. 각 항목 template 이 비어있지 않은 string 이고 모든 슬롯이 화이트리스트 안일 때만 통과,
 *     아니면 그 항목 폐기. slots 는 화이트리스트 교집합으로 정제(빈배열 허용). 유효 0개면 title 키 생략.
 *   - thumbnail: 배열 아니면 무시. 각 항목 main·boxes 가 string[] 이고 모든 라인 슬롯이 화이트리스트 안일 때 통과,
 *     아니면 폐기. 유효 0개면 thumbnail 키 생략.
 *   - title·thumbnail 둘 다 없으면 skeletons 키 자체 생략.
 */
export function normalizeSkeletons(rawP: { skeletons?: unknown }): { skeletons?: CopySkeletons } {
  const raw = rawP.skeletons;
  if (typeof raw !== "object" || raw === null) return {};
  const rawObj = raw as { title?: unknown; thumbnail?: unknown };

  const skeletons: CopySkeletons = {};

  // title — 각 항목 template 의 모든 {} 토큰이 화이트리스트 안일 때만 통과. slots 는 화이트리스트 교집합으로 정제.
  if (Array.isArray(rawObj.title)) {
    const titles: TitleSkeleton[] = [];
    for (const item of rawObj.title) {
      if (typeof item !== "object" || item === null) continue;
      const t = (item as { template?: unknown }).template;
      if (typeof t !== "string" || t.length === 0) continue;
      if (!templateSlotsAllowed(t)) continue; // 화이트리스트 밖 토큰 하나라도 있으면 항목 폐기.
      titles.push({ template: t, slots: extractAllowedSlots(t) });
    }
    if (titles.length > 0) skeletons.title = titles;
  }

  // thumbnail — main·boxes 가 string[] 이고 모든 라인의 슬롯이 화이트리스트 안일 때 통과.
  if (Array.isArray(rawObj.thumbnail)) {
    const thumbs: ThumbnailSkeleton[] = [];
    for (const item of rawObj.thumbnail) {
      if (typeof item !== "object" || item === null) continue;
      const main = (item as { main?: unknown }).main;
      const boxes = (item as { boxes?: unknown }).boxes;
      if (!isStringArray(main) || !isStringArray(boxes)) continue;
      const lines = [...main, ...boxes];
      if (!lines.every((l) => templateSlotsAllowed(l))) continue; // 한 라인이라도 허용 외 슬롯 → 폐기.
      // slots: main+boxes 전 라인의 화이트리스트 슬롯 합집합(중복 제거, 등장 순서).
      const slots = extractAllowedSlots(lines.join("\n"));
      thumbs.push({ main, boxes, slots });
    }
    if (thumbs.length > 0) skeletons.thumbnail = thumbs;
  }

  if (skeletons.title === undefined && skeletons.thumbnail === undefined) return {};
  return { skeletons };
}

/** string[] 가드(빈 배열도 true). 비-string 원소가 있으면 false. */
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** learnAbStylePatterns 반환 — draft INSERT·검수 산출에 필요한 학습 결과(LLM 1회 호출 결과). */
export interface AbStyleLearnResult {
  patterns: ThumbnailStylePatterns;
  evidence_summary: string;
  /** inconclusive 제외 후 실제 학습에 쓴 영상(provenance·source_ref 용). */
  inputVideos: AbStyleInputVideo[];
  signalCount: number;
  provider: string;
  promptHash: string;
  costUsd: number;
}

/**
 * A/B 스타일 학습 핵심(LLM 1회) — videos → buildAbStyleInput → callLLM → patterns 정규화.
 *   main() 과 styleRelearnSweep 이 공유하는 순수에 가까운 학습 본체(파일 IO·DB 미접근, callLLM 만).
 *   ★ 비용가드·fixtures 는 config 그대로(claude-p=$0). 학습 가능한 영상 0편이면 throw.
 */
export async function learnAbStylePatterns(
  videos: AbResultVideo[],
  component: AbComponent = "thumbnail",
  config = loadConfig(),
): Promise<AbStyleLearnResult> {
  const inputVideos = buildAbStyleInput(videos, component, config);
  if (!inputVideos.length) throw new Error("학습 가능한 영상 0편 — 전부 inconclusive 이거나 winner 부재");

  const winners = inputVideos.map((v) => ({ topic: v.topic, weight: v.weight, ...v.winner }));
  const losers = inputVideos.flatMap((v) => v.losers.map((l) => ({ topic: v.topic, ...l })));
  const signalCount = inputVideos.reduce((s, v) => s + v.weight, 0);
  const equivalentSignals = buildEquivalentSignals(videos, component);

  const isTitle = component === "title";
  const input = {
    creator: "김짠부",
    note: isTitle
      ? "아래는 성과(CTR)가 확인된 영상 '제목'들이다. CTR 이 높은(이긴) 제목의 표현 방식을 학습하라. equivalent_signals 는 차이가 미미했던 차원이니 과하게 학습하지 말라."
      : "아래는 A/B 테스트로 성과가 확인된 썸네일들이다. '이긴' 표현 방식을 학습하라. equivalent_signals 는 A/B 가 동등했던 차원이니 과하게 학습하지 말라.",
    winners,
    losers,
    equivalent_signals: equivalentSignals,
  };

  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });
  const out = await callLLM<StyleExtractionOutput>(
    {
      roleId: "style_extractor",
      system: isTitle ? TITLE_STYLE_SYSTEM : AB_STYLE_SYSTEM,
      input,
      schema: STYLE_EXTRACTION_SCHEMA,
      runId: RUN_ID,
      maxTokens: 4096,
    },
    { config, costGuard },
  );

  return {
    // ★ claude-p 가 banned/confidence/tentative_notes/skeletons 를 top-level 로 내도 foldStrayPatternFields 가 patterns 안으로 접는다.
    patterns: normalizePatterns(foldStrayPatternFields(out.data)),
    evidence_summary: out.data.evidence_summary,
    inputVideos,
    signalCount,
    provider: out.provider,
    promptHash: out.promptHash,
    costUsd: out.costUsd,
  };
}

/** 검수본 videos 한 줄(provenance·weight 용). */
export interface ReviewedArtifactVideo {
  topic: string;
  verdict: AbDecisiveness;
  weight: number;
}

/** loadReviewedArtifact 반환 형태 — DB INSERT 입력으로 그대로 사용. */
export interface ReviewedArtifact {
  patterns: ThumbnailStylePatterns;
  videos: ReviewedArtifactVideo[];
  source_ref: string;
}

/**
 * 신규 옵셔널 신뢰도 필드(confidence·tentative_notes)를 안전 수령한다.
 *   - 누락/무효 confidence 는 키 자체를 생략(exactOptionalPropertyTypes — undefined 명시 할당 금지).
 *   - tentative_notes 는 배열이면 ?? [] 처럼 안전 수령, 아니면 생략. throw 하지 않는다(하위호환).
 */
export function normalizeConfidence(rawP: {
  confidence?: unknown;
  tentative_notes?: unknown;
}): Pick<ThumbnailStylePatterns, "confidence" | "tentative_notes"> {
  const out: Pick<ThumbnailStylePatterns, "confidence" | "tentative_notes"> = {};
  if (rawP.confidence === "high" || rawP.confidence === "tentative") {
    out.confidence = rawP.confidence;
  }
  if (Array.isArray(rawP.tentative_notes)) {
    out.tentative_notes = rawP.tentative_notes.filter((n): n is string => typeof n === "string");
  }
  return out;
}

/**
 * 검수·완화한 산출물 파일(ab-style-proposed-*.json)을 읽어 patterns 를 그대로 수령한다.
 *   사람이 손본 완화 표현을 LLM 재호출 없이 draft 로 INSERT 하기 위한 순수 헬퍼(파일 IO 만, DB·LLM 미접근 → 테스트 import 안전).
 *   기존 main() 의 `?? []` 정규화를 동일 적용해 빈 가능 배열을 안전 수령한다(빈 배열이어도 throw 금지).
 */
export function loadReviewedArtifact(path: string): ReviewedArtifact {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const rawP = parsed.patterns as
    | {
        copy?: ThumbnailStylePatterns["copy"];
        visual?: ThumbnailStylePatterns["visual"];
        banned?: string[];
        confidence?: ThumbnailStylePatterns["confidence"];
        tentative_notes?: string[];
        skeletons?: unknown; // normalizeSkeletons 가 안전 수령(화이트리스트 검증·정제). 검수본 경로 보존.
      }
    | undefined;
  if (
    typeof rawP !== "object" ||
    rawP === null ||
    typeof rawP.copy !== "object" ||
    rawP.copy === null ||
    typeof rawP.visual !== "object" ||
    rawP.visual === null ||
    !("banned" in rawP)
  ) {
    throw new Error("검수본에 patterns(copy/visual/banned) 없음");
  }

  // 기존 main() 과 동일한 ?? [] 정규화(hook_patterns·emphasis_words·layout_archetypes·devices·banned).
  //   신규 옵셔널(confidence·tentative_notes)은 normalizeConfidence 로 안전 수령(누락 시 키 자체 생략 — exactOptionalPropertyTypes).
  const patterns: ThumbnailStylePatterns = {
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
    ...normalizeConfidence(rawP),
    ...normalizeSkeletons(rawP),
  };

  const rawVideos = parsed.videos;
  const videos: ReviewedArtifactVideo[] = Array.isArray(rawVideos)
    ? (rawVideos as ReviewedArtifactVideo[])
    : [];

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const source_ref =
    typeof parsed.source_ref === "string" && parsed.source_ref.length > 0
      ? parsed.source_ref
      : `from:${basename(path)} @${stamp}`;

  return { patterns, videos, source_ref };
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
  "- 여러 영상에서 반복 등장하는 승리 패턴은 high-confidence 로, 1~2 사례뿐인 패턴은 tentative 로 분류한다. tentative 패턴은 tentative_notes 에 '저표본 경고'로 적고, 전반적으로 표본이 적으면 confidence 를 'tentative' 로 둔다.",
  "- equivalent_signals 는 A/B 가 동등했던(우열 못 가린) 차원 — 그 차이를 과하게 학습하지 말라는 신호다. 이 차원의 차이는 banned·강신호로 단정하지 않는다.",
  "- 추측 금지. 입력에 실재하는 표현만 적고, 예시는 입력에서 그대로 인용한다(날조 시 무효).",
  "- copy(메인카피↔작은박스 구성·후킹·강조어)와 visual(인물·레이아웃·색·숫자·장치)을 구분해 채운다.",
  "- 데이터가 적으면(영상 N<10) 단정하지 말고 '경향'으로 적는다(과적합 경계).",
  "- 어투 규칙: 김짠부는 강하되 정중한 존댓말을 쓴다('~하세요/~마세요/~보세요/~됩니다'). 반말 명령('~하라/~마라/~봐라/~해라/~사라')은 김짠부 톤에 어긋나므로 banned 에 포함하고, structure/main_copy_notes/length_notes 의 어투 기술도 존댓말 기준으로 적는다.",
  "- 이긴 패턴을 재사용 가능한 스켈레톤으로도 출력하라(patterns.skeletons) — 슬롯은 {number}/{target}/{keyword}/{topic}만 사용(이 외 슬롯 토큰 금지), 주제 무관한 고정 표현 + 슬롯 조합. title 여러 개·thumbnail 여러 개(메인2·박스2 템플릿). banned 표현은 넣지 말 것. slots 배열엔 그 template에 실제 쓴 슬롯 키만 적어라. 스켈레톤·예시 어투도 존댓말로(반말 명령 금지).",
  "- 출력 최상위는 patterns 와 evidence_summary 둘뿐이다. banned·confidence·tentative_notes·skeletons 는 반드시 patterns 객체 *안*에 넣어라(최상위에 두지 말 것).",
  "- 한국어로 작성한다.",
].join("\n");

/** 제목 성과 분석 시스템 프롬프트. 썸네일 미러 — 대상이 '제목'(텍스트). visual 은 제목엔 거의 무의미 → '해당 없음'으로 둔다. */
export const TITLE_STYLE_SYSTEM = [
  "너는 유튜브 크리에이터 '김짠부'(재테크 채널)의 영상 제목 성과 분석가다.",
  "아래 입력 데이터는 CTR(클릭률)로 성과가 확인된 '이긴' 제목(winner)과 '진' 제목(losers)들이다. 각 영상에는 학습 가중치(weight)가 붙어 있다.",
  "",
  "목표: 다른 AI(훅이)가 김짠부 스타일로 'CTR 이 검증된' 새 제목을 만들 수 있도록, 따라 쓸 수 있는 '제목 스타일 사양'을 만든다.",
  "원칙:",
  "- 이긴 제목들의 공통 표현 방식(후킹·프레이밍·강조어·길이)을 뽑아 copy 패턴으로 채운다.",
  "- 진 것 대비 무엇이 달랐는지를 banned(약점·피해야 할 표현)에 적는다 — 진 표현은 banned 의 근거다.",
  "- weight 가 높은(고CTR) 제목의 표현을 더 강한 신호로 본다. 가중치를 학습에 반영한다.",
  "- visual(인물·레이아웃·색·숫자·장치)은 제목에 해당 없음 — face/color_usage/number_treatment 는 '해당 없음(제목)'으로 채우고 배열은 비운다.",
  "- 어투 규칙: 김짠부는 강하되 정중한 존댓말을 쓴다('~하세요/~마세요/~보세요/~됩니다'). 반말 명령('~하라/~마라/~봐라/~해라/~사라')은 김짠부 톤에 어긋나므로 banned 에 포함하고, structure/main_copy_notes/length_notes 의 어투 기술도 존댓말 기준으로 적는다. 스켈레톤·예시도 존댓말로.",
  "- 여러 영상에서 반복되는 승리 패턴은 high-confidence 로, 1~2 사례뿐이면 tentative 로 분류해 tentative_notes 에 '저표본 경고'를 적는다. 전반적으로 표본이 적으면 confidence 를 'tentative' 로 둔다.",
  "- equivalent_signals 는 차이가 미미했던 차원 — 과하게 학습하지 말라는 신호다. banned·강신호로 단정하지 않는다.",
  "- 추측 금지. 입력에 실재하는 표현만 적고, 예시는 입력에서 그대로 인용한다(날조 시 무효).",
  "- 데이터가 적으면(영상 N<10) 단정하지 말고 '경향'으로 적는다(과적합 경계).",
  "- 낚시(과장·허위 클릭베이트)를 권장하지 않는다. CTR 이 높았던 '정직한' 표현 방식만 사양으로 삼는다.",
  "- 이긴 패턴을 재사용 가능한 스켈레톤으로도 출력하라(patterns.skeletons) — 슬롯은 {number}/{target}/{keyword}/{topic}만 사용(이 외 슬롯 토큰 금지), 주제 무관한 고정 표현 + 슬롯 조합. title 여러 개·thumbnail 여러 개(메인2·박스2 템플릿). banned 표현은 넣지 말 것. slots 배열엔 그 template에 실제 쓴 슬롯 키만 적어라.",
  "- 출력 최상위는 patterns 와 evidence_summary 둘뿐이다. banned·confidence·tentative_notes·skeletons 는 반드시 patterns 객체 *안*에 넣어라(최상위에 두지 말 것).",
  "- 한국어로 작성한다.",
].join("\n");

/**
 * `--from` 경로 — 검수본 patterns 를 LLM 재호출 없이 그대로 style_profiles(draft) 로 INSERT.
 *   DB INSERT 규약은 기존 LLM 경로와 동일(version=max+1, status='draft', component_type='thumbnail_copy',
 *   provenance 는 검수본 videos 의 weight). `--commit` 없으면 미리보기만.
 */
async function commitFromReviewed(fromPath: string) {
  console.log(`📄 검수본에서 커밋: ${fromPath} (LLM 미호출)`);

  const { patterns, videos, source_ref } = loadReviewedArtifact(fromPath);

  console.log(`\n— patterns (검수본 그대로) —`);
  console.log(JSON.stringify(patterns, null, 2));
  console.log(`\n   source_ref: ${source_ref}`);
  if (videos.length) {
    console.log(`   provenance 대상 ${videos.length}편:`);
    videos.forEach((v) => console.log(`   - ${v.topic} [${v.verdict} · w=${v.weight}]`));
  } else {
    console.warn(`⚠️ 검수본에 videos 없음 — provenance INSERT 건너뜀(style_profiles 만 저장).`);
  }

  if (!COMMIT) {
    console.log(`\nℹ️ 미리보기(미반영). 위 patterns 를 --commit 으로 style_profiles(draft) 저장.`);
    return;
  }

  // DB 저장 — style_profiles(draft, version=max+1, component_type='thumbnail_copy') + provenance(영상별 weight).
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

  // provenance — 검수본 videos 의 영상별 weight 로(§13.2). best-effort:
  //   학습 소스(ab-results.json 영상)는 DB 행이 아니라 출처 FK(edition/ab_variant/metric)가 없다 →
  //   pts_has_source(FK≥1) 제약을 만족 못 함. 환류는 style_profiles 만 읽으므로(provenance 미참조)
  //   provenance 실패는 draft 저장을 막지 않는다 — 경고만 하고 계속(부분기록 방지: style_profiles 는 이미 저장됨).
  let provenanceCount = 0;
  if (videos.length) {
    const provenance = videos.map((v) => ({
      profile_type: "thumbnail_copy" as const,
      style_profile_id: sp.id,
      edition_id: null,
      ab_variant_id: null,
      weight: v.weight,
    }));
    const { error: pe } = await supa.from("profile_training_sources").insert(provenance);
    if (pe) {
      console.warn(`⚠️ provenance 생략 — 출처 FK 없음(코퍼스 영상은 DB 행 아님): ${pe.message}`);
    } else {
      provenanceCount = provenance.length;
    }
  }

  console.log(`\n✅ 저장 — style_profiles(thumbnail_copy) v${sp.version} (${sp.status}, id=${sp.id}) · provenance ${provenanceCount}편`);
  console.log(`   source_ref: ${source_ref}`);
  console.log(`   다음: 검수 후 activate-style.ts 로 'active' 승격하면 훅이가 사용. (현재 draft)`);
}

async function main() {
  // --from: 검수본 그대로 커밋(LLM 미호출). 기존 LLM 학습 경로와 분리.
  if (FROM_PATH) {
    await commitFromReviewed(FROM_PATH);
    return;
  }

  // 1) ab-results.json 로드 + 결정적 prep(순수 함수).
  const videos = loadAbResults();
  const config = loadConfig();

  // 2) 학습 본체(buildAbStyleInput→callLLM→patterns 정규화)는 styleRelearnSweep 과 공유하는 learnAbStylePatterns 로.
  console.log(`\n🧠 A/B 성과 스타일 학습 중… (backend=${config.backend} · fixtures=${config.fixtures})`);
  let learned;
  try {
    learned = await learnAbStylePatterns(videos, "thumbnail", config);
  } catch (e) {
    if (e instanceof FixtureMissError) {
      console.error(`\n⚠️ fixture 없음 — 첫 실행은 LLM_FIXTURES=record 로 돌려 실호출(claude-p=$0)하고 fixture를 만드세요.`);
    }
    throw e;
  }
  const { patterns, evidence_summary, inputVideos, signalCount } = learned;

  console.log(`🖼️ 학습 영상 ${inputVideos.length}편(전체 ${videos.length} 중 inconclusive 제외) / 가중 신호량 ${signalCount.toFixed(2)}`);
  inputVideos.forEach((v) => console.log(`   - ${v.topic} [${v.verdict} · w=${v.weight.toFixed(2)}]`));
  console.log(`✅ 학습 완료 · ${learned.provider} · $${learned.costUsd.toFixed(4)}`);
  console.log(`\n— 근거 요약 —\n${evidence_summary}\n`);
  console.log("— patterns —");
  console.log(JSON.stringify(patterns, null, 2));

  // 3) 산출물 파일(검수용) — 항상 기록(dry-run/commit 공통).
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const source_ref = `ab-results:videos=${inputVideos.length},signal=${signalCount.toFixed(1)} @${stamp}`;
  const artifact = {
    source_ref,
    provider: learned.provider,
    promptHash: learned.promptHash,
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
