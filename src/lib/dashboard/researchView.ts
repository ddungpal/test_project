import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import type { VerificationStatus, SourceTier, Freshness, Volatility } from "../../domain/enums.js";

// 리서치 검수 읽기(Phase 3.3) — 서버 컴포넌트 전용. admin(읽기전용).

export interface FactView {
  id: string;
  claim: string;
  verificationStatus: VerificationStatus;
  sourceTier: SourceTier | null;
  isFinancial: boolean;
  freshness: Freshness | null;
  volatility: Volatility | null;
  primarySourceUrl: string | null;
  quoteExcerpt: string | null;
  independentOriginCount: number;
  citationVerified: boolean;
  misleadingCheck: string | null;
  escalatedToHuman: boolean;
  humanApproved: boolean | null;
  asOfDate: string | null;
  sourcePublishedAt: string | null;
  dataReferencePeriod: string | null;
}

export interface AssetView {
  id: string;
  concept: string;
  kind: "number" | "analogy";
  numericExample: string | null;
  analogy: string | null;
  sourceFactId: string | null;
  mathVerified: boolean | null;
  distortionChecked: boolean | null;
}

export interface ResearchView {
  facts: FactView[];
  assets: AssetView[];
  escalated: FactView[];
  autoPassedCount: number;
}

export async function getResearchView(runId: string): Promise<ResearchView> {
  const supa = createAdminClient();

  const { data: facts, error: fe } = await supa
    .from("research_facts")
    .select(
      "id, claim, verification_status, source_tier, is_financial, freshness, volatility, primary_source_url, quote_excerpt, independent_origin_count, citation_verified, misleading_check, escalated_to_human, human_approved, as_of_date, source_published_at, data_reference_period, created_at",
    )
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (fe) throw new Error(`research_facts 조회 실패: ${fe.message}`);

  const { data: assets, error: ae } = await supa
    .from("explanation_assets")
    .select("id, concept, kind, numeric_example, analogy, source_fact_id, math_verified, distortion_checked, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (ae) throw new Error(`explanation_assets 조회 실패: ${ae.message}`);

  const factViews: FactView[] = (facts ?? []).map((f) => ({
    id: f.id,
    claim: f.claim,
    verificationStatus: f.verification_status as VerificationStatus,
    sourceTier: f.source_tier as SourceTier | null,
    isFinancial: f.is_financial,
    freshness: f.freshness as Freshness | null,
    volatility: f.volatility as Volatility | null,
    primarySourceUrl: f.primary_source_url,
    quoteExcerpt: f.quote_excerpt,
    independentOriginCount: f.independent_origin_count,
    citationVerified: f.citation_verified,
    misleadingCheck: f.misleading_check,
    escalatedToHuman: f.escalated_to_human,
    humanApproved: f.human_approved,
    asOfDate: f.as_of_date,
    sourcePublishedAt: f.source_published_at,
    dataReferencePeriod: f.data_reference_period,
  }));

  const assetViews: AssetView[] = (assets ?? []).map((a) => ({
    id: a.id,
    concept: a.concept,
    kind: a.kind,
    numericExample: a.numeric_example,
    analogy: a.analogy,
    sourceFactId: a.source_fact_id,
    mathVerified: a.math_verified,
    distortionChecked: a.distortion_checked,
  }));

  const escalated = factViews.filter((f) => f.escalatedToHuman);
  return {
    facts: factViews,
    assets: assetViews,
    escalated,
    autoPassedCount: factViews.length - escalated.length,
  };
}
