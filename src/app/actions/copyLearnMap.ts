// 카피 학습 저장(copy-learning-admin step0) — 순수 매핑 로직(DB·네트워크·server-only 무관 → 테스트 import 용).
//   서버액션 copyLearn.ts 가 이 함수들을 호출한다. ingest-ab.ts mapVideoToAbRows 패턴 미러.
//   ★ 여기에 server-only 의존(auth/admin) 금지 — vitest(node)에서 직접 import 되어야 함.

import {
  judgeComponent,
  type AbScoreInput,
  type AbThresholds,
  type AbVerdict,
} from "../../performance/abVerdict.js";
import type { AbVariantKey } from "../../performance/types.js";
import type { Json, TablesInsert } from "../../lib/supabase/database.types.js";
import type { OwnerFeedbackCandidates } from "../../agents/owner_feedback/schema.js";

export interface CopyAbInput {
  contentId?: string;
  youtubeVideoId?: string;
  ctr24h: number | null;
  views24h: number | null;
  thumbnail: { variant: AbVariantKey; copyMain: string[]; copyBoxes: string[]; watchShare: number | null }[];
  title: { hasAbTest: boolean; variants: { variant: AbVariantKey; text: string; watchShare: number | null }[] };
}

/** mapCopyAbToRows 의 순수 출력. ab_variants 행 + 썸네일 판정(contents.ab_* 파생용). */
export interface CopyAbMapping {
  abRows: TablesInsert<"ab_variants">[];
  thumbnailVerdict: AbVerdict | null; // 썸네일 변형 ≥1일 때만(contents.ab_* 캐시 파생 입력)
}

