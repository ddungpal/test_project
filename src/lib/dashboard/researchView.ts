import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import type { VerificationStatus, SourceTier, Freshness, Volatility } from "../../domain/enums.js";
import { normalizeComparison, type ComparisonPayload } from "../../pipeline/comparisonAsset.js";
import { normalizeCaseAsset, type CaseAssetPayload } from "../../pipeline/caseAsset.js";

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
  kind: "number" | "analogy" | "comparison" | "case"; // migration 30: comparison; migration 31: case(표시/연결은 후속 step)
  numericExample: string | null;
  analogy: string | null;
  // comparison 자산일 때만 채워짐(normalizeComparison으로 정규화 — 깨진 payload는 null=표시 제외). number/analogy는 항상 null.
  comparison: ComparisonPayload | null;
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

// ── 셜록 scope 게이트 뷰(research_scoped) — 검증 후보 선택 UI용 읽기전용 뷰모델 ──
//   researchScope.runResearchScope가 stage_proposals(stage='research')에 저장한 candidates를 그대로 노출.
//   ★ 후보를 자르거나 필터링하지 않는다(전부 반환 — 사용자가 전부 보고 선택). 저장 순서(=중요도) 보존.
export interface ScopeCandidateView {
  idx: number; // 전역 candidate idx (action에 그대로 전달)
  kind: "claim" | "concept";
  section: string | null;
  text: string; // claim.text 또는 concept.name
  isFinancial: boolean; // concept은 false
  needsNumber: boolean; // claim은 false
  needsAnalogy: boolean; // claim은 false
  defaultSelected: boolean;
}

export interface ScopeGateView {
  proposalId: string;
  candidates: ScopeCandidateView[];
}

// researchScope.ts가 저장하는 candidate payload(변경 금지) — 읽기용 형태.
interface ScopeCandidateRow {
  idx: number;
  payload:
    | { kind: "claim"; section?: string; default_selected: boolean; text: string; is_financial: boolean }
    | { kind: "concept"; section?: string; default_selected: boolean; name: string; needs_number: boolean; needs_analogy: boolean };
}

export async function getResearchScopeView(runId: string): Promise<ScopeGateView | null> {
  const supa = createAdminClient();

  const { data: proposal, error } = await supa
    .from("stage_proposals")
    .select("id, candidates")
    .eq("run_id", runId)
    .eq("stage", "research")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`research scope proposal 조회 실패: ${error.message}`);
  if (!proposal) return null;

  const rows = (proposal.candidates as unknown as ScopeCandidateRow[]) ?? [];
  const candidates: ScopeCandidateView[] = rows.map((c) => {
    const p = c.payload;
    if (p.kind === "claim") {
      return {
        idx: c.idx,
        kind: "claim",
        section: p.section ?? null,
        text: p.text,
        isFinancial: p.is_financial,
        needsNumber: false,
        needsAnalogy: false,
        defaultSelected: p.default_selected,
      };
    }
    return {
      idx: c.idx,
      kind: "concept",
      section: p.section ?? null,
      text: p.name,
      isFinancial: false,
      needsNumber: p.needs_number,
      needsAnalogy: p.needs_analogy,
      defaultSelected: p.default_selected,
    };
  });

  return { proposalId: proposal.id, candidates };
}

export async function getResearchView(runId: string): Promise<ResearchView> {
  const supa = createAdminClient();

  // facts·assets는 둘 다 runId만 입력 → 서로 독립, 병렬.
  const [factsRes, assetsRes] = await Promise.all([
    supa
      .from("research_facts")
      .select(
        "id, claim, verification_status, source_tier, is_financial, freshness, volatility, primary_source_url, quote_excerpt, independent_origin_count, citation_verified, misleading_check, escalated_to_human, human_approved, as_of_date, source_published_at, data_reference_period, created_at",
      )
      .eq("run_id", runId)
      .order("created_at", { ascending: true }),
    supa
      .from("explanation_assets")
      .select("id, concept, kind, numeric_example, analogy, payload, source_fact_id, math_verified, distortion_checked, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true }),
  ]);

  const { data: facts, error: fe } = factsRes;
  if (fe) throw new Error(`research_facts 조회 실패: ${fe.message}`);

  const { data: assets, error: ae } = assetsRes;
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
    // comparison 자산만 payload를 정규화해 담는다(깨졌으면 null → 표시 제외). number/analogy는 항상 null.
    comparison: a.kind === "comparison" ? normalizeComparison(a.payload) : null,
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
