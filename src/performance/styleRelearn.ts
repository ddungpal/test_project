// A/B 스타일 재학습 sweep(운영 자동화 ②) — 새 A/B 표본이 마지막 학습 이후 늘면 재학습 draft 를 자동 제안.
//   ★ 회고 sweep(retrospectiveSweep) 미러: 조건 충족 시 draft 생성, activate 는 사람(게이트). draft 까지만.
//   ★ 멱등: provenance(profile_training_sources) 행 수로 '이미 이 표본으로 학습함'을 잡는다.
//     학습 시 현재 thumbnail ab_variants 행마다 ab_variant_id 를 채워 provenance 를 남기면,
//     다음 sweep 에서 lastLearnedSampleCount == currentAbSampleCount 가 되어 자동 스킵된다.
//   ★ ab_variant_id 를 채우므로 pts_has_source(FK≥1) CHECK 충족 — 파일 기반 provenance 가 실패하던 문제를 해소.
//   개발=claude-p $0(record→replay). 적격 아니거나 표본 0 이면 LLM 호출 0·draft 0(과금 0·멱등).

import type { Supa } from "../pipeline/runState.js";
import type { TablesInsert } from "../lib/supabase/database.types.js";
import { loadConfig, type LlmConfig } from "../llm/config.js";
import { learnAbStylePatterns } from "../../scripts/learn-ab-style.js";
import { loadAbResults } from "../../scripts/ingest-ab.js";

const PROFILE_TYPE = "thumbnail_copy" as const;

/**
 * 순수 적격 판정 — 마지막 학습 표본수 대비 현재 A/B 표본이 minDelta 이상 늘었나.
 *   결정적·DB 무접근. 동률/감소 → false(멱등·무의미 재학습 차단). 기본 minDelta=1.
 */
export function eligibleForStyleRelearn(args: {
  currentAbSampleCount: number;
  lastLearnedSampleCount: number;
  minDelta?: number;
}): boolean {
  const minDelta = args.minDelta ?? 1;
  return args.currentAbSampleCount - args.lastLearnedSampleCount >= minDelta;
}

export interface StyleRelearnResult {
  eligible: boolean;
  created: string | null; // 생성된 draft style_profiles.id (스킵 시 null)
  currentSampleCount: number;
  lastLearnedSampleCount: number;
}

/**
 * 현재 thumbnail A/B 표본수 = ab_variants(component_type='thumbnail') 행 수(DB 기준, 파일 watch 아님).
 *   비어 있으면 0 → sweep 은 no-op(안전).
 */
async function countCurrentAbSamples(supa: Supa): Promise<number> {
  const { count, error } = await supa
    .from("ab_variants")
    .select("id", { count: "exact", head: true })
    .eq("component_type", "thumbnail");
  if (error) throw new Error(`ab_variants 카운트 실패: ${error.message}`);
  return count ?? 0;
}

/** 최신 thumbnail_copy style_profile(version desc 1행). 없으면 null. */
async function loadLatestStyleProfile(supa: Supa): Promise<{ id: string; version: number } | null> {
  const { data, error } = await supa
    .from("style_profiles")
    .select("id, version")
    .eq("component_type", PROFILE_TYPE)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`style_profiles 최신 조회 실패: ${error.message}`);
  if (!data) return null;
  return { id: data.id, version: data.version ?? 0 };
}

/** 한 style_profile 에 연결된 provenance(profile_training_sources) 행 수 = 그 프로필이 학습한 표본수. */
async function countTrainingSources(supa: Supa, styleProfileId: string): Promise<number> {
  const { count, error } = await supa
    .from("profile_training_sources")
    .select("id", { count: "exact", head: true })
    .eq("style_profile_id", styleProfileId);
  if (error) throw new Error(`profile_training_sources 카운트 실패: ${error.message}`);
  return count ?? 0;
}

/**
 * A/B 스타일 재학습 sweep — 표본이 늘었으면 재학습 draft 1건 생성(activate 안 함·사람게이트).
 *   멱등: provenance 행 수 == 현재 ab_variants 행 수이면 skip(이미 이 표본으로 학습). 재시도·중복이벤트 안전.
 *   - currentAbSampleCount: ab_variants(thumbnail) 행 수(DB).
 *   - lastLearnedSampleCount: 최신 thumbnail_copy style_profile 의 provenance 행 수.
 *   적격이면 learnAbStylePatterns(LLM 1회) → style_profiles(draft, version=max+1) INSERT
 *     + 현재 thumbnail ab_variants 행마다 provenance(ab_variant_id 링크) INSERT → 다음 sweep 에서 멱등.
 */
export async function styleRelearnSweep(supa: Supa, opts: { minDelta?: number; config?: LlmConfig } = {}): Promise<StyleRelearnResult> {
  const config = opts.config ?? loadConfig();

  const currentSampleCount = await countCurrentAbSamples(supa);
  const latest = await loadLatestStyleProfile(supa);
  const lastLearnedSampleCount = latest ? await countTrainingSources(supa, latest.id) : 0;

  // exactOptionalPropertyTypes — minDelta 는 있을 때만 넘긴다(undefined 명시 할당 금지).
  const isEligible = eligibleForStyleRelearn(
    opts.minDelta === undefined
      ? { currentAbSampleCount: currentSampleCount, lastLearnedSampleCount }
      : { currentAbSampleCount: currentSampleCount, lastLearnedSampleCount, minDelta: opts.minDelta },
  );

  if (!isEligible) {
    return { eligible: false, created: null, currentSampleCount, lastLearnedSampleCount };
  }

  // 적격 — 학습 본체(claude-p=$0). 파일(ab-results.json)을 학습 입력으로 쓰되 표본수는 DB 기준.
  const videos = loadAbResults();
  const learned = await learnAbStylePatterns(videos, config);

  // style_profiles(draft, version=max+1) INSERT. activate 금지(사람게이트).
  const nextVersion = (latest?.version ?? 0) + 1;
  const { data: sp, error: se } = await supa
    .from("style_profiles")
    .insert({ component_type: PROFILE_TYPE, version: nextVersion, patterns: learned.patterns as never, status: "draft" })
    .select("id")
    .single();
  if (se) throw new Error(`style_profiles draft insert 실패: ${se.message}`);

  // provenance — 현재 thumbnail ab_variants 행마다 링크. ab_variant_id 를 채워 pts_has_source 충족 + 멱등 기준.
  //   weight 는 best-effort(행의 weight 가 있으면 사용, 없으면 null).
  const { data: variants, error: ve } = await supa
    .from("ab_variants")
    .select("id, weight")
    .eq("component_type", "thumbnail");
  if (ve) {
    // 부분기록 방지 — provenance 못 채우면 멱등이 깨지므로 방금 만든 draft 를 되돌린다.
    await supa.from("style_profiles").delete().eq("id", sp.id);
    throw new Error(`ab_variants 조회 실패(draft 롤백됨): ${ve.message}`);
  }

  const rows: TablesInsert<"profile_training_sources">[] = (variants ?? []).map((v) => ({
    profile_type: PROFILE_TYPE,
    style_profile_id: sp.id,
    ab_variant_id: v.id,
    weight: v.weight,
  }));
  if (rows.length > 0) {
    const { error: pe } = await supa.from("profile_training_sources").insert(rows);
    if (pe) {
      await supa.from("style_profiles").delete().eq("id", sp.id);
      throw new Error(`provenance insert 실패(draft 롤백됨): ${pe.message}`);
    }
  }

  return { eligible: true, created: sp.id, currentSampleCount, lastLearnedSampleCount };
}
