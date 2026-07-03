// 비유 스타일 재학습 sweep 코어 — STT(transcribeReels) → 추출(analogy_extractor) → draft 삽입(style_profiles).
//   설계: docs/specs/2026-07-03-analogy-learning-design.md §4.2·§4.3·§4.5.
//   ★ styleRelearnSweep(supa 인자) 패턴 미러 — supa·transcribeReels·extractor 를 deps 로 받아 테스트가 스텁 주입 가능.
//     서버액션(requestAnalogyRelearn)은 이 코어를 requireOwner + createAdminClient 로 감싸는 얇은 래퍼다.
//   ★ saveTitleStyleDraft 미러 — version 은 반드시 component_type='analogy_style' 필터로 max+1(다른 타입과 섞지 마라).
//   ★ draft 까지만. activate 금지(사람 게이트 — 이후 step 버튼). training_sources 행 삽입 없음(v1 YAGNI).

import type { Supa } from "../pipeline/runState.js";
import type { LlmConfig } from "../llm/config.js";
import { loadConfig } from "../llm/config.js";
import type { CallLLMDeps } from "../llm/callLLM.js";
import { transcribeReels, type ReelTranscript } from "../lib/learning/transcribeReels.js";
import { extractAnalogyStylePatterns } from "../agents/analogy_extractor/step.js";

const COMPONENT_TYPE = "analogy_style" as const;

/** 학습 대상 폴더 — learning/analogy-reels 고정(owner-local mp4 드롭). */
export const ANALOGY_REELS_DIR = "learning/analogy-reels";

/** 재학습 결과 — 전사된 트랜스크립트 수 + draft 생성 여부/버전. */
export interface AnalogyRelearnResult {
  transcribed: number;
  created: boolean;
  version: number | null;
  id: string | null;
}

/** 테스트 주입용 deps — transcribeReels·extractor 를 impl 함수로 격리(vi.fn 지양 규칙). */
export interface AnalogyRelearnDeps {
  /** dir → 트랜스크립트 뭉치. 기본 = transcribeReels(step0). */
  transcribe?: (dir: string) => Promise<ReelTranscript[]>;
  /** 트랜스크립트 → 비유 기법 프로필(null=신호 없음). 기본 = extractAnalogyStylePatterns. */
  extract?: (transcripts: ReelTranscript[], config: LlmConfig, callDeps?: Pick<CallLLMDeps, "driver">) => Promise<unknown | null>;
  config?: LlmConfig;
  /** extractor 로 넘길 LLM driver 주입(테스트). */
  driver?: CallLLMDeps["driver"];
}

/**
 * 비유 스타일 재학습 sweep — learning/analogy-reels 를 전사해 비유 기법 프로필 draft 를 만든다.
 *   1) transcribe(dir) — mp4 전사(캐시 히트면 STT 미호출·멱등). 폴더 없음/빈 폴더 방어.
 *   2) 트랜스크립트 0개 → { transcribed:0, created:false }(LLM·INSERT 0).
 *   3) extract 1회 → 비유 기법 프로필. null 이면 created:false(과금은 발생하나 INSERT 0).
 *   4) style_profiles(component_type='analogy_style', status='draft', version=analogy_style 스코프 max+1) INSERT.
 *   activate 안 함(draft 만 — 사람 게이트).
 */
export async function analogyRelearnSweep(
  supa: Supa,
  deps: AnalogyRelearnDeps = {},
): Promise<AnalogyRelearnResult> {
  const config = deps.config ?? loadConfig();
  const transcribe = deps.transcribe ?? ((dir: string) => transcribeReels(dir));
  const extract =
    deps.extract ??
    ((transcripts: ReelTranscript[], cfg: LlmConfig, callDeps?: Pick<CallLLMDeps, "driver">) =>
      extractAnalogyStylePatterns(transcripts, cfg, callDeps));

  // 1) 전사 — 폴더 없거나 읽기 실패면 빈 배열로 방어(sweep 안 죽임).
  let transcripts: ReelTranscript[];
  try {
    transcripts = await transcribe(ANALOGY_REELS_DIR);
  } catch (err) {
    console.error(`[analogyRelearnSweep] 트랜스크립트 폴더 읽기 실패 — 빈 학습으로 처리: ${ANALOGY_REELS_DIR}`, err);
    transcripts = [];
  }

  // 2) 빈 폴더 방어 — LLM/INSERT 0.
  if (transcripts.length === 0) {
    return { transcribed: 0, created: false, version: null, id: null };
  }

  // 3) 추출 1회 — null 이면 draft 미생성.
  const callDeps = deps.driver ? { driver: deps.driver } : undefined;
  const patterns = await extract(transcripts, config, callDeps);
  if (patterns == null) {
    return { transcribed: transcripts.length, created: false, version: null, id: null };
  }

  // 4) draft INSERT — version 은 반드시 component_type='analogy_style' 스코프 max+1(다른 타입과 섞지 마라).
  const { data: maxRow, error: me } = await supa
    .from("style_profiles")
    .select("version")
    .eq("component_type", COMPONENT_TYPE)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (me) throw new Error(`style_profiles(analogy_style) version 조회 실패: ${me.message}`);
  const version = (maxRow?.version ?? 0) + 1;

  const { data: sp, error: se } = await supa
    .from("style_profiles")
    .insert({ component_type: COMPONENT_TYPE, version, patterns: patterns as never, status: "draft" })
    .select("id, version")
    .single();
  if (se) throw new Error(`style_profiles(analogy_style) draft insert 실패: ${se.message}`);

  return { transcribed: transcripts.length, created: true, version: sp.version as number, id: sp.id as string };
}
