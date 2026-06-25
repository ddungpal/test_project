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

export interface CopyAbInput {
  contentId?: string;
  youtubeVideoId?: string;
  ctr24h: number | null;
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

/** UI의 component 선택("thumbnail"|"title") → style_profiles.component_type. 썸네일 카피는 thumbnail_copy. */
export type CopyComponent = "thumbnail" | "title";
export function componentTypeFor(component: CopyComponent): "thumbnail_copy" | "title" {
  return component === "thumbnail" ? "thumbnail_copy" : "title";
}

/** performance_metrics d1 overall 1행(순수 변환). ctr=ctr24h. */
export function mapCtr24hToMetricRow(input: CopyAbInput, contentId: string, nowIso: string): TablesInsert<"performance_metrics"> {
  return {
    content_id: contentId,
    metric_window: "d1",
    ctr: input.ctr24h,
    ab_variant: "overall",
    recorded_at: nowIso,
  };
}