/** 입력 정제 — 공백 trim + 빈 문자열 제거. payload에 빈 값 누출 차단. */
function cleanStrings(arr: string[]): string[] {
  return arr.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * CopyAbInput → ab_variants 행 배열(순수 변환 — DB·네트워크 무관). ingest-ab.ts mapVideoToAbRows 패턴 미러.
 *   - 썸네일: payload {copy_main, copy_boxes}, ctr_pct=watchShare, judgeComponent('thumbnail') 재계산(rank·is_winner).
 *   - 제목 hasAbTest=true: 변형들 payload {title} + watchShare → judgeComponent('title') 재계산.
 *   - 제목 hasAbTest=false: 단일 variant='A' payload {title}, ctr_pct=null, is_winner=true. A/B 판정 안 함(영상 내 비교 없음).
 *   - 같은 입력 2회 → 동일 행 배열(멱등). 입력 rank/winner 맹신 안 함(judgeComponent 권위).
 */
export function mapCopyAbToRows(input: CopyAbInput, contentId: string, thresholds: AbThresholds): CopyAbMapping {
  const abRows: TablesInsert<"ab_variants">[] = [];

  // 1) 썸네일 — judgeComponent 재계산.
  let thumbnailVerdict: AbVerdict | null = null;
  if (input.thumbnail.length > 0) {
    const scoreInputs: AbScoreInput[] = input.thumbnail.map((t) => ({
      variant: t.variant,
      ctr_pct: t.watchShare ?? null,
      impressions: null,
    }));
    const verdict = judgeComponent("thumbnail", scoreInputs, thresholds);
    thumbnailVerdict = verdict;
    for (const rv of verdict.ranked) {
      const src = input.thumbnail.find((t) => t.variant === rv.variant);
      const payload: Json = {
        copy_main: cleanStrings(src?.copyMain ?? []),
        copy_boxes: cleanStrings(src?.copyBoxes ?? []),
      };
      abRows.push({
        content_id: contentId,
        component_type: "thumbnail",
        variant: rv.variant,
        payload,
        ctr_pct: rv.ctr_pct ?? null, // = watchShare(영상 전체 CTR 아님 — 변형별 점유율)
        impressions: null,
        weight: null,
        rank: rv.rank,
        is_winner: rv.is_winner,
      });
    }
  }

  // 2) 제목 — A/B 모드면 judgeComponent, 단일 모드면 variant='A' 1행(판정 안 함).
  if (input.title.hasAbTest) {
    const scoreInputs: AbScoreInput[] = input.title.variants.map((t) => ({
      variant: t.variant,
      ctr_pct: t.watchShare ?? null,
      impressions: null,
    }));
    const verdict = judgeComponent("title", scoreInputs, thresholds);
    for (const rv of verdict.ranked) {
      const src = input.title.variants.find((t) => t.variant === rv.variant);
      abRows.push({
        content_id: contentId,
        component_type: "title",
        variant: rv.variant,
        payload: { title: src?.text.trim() ?? "" },
        ctr_pct: rv.ctr_pct ?? null,
        impressions: null,
        weight: null,
        rank: rv.rank,
        is_winner: rv.is_winner,
      });
    }
  } else {
    // 단일 모드: 영상 대표 제목 1개. A/B 비교 없음(영상간 학습은 step1).
    const sole = input.title.variants[0];
    abRows.push({
      content_id: contentId,
      component_type: "title",
      variant: "A",
      payload: { title: sole?.text.trim() ?? "" },
      ctr_pct: null,
      impressions: null,
      weight: null,
      rank: 1,
      is_winner: true,
    });
  }

  return { abRows, thumbnailVerdict };
}

/** 새 학습 영상 추가 입력(/copy-learn 학습영상 등록). title 필수, 나머지는 선택. */
export interface NewLearningVideoInput {
  title: string;            // 필수(라벨·표시용)
  youtubeVideoId?: string;  // 선택(있으면 멱등 매칭 키)
  uploadDate?: string;      // 선택(YYYY-MM-DD)
  thumbnailUrl?: string;    // 선택(카드 미리보기)
}

/**
 * 학습 전용 contents stub 행(순수 — DB·네트워크 무관). ingest-ab.ts resolveOrStubContentId 스텁 미러.
 *   - source='produced' 고정(참조편 드롭다운 오염 방지 — 'imported' 금지), status='in_production', title=trim.
 *   - youtube_video_id/upload_date/thumbnail_url 은 trim 후 값이 있을 때만 키 추가
 *     (빈 문자열 누출 차단 · exactOptionalPropertyTypes 준수 — undefined 대입 안 함).
 */
export function buildLearningVideoStub(input: NewLearningVideoInput): TablesInsert<"contents"> {
  const stub: TablesInsert<"contents"> = {
    source: "produced",
    status: "in_production",
    title: input.title.trim(),
  };
  const vid = input.youtubeVideoId?.trim();
  if (vid) stub.youtube_video_id = vid;
  const uploadDate = input.uploadDate?.trim();
  if (uploadDate) stub.upload_date = uploadDate;
  const thumb = input.thumbnailUrl?.trim();
  if (thumb) stub.thumbnail_url = thumb;
  return stub;
}

/** 교정쌍(생성↔이상 카피) 입력 — /copy-learn 교정 UI(step3). 썸네일이면 main/boxes, 제목이면 title. */
export interface CorrectionInput {
  componentType: "thumbnail" | "title";
  topic?: string;
  genMain?: string[]; genBoxes?: string[];   // 썸네일 — AI 생성
  idealMain?: string[]; idealBoxes?: string[]; // 썸네일 — 김짠부 이상
  genTitle?: string; idealTitle?: string;      // 제목 — 생성/이상
}

/** 교정쌍 payload(gen|ideal) 빌드 — ab_variants 모양과 동일(드리프트 0). 썸네일 {copy_main,copy_boxes} | 제목 {title}. */
function buildCorrectionPayload(componentType: "thumbnail" | "title", main: string[] | undefined, boxes: string[] | undefined, title: string | undefined): Json {
  if (componentType === "thumbnail") {
    return { copy_main: cleanStrings(main ?? []), copy_boxes: cleanStrings(boxes ?? []) };
  }
  return { title: title?.trim() ?? "" };
}

/**
 * CorrectionInput → thumbnail_corrections 행(순수 변환 — DB·네트워크 무관).
 *   - gen_payload/ideal_payload 모양은 ab_variants(mapCopyAbToRows)와 일치: 썸네일 {copy_main,copy_boxes} | 제목 {title}.
 *   - cleanStrings 재사용(trim·빈문자 제거). 빈 값 누출 차단.
 *   - learned_at(step2)·diff(step1)는 넣지 않는다 — 후속 step 책임.
 *   - topic 은 trim 후 값 있을 때만 키 추가(exactOptionalPropertyTypes — undefined 대입 안 함, buildLearningVideoStub 패턴).
 */
export function buildCorrectionRow(input: CorrectionInput): TablesInsert<"thumbnail_corrections"> {
  const row: TablesInsert<"thumbnail_corrections"> = {
    component_type: input.componentType,
    gen_payload: buildCorrectionPayload(input.componentType, input.genMain, input.genBoxes, input.genTitle),
    ideal_payload: buildCorrectionPayload(input.componentType, input.idealMain, input.idealBoxes, input.idealTitle),
  };
  const topic = input.topic?.trim();
  if (topic) row.topic = topic;
  return row;
}

/** UI의 component 선택 → style_profiles.component_type. 썸네일 카피는 thumbnail_copy, 비유는 analogy_style,
 *   김짠부 직접 피드백 최우선 규칙은 title_owner_rules·thumbnail_owner_rules. */
export type CopyComponent = "thumbnail" | "title" | "analogy" | "title_owner" | "thumbnail_owner";
export function componentTypeFor(
  component: CopyComponent,
): "thumbnail_copy" | "title" | "analogy_style" | "title_owner_rules" | "thumbnail_owner_rules" {
  if (component === "thumbnail") return "thumbnail_copy";
  if (component === "analogy") return "analogy_style";
  if (component === "title_owner") return "title_owner_rules";
  if (component === "thumbnail_owner") return "thumbnail_owner_rules";
  return "title";
}

/** owner rules draft 의 provenance 한 건 — 원문 피드백·후보·주제를 보존(뉘앙스 유실 완화). */
export interface OwnerRuleSource {
  topic?: string;
  candidates: OwnerFeedbackCandidates;
  feedback: string;
}

/**
 * owner rules draft 의 patterns jsonb 를 순수 조립(DB·server-only 무관).
 *   - rules = 병합된 최우선 규칙셋(추출기 결과). sources = 이전 provenance + 이번 1건 누적.
 *   - style_profiles.patterns 에 그대로 저장된다: { rules, sources }.
 */
export function buildOwnerRulesDraftPatterns(
  prevSources: OwnerRuleSource[],
  rules: string[],
  newSource: OwnerRuleSource,
): { rules: string[]; sources: OwnerRuleSource[] } {
  return { rules, sources: [...prevSources, newSource] };
}

/** performance_metrics d1 overall 1행(순수 변환). ctr=ctr24h, views=views24h. */
export function mapCtr24hToMetricRow(input: CopyAbInput, contentId: string, nowIso: string): TablesInsert<"performance_metrics"> {
  return {
    content_id: contentId,
    metric_window: "d1",
    ctr: input.ctr24h,
    views: input.views24h,
    ab_variant: "overall",
    recorded_at: nowIso,
  };
}
