import "server-only";
import { createAdminClient } from "../supabase/admin.js";

// 짠펜 대본 + lineage + 비용 읽기(Phase 3.4) — 서버 컴포넌트 전용. admin(읽기전용).

export interface SegmentView {
  id: string;
  ord: number;
  text: string;
  facts: { id: string; claim: string }[];
  assets: { id: string; concept: string; kind: "number" | "analogy" }[];
}

export async function getScriptView(runId: string): Promise<SegmentView[]> {
  const supa = createAdminClient();

  const { data: segs, error: se } = await supa
    .from("script_segments")
    .select("id, ord, text")
    .eq("run_id", runId)
    .order("ord", { ascending: true });
  if (se) throw new Error(`script_segments 조회 실패: ${se.message}`);
  if (!segs || segs.length === 0) return [];

  const segIds = segs.map((s) => s.id);

  // lineage: segment ↔ fact / asset (조인 테이블 → 대상 텍스트 조회 후 코드 조인).
  const { data: sfLinks, error: fle } = await supa
    .from("script_segment_facts")
    .select("segment_id, fact_id")
    .in("segment_id", segIds);
  if (fle) throw new Error(`segment_facts 조회 실패: ${fle.message}`);

  const { data: saLinks, error: ale } = await supa
    .from("script_segment_explanation_assets")
    .select("segment_id, asset_id")
    .in("segment_id", segIds);
  if (ale) throw new Error(`segment_assets 조회 실패: ${ale.message}`);

  const factIds = [...new Set((sfLinks ?? []).map((l) => l.fact_id))];
  const assetIds = [...new Set((saLinks ?? []).map((l) => l.asset_id))];

  const factById = new Map<string, { id: string; claim: string }>();
  if (factIds.length) {
    const { data, error } = await supa.from("research_facts").select("id, claim").in("id", factIds);
    if (error) throw new Error(`fact 조회 실패: ${error.message}`);
    for (const f of data ?? []) factById.set(f.id, { id: f.id, claim: f.claim });
  }
  const assetById = new Map<string, { id: string; concept: string; kind: "number" | "analogy" }>();
  if (assetIds.length) {
    const { data, error } = await supa.from("explanation_assets").select("id, concept, kind").in("id", assetIds);
    if (error) throw new Error(`asset 조회 실패: ${error.message}`);
    for (const a of data ?? []) assetById.set(a.id, { id: a.id, concept: a.concept, kind: a.kind });
  }

  const factsBySeg = new Map<string, { id: string; claim: string }[]>();
  for (const l of sfLinks ?? []) {
    const f = factById.get(l.fact_id);
    if (!f) continue;
    const arr = factsBySeg.get(l.segment_id) ?? [];
    arr.push(f);
    factsBySeg.set(l.segment_id, arr);
  }
  const assetsBySeg = new Map<string, { id: string; concept: string; kind: "number" | "analogy" }[]>();
  for (const l of saLinks ?? []) {
    const a = assetById.get(l.asset_id);
    if (!a) continue;
    const arr = assetsBySeg.get(l.segment_id) ?? [];
    arr.push(a);
    assetsBySeg.set(l.segment_id, arr);
  }

  return segs.map((s) => ({
    id: s.id,
    ord: s.ord,
    text: s.text,
    facts: factsBySeg.get(s.id) ?? [],
    assets: assetsBySeg.get(s.id) ?? [],
  }));
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
