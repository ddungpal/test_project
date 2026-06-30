// 리서치 리콘실(코드, AI 없음) — fan-out 결과를 7무결성가드로 정규화. §9.
//   셀(researchCell)은 "누가 병렬로 도는지"만 선언하고, 검증·삼각검증·강등은 전부 여기서.
import { isVerifiedValid, type VerificationStatus, type Freshness } from "../domain/enums.js";
import type { FactVerifierOutput } from "../agents/fact_verifier/schema.js";
import type { VerifyClaimResult } from "../agents/fact_verifier/step.js";
import type { NumbersOutput } from "../agents/numbers/schema.js";
import type { AnalogistOutput } from "../agents/analogist/schema.js";
import type { ComparatorOutput } from "../agents/comparator/schema.js";
import { normalizeComparison } from "./comparisonAsset.js";
import type { Json } from "../lib/supabase/database.types.js";

/** "a * b = c" 형태 검산. 안전 문자만 매칭 후 평가. 통과=true/실패=false/판별불가=null. */
export function checkArithmetic(calc: string): boolean | null {
  const m = calc.replace(/,/g, "").match(/^\s*([0-9+\-*/.()\s]+?)\s*=\s*([0-9.]+)\s*$/);
  if (!m) return null;
  try {
    // m[1]은 정규식으로 [0-9+-*/.() ]만 허용된 상태 → Function 평가 안전.
    const lhs = Function(`"use strict";return (${m[1]})`)() as number;
    const rhs = parseFloat(m[2]!);
    if (!isFinite(lhs) || !isFinite(rhs)) return null;
    // 금액 계산은 '정확'해야 한다(코드리뷰: 1% 허용은 과대) — 부동소수 오차만 흡수(상대 1e-6).
    return Math.abs(lhs - rhs) <= Math.abs(rhs) * 1e-6 + 1e-6;
  } catch {
    return null;
  }
}

/** 인용문이 '실제' 검색결과에 실재하는지(§9-②). ★ [MOCK] 더미 결과는 통째로 제외 후 매칭(코드리뷰 P0 — mock 우회 차단). */
export function quoteIsReal(quote: string | null | undefined, results: { title: string; content: string }[]): boolean {
  if (!quote) return false;
  const realResults = results.filter((r) => !r.content.includes("[MOCK") && !r.title.includes("[MOCK"));
  return realResults.some((r) => r.content.includes(quote));
}

export interface FactRow {
  run_id: string;
  claim: string;
  verification_status: VerificationStatus;
  source_tier: FactVerifierOutput["source_tier"];
  primary_source_url: string | null;
  independent_origin_count: number;
  quote_excerpt: string | null;
  citation_verified: boolean;
  is_financial: boolean;
  misleading_check: string | null;
  as_of_date: string;
  freshness: Freshness;
  escalated_to_human: boolean;
}

/** fan-out된 검증 결과 → research_facts 행. 7무결성가드(인용 실재·삼각검증·verified 게이트·트리아지) 강제. */
export function reconcileFacts(runId: string, facts: VerifyClaimResult[], asOfDate: string): FactRow[] {
  return facts.map(({ claim, results, v }) => {
    // §9-②④: mock/인용 부재 → 강등. quote가 '실제' 검색결과 content에 실재하는지 코드로 재확인([MOCK] 제외).
    const quote = v.quote_excerpt;
    const citation_verified = v.citation_verified && quoteIsReal(quote, results);
    const distinctPublishers = new Set(results.map((r) => r.publisher).filter(Boolean)).size;
    const independent_origin_count = Math.min(v.independent_origin_count, distinctPublishers);

    let status: VerificationStatus = v.verification_status;
    // §9-④: 인용 미검증이면 verified 불가.
    if (status === "verified" && !citation_verified) status = "could_not_verify";
    // §5/§9-①⑥: verified 합격 정의 코드 게이트(DB CHECK와 동일) — 불충족 시 강등(insert 실패 방지).
    const candidate = { verificationStatus: status, independentOriginCount: independent_origin_count, citationVerified: citation_verified, isFinancial: claim.is_financial, sourceTier: v.source_tier, quoteExcerpt: citation_verified ? quote : null };
    if (status === "verified" && !isVerifiedValid(candidate)) status = "unverified";

    const freshness = v.freshness as Freshness;
    // §11 트리아지: 금융 || 미검증/충돌/불가 || stale → 사람 검수 에스컬레이션.
    const escalated = claim.is_financial || status !== "verified" || freshness === "stale";

    return {
      run_id: runId,
      claim: claim.text,
      verification_status: status,
      source_tier: v.source_tier,
      primary_source_url: v.primary_source_url,
      independent_origin_count,
      quote_excerpt: citation_verified ? quote : null,
      citation_verified,
      is_financial: claim.is_financial,
      misleading_check: v.misleading_check,
      as_of_date: asOfDate,
      freshness,
      escalated_to_human: escalated,
    };
  });
}

export interface AssetRow {
  run_id: string;
  concept: string;
  kind: "number" | "analogy" | "comparison";
  numeric_example?: string;
  analogy?: string;
  payload?: Json; // 비교 자산(kind='comparison') — normalizeComparison 통과한 ComparisonPayload. step0이 DB payload(jsonb) 컬럼 추가.
  created_by: string;
  math_verified?: boolean | null;
  distortion_checked?: boolean;
  used_in_script: boolean;
}

/** 셈이·유이·비교가 자산 → explanation_assets 행. 숫자는 코드 검산, 비유는 왜곡노트 유무, 비교는 normalizeComparison으로 검증.
 *  comparisonAssets는 optional(기본 []) — 기존 호출부(examples 재진입)는 안 넘겨도 동작 불변(number/analogy 빌드 불변). */
export function buildAssetRows(
  runId: string,
  numberAssets: NumbersOutput["assets"],
  analogyAssets: AnalogistOutput["assets"],
  comparisonAssets: ComparatorOutput["assets"] = [],
): AssetRow[] {
  return [
    ...numberAssets.map((a) => ({
      run_id: runId, concept: a.concept, kind: "number" as const, numeric_example: a.numeric_example,
      created_by: "numbers", math_verified: checkArithmetic(a.calculation), used_in_script: false,
    })),
    ...analogyAssets.map((a) => ({
      run_id: runId, concept: a.concept, kind: "analogy" as const, analogy: a.analogy,
      created_by: "analogist", distortion_checked: a.distortion_note.trim().length > 0, used_in_script: false,
    })),
    // ★ comparator는 cell에 grounded를 주는데 normalizeComparison은 verified를 기대 → grounded→verified 매핑.
    //   normalizeComparison이 null(깨졌거나 entities<2·빈 표)이면 그 자산은 드랍(row 미생성 — money-safety).
    ...comparisonAssets.flatMap((a) => {
      const payload = normalizeComparison({
        entities: a.entities,
        dimensions: a.dimensions,
        cells: a.cells.map((c) => ({ dimension: c.dimension, entity: c.entity, value: c.value, verified: c.grounded })),
      });
      if (!payload) return [];
      // ComparisonPayload는 런타임상 Json 호환(중첩 string/boolean/배열)이나 인덱스 시그니처가 없어 캐스팅.
      return [{
        run_id: runId, concept: a.concept, kind: "comparison" as const, payload: payload as unknown as Json,
        created_by: "comparator", used_in_script: false,
      }];
    }),
  ];
}
