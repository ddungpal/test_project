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
import { loadAbResultsFromDb } from "./abLearnSource.js";
import { loadCorrectionResults } from "./correctionLearnSource.js";
import type { AbComponent } from "./types.js";

/** component → style_profiles.component_type. thumbnail→thumbnail_copy(기존), title→title. */
const PROFILE_TYPE_BY_COMPONENT: Record<AbComponent, "thumbnail_copy" | "title"> = {
  thumbnail: "thumbnail_copy",
  title: "title",
};
const PROFILE_TYPE = "thumbnail_copy" as const; // 하위호환(기존 참조 보존).

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

/** component 별 sweep 결과 + 집계(둘 다 도는 다중 component sweep). */
export interface StyleRelearnSweepResult {
  thumbnail: StyleRelearnResult;
  title: StyleRelearnResult;
}

/**
 * 현재 A/B 표본수 = ab_variants(component_type) 행 수(DB 기준, 파일 watch 아님).
 *   비어 있으면 0 → sweep 은 no-op(안전).
 */
async function countCurrentAbSamples(supa: Supa, dbComponent: "title" | "thumbnail"): Promise<number> {
  const { count, error } = await supa
    .from("ab_variants")
    .select("id", { count: "exact", head: true })
    .eq("component_type", dbComponent);
  if (error) throw new Error(`ab_variants(${dbComponent}) 카운트 실패: ${error.message}`);
  return count ?? 0;
}

/**
 * 미학습 교정쌍 수 = thumbnail_corrections(component_type) 중 learned_at IS NULL 행 수.
 *   적격 확장 입력 — 미학습 교정이 1개라도 있으면(ab_variants 불변이어도) 재학습 적격.
 *   멱등은 learned_at 스탬프로만 — 스탬프되면 다음 sweep 에서 0 으로 빠져 자동 스킵.
 */
async function countUnlearnedCorrections(supa: Supa, dbComponent: "title" | "thumbnail"): Promise<number> {
  const { count, error } = await supa
    .from("thumbnail_corrections")
    .select("id", { count: "exact", head: true })
    .eq("component_type", dbComponent)
    .is("learned_at", null);
  if (error) throw new Error(`thumbnail_corrections(${dbComponent}) 미학습 카운트 실패: ${error.message}`);
  return count ?? 0;
}

