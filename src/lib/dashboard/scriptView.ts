import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import {
  normalizeSegmentPayload,
  type SegmentKind,
  type TablePayload,
  type CasePayload,
  type VisualPayload,
} from "../../pipeline/segmentBlock.js";
import { isFactPending } from "../../pipeline/scriptFactEligibility.js";
import type { VerificationStatus, SourceTier } from "../../domain/enums.js";

// 짠펜 대본 + lineage + 비용 읽기(Phase 3.4) — 서버 컴포넌트 전용. admin(읽기전용).

// 최종검수 인라인 칩(autoflow §D)에 필요한 fact 최소 필드. researchView.FactView의 필드명 컨벤션
//   (verificationStatus·sourceTier·primarySourceUrl·isFinancial)을 따른다. pending=isFactPending(★ 재사용).
//   기존 소비처(SegmentList.LineageFooter)는 id·claim만 읽음 → 필드 추가는 하위호환.
export interface SegmentFactView {
  id: string;
  claim: string;
  pending: boolean; // isFactPending(escalated && human_approved=null) — '확인 필요' 칩
  verificationStatus: VerificationStatus;
  sourceTier: SourceTier | null;
  primarySourceUrl: string | null;
  isFinancial: boolean;
}

export interface SegmentView {
  id: string;
  ord: number;
  text: string;
  kind: SegmentKind;
  payload: TablePayload | CasePayload | VisualPayload | null;
  facts: SegmentFactView[];
  assets: { id: string; concept: string; kind: "number" | "analogy" | "comparison" | "case" }[];
}

export async function getScriptView(runId: string): Promise<SegmentView[]> {
  const supa = createAdminClient();

  const { data: segs, error: se } = await supa
    .from("script_segments")
    .select("id, ord, text, kind, payload")
    .eq("run_id", runId)
    .order("ord", { ascending: true });
  if (se) throw new Error(`script_segments 조회 실패: ${se.message}`);
  if (!segs || segs.length === 0) return [];

  const segIds = segs.map((s) => s.id);

  // lineage: segment ↔ fact / asset (조인 테이블 → 대상 텍스트 조회 후 코드 조인).
  //   sfLinks·saLinks는 둘 다 segIds만 입력 → 서로 독립, 병렬.
  const [sfRes, saRes] = await Promise.all([
    supa.from("script_segment_facts").select("segment_id, fact_id").in("segment_id", segIds),
    supa.from("script_segment_explanation_assets").select("segment_id, asset_id").in("segment_id", segIds),
  ]);

  const { data: sfLinks, error: fle } = sfRes;
  if (fle) throw new Error(`segment_facts 조회 실패: ${fle.message}`);

  const { data: saLinks, error: ale } = saRes;
  if (ale) throw new Error(`segment_assets 조회 실패: ${ale.message}`);

  const factIds = [...new Set((sfLinks ?? []).map((l) => l.fact_id))];
  const assetIds = [...new Set((saLinks ?? []).map((l) => l.asset_id))];

  // factById·assetById는 서로 독립(각각 factIds/assetIds만) → 병렬. 빈 입력 시 쿼리 스킵 가드 유지.
  const [factsRes, assetsRes] = await Promise.all([
    factIds.length
      ? supa
          .from("research_facts")
          .select("id, claim, human_approved, escalated_to_human, verification_status, source_tier, primary_source_url, is_financial")
          .in("id", factIds)
      : Promise.resolve(null),
    assetIds.length
      ? supa.from("explanation_assets").select("id, concept, kind").in("id", assetIds)
      : Promise.resolve(null),
  ]);

  const factById = new Map<string, SegmentFactView>();
  if (factIds.length) {
    const { data, error } = factsRes ?? { data: null, error: null };
    if (error) throw new Error(`fact 조회 실패: ${error.message}`);
    for (const f of data ?? [])
      factById.set(f.id, {
        id: f.id,
        claim: f.claim,
        // pending: 보류('확인 필요') — isFactPending 재사용(escalated_to_human && human_approved=null).
        pending: isFactPending({ human_approved: f.human_approved, escalated_to_human: f.escalated_to_human }),
        verificationStatus: f.verification_status as VerificationStatus,
        sourceTier: f.source_tier as SourceTier | null,
        primarySourceUrl: f.primary_source_url,
        isFinancial: f.is_financial,
      });
  }
  const assetById = new Map<string, { id: string; concept: string; kind: "number" | "analogy" | "comparison" | "case" }>();
  if (assetIds.length) {
    const { data, error } = assetsRes ?? { data: null, error: null };
    if (error) throw new Error(`asset 조회 실패: ${error.message}`);
    for (const a of data ?? []) assetById.set(a.id, { id: a.id, concept: a.concept, kind: a.kind });
  }

  const factsBySeg = new Map<string, SegmentFactView[]>();
  for (const l of sfLinks ?? []) {
    const f = factById.get(l.fact_id);
    if (!f) continue;
    const arr = factsBySeg.get(l.segment_id) ?? [];
    arr.push(f);
    factsBySeg.set(l.segment_id, arr);
  }
  const assetsBySeg = new Map<string, { id: string; concept: string; kind: "number" | "analogy" | "comparison" | "case" }[]>();
  for (const l of saLinks ?? []) {
    const a = assetById.get(l.asset_id);
    if (!a) continue;
    const arr = assetsBySeg.get(l.segment_id) ?? [];
    arr.push(a);
    assetsBySeg.set(l.segment_id, arr);
  }

  return segs.map((s) => {
    // DB에서 온 값도 단일 출처(normalizeSegmentPayload)로 한 번 더 통과 — 깨진 데모시드 방어.
    const { kind, payload } = normalizeSegmentPayload(s.kind, s.payload);
    return {
      id: s.id,
      ord: s.ord,
      text: s.text,
      kind,
      payload,
      facts: factsBySeg.get(s.id) ?? [],
      assets: assetsBySeg.get(s.id) ?? [],
    };
  });
}

// ── 비용 뷰 ──
export interface CostEntry {
  category: string;
  detail: string | null;
  costUsd: number;
  tokens: number | null;
  latencyMs: number | null;
  createdAt: string;
}
export interface CostView {
  total: number;
  byCategory: { category: string; cost: number }[];
  entries: CostEntry[];
}

export async function getCostView(runId: string): Promise<CostView> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("cost_ledger")
    .select("category, detail, cost_usd, tokens, latency_ms, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`cost_ledger 조회 실패: ${error.message}`);

  const entries: CostEntry[] = (data ?? []).map((e) => ({
    category: e.category,
    detail: e.detail,
    costUsd: e.cost_usd,
    tokens: e.tokens,
    latencyMs: e.latency_ms,
    createdAt: e.created_at,
  }));

  const catMap = new Map<string, number>();
  let total = 0;
  for (const e of entries) {
    catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.costUsd);
    total += e.costUsd;
  }
  return {
    total,
    byCategory: [...catMap.entries()].map(([category, cost]) => ({ category, cost })),
    entries,
  };
}