/** 최신 style_profile(component_type, version desc 1행). 없으면 null. */
async function loadLatestStyleProfile(
  supa: Supa,
  profileType: "thumbnail_copy" | "title",
): Promise<{ id: string; version: number } | null> {
  const { data, error } = await supa
    .from("style_profiles")
    .select("id, version")
    .eq("component_type", profileType)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`style_profiles(${profileType}) 최신 조회 실패: ${error.message}`);
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
async function styleRelearnSweepComponent(
  supa: Supa,
  component: AbComponent,
  opts: { minDelta?: number; config: LlmConfig },
): Promise<StyleRelearnResult> {
  const { config } = opts;
  const profileType = PROFILE_TYPE_BY_COMPONENT[component];
  const dbComp = component === "title" ? "title" : "thumbnail";

  const currentSampleCount = await countCurrentAbSamples(supa, dbComp);
  const latest = await loadLatestStyleProfile(supa, profileType);
  const lastLearnedSampleCount = latest ? await countTrainingSources(supa, latest.id) : 0;
  const unlearnedCorrectionCount = await countUnlearnedCorrections(supa, dbComp);

  // exactOptionalPropertyTypes — minDelta 는 있을 때만 넘긴다(undefined 명시 할당 금지).
  const abEligible = eligibleForStyleRelearn(
    opts.minDelta === undefined
      ? { currentAbSampleCount: currentSampleCount, lastLearnedSampleCount }
      : { currentAbSampleCount: currentSampleCount, lastLearnedSampleCount, minDelta: opts.minDelta },
  );
  // 적격 = ab_variants 증가 OR 미학습 교정 존재. 둘 다 아니면 skip(멱등·무의미 재학습 차단).
  const isEligible = abEligible || unlearnedCorrectionCount > 0;

  if (!isEligible) {
    return { eligible: false, created: null, currentSampleCount, lastLearnedSampleCount };
  }

  // 적격 — 학습 입력은 DB(관리자 입력 반영) + 교정쌍(합성 A/B). 표본수도 DB 기준. 학습 본체(claude-p=$0).
  //   교정만 있고 ab_variants=0 이어도 교정이 videos 에 들어와 학습 진행됨(교정도 0 이면 videos=[]→보류).
  const videos = [...(await loadAbResultsFromDb(supa, component)), ...(await loadCorrectionResults(supa, component))];
  if (videos.length === 0) {
    // DB 표본은 카운트됐지만 학습 입력 합성이 0편(예: CTR 전무·교정 0) → 학습 보류(과금 0).
    return { eligible: true, created: null, currentSampleCount, lastLearnedSampleCount };
  }
  const learned = await learnAbStylePatterns(videos, component, config);

  // style_profiles(draft, version=max+1) INSERT. activate 금지(사람게이트).
  const nextVersion = (latest?.version ?? 0) + 1;
  const { data: sp, error: se } = await supa
    .from("style_profiles")
    .insert({ component_type: profileType, version: nextVersion, patterns: learned.patterns as never, status: "draft" })
    .select("id")
    .single();
  if (se) throw new Error(`style_profiles(${profileType}) draft insert 실패: ${se.message}`);

  // provenance — 현재 component ab_variants 행마다 링크. ab_variant_id 를 채워 pts_has_source 충족 + 멱등 기준.
  //   weight 는 best-effort(행의 weight 가 있으면 사용, 없으면 null).
  const { data: variants, error: ve } = await supa
    .from("ab_variants")
    .select("id, weight")
    .eq("component_type", dbComp);
  if (ve) {
    // 부분기록 방지 — provenance 못 채우면 멱등이 깨지므로 방금 만든 draft 를 되돌린다.
    await supa.from("style_profiles").delete().eq("id", sp.id);
    throw new Error(`ab_variants(${dbComp}) 조회 실패(draft 롤백됨): ${ve.message}`);
  }

  const rows: TablesInsert<"profile_training_sources">[] = (variants ?? []).map((v) => ({
    profile_type: profileType,
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

  // 교정 멱등 스탬프 — 이번 학습에 포함된 미학습 교정(learned_at IS NULL)을 학습 완료로 표시.
  //   draft·provenance INSERT 성공 후에만(부분기록 방지). 다음 sweep 에서 미학습 0 → 자동 스킵.
  //   교정은 전용 테이블이라 provenance(ab_variants 기준)와 분리 — 멱등은 learned_at 으로만.
  //   nowIso 결정성 불요(학습 작업 스크립트). 스탬프 실패는 throw 로 표면화.
  if (unlearnedCorrectionCount > 0) {
    const nowIso = new Date().toISOString();
    const { error: ue } = await supa
      .from("thumbnail_corrections")
      .update({ learned_at: nowIso })
      .eq("component_type", dbComp)
      .is("learned_at", null);
    if (ue) throw new Error(`thumbnail_corrections(${dbComp}) learned_at 스탬프 실패: ${ue.message}`);
  }

  return { eligible: true, created: sp.id, currentSampleCount, lastLearnedSampleCount };
}

/**
 * A/B 스타일 재학습 sweep — 썸네일·제목 둘 다 도는 다중 component sweep.
 *   각 component 마다 표본이 늘었으면 재학습 draft 1건 생성(activate 안 함·사람게이트). 멱등.
 *   ★ 입력 소스는 DB(loadAbResultsFromDb) — 관리자 입력이 그대로 학습에 반영된다.
 *   ★ thumbnail→thumbnail_copy, title→title 프로필. 한 component 가 적격 아니면 그 component 만 skip(다른 건 진행).
 */
export async function styleRelearnSweep(
  supa: Supa,
  opts: { minDelta?: number; config?: LlmConfig } = {},
): Promise<StyleRelearnSweepResult> {
  const config = opts.config ?? loadConfig();
  const perComp = (component: AbComponent) =>
    opts.minDelta === undefined
      ? styleRelearnSweepComponent(supa, component, { config })
      : styleRelearnSweepComponent(supa, component, { config, minDelta: opts.minDelta });

  // 순차 실행(과금·DB 경합 단순화). thumbnail 먼저, title 다음.
  const thumbnail = await perComp("thumbnail");
  const title = await perComp("title");
  return { thumbnail, title };
}
