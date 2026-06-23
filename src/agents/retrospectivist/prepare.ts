// 회고 결정적 prep(§8.1) — 발행 후 성과 + 그때의 선택 + 시청자 반응(집계)을 모아 LLM 입력 1벌로.
//   ★ 거버넌스 C: 댓글 원문은 LLM에 보내지 않는다 — aggregateCommentSignals로 코드 집계만.
//   ★ 성과·A/B·선택은 PII 없음(AI 생성 콘텐츠 + 김짠부 본인 메모) → 전송 가능.

import type { Supa } from "../../pipeline/runState.js";
import type { Json } from "../../lib/supabase/database.types.js";
import type { AbThresholds } from "../../performance/abVerdict.js";
import { judgeComponent } from "../../performance/abVerdict.js";
import { AB_COMPONENTS, type AbComponent, type AbVariantKey, type MetricWindow } from "../../performance/types.js";
import { aggregateCommentSignals } from "../topic_scout/commentSignals.js";

export interface RetroWindow {
  window: MetricWindow;
  views: number | null;
  ctr: number | null;
  avg_view_pct: number | null;
}
export interface RetroAbVariant {
  variant: AbVariantKey;
  label: string | null;
  ctr_pct: number | null;
}
export interface RetroAb {
  component: AbComponent;
  winner: AbVariantKey | null;
  margin: number | null;
  decisiveness: "decisive" | "marginal" | "inconclusive" | null;
  variants: RetroAbVariant[];
}
export interface RetroChoice {
  stage: string;
  chosen: string; // 선택한 후보 요약(제목·썸네일카피·구성 등)
  reason: string | null; // 김짠부가 남긴 선택 이유
}
export interface RetrospectiveInput {
  content: { title: string | null; topic: string | null; format: string | null; upload_date: string | null };
  performance: { windows: RetroWindow[]; ab: RetroAb[] };
  choices: RetroChoice[];
  audience_reaction: { comment_count: number; question_comment_count: number; top_keywords: { term: string; count: number }[] };
  has_performance: boolean; // 성과 데이터 유무(없으면 회고 스킵)
}

/** ab_variants 행들 → 컴포넌트별 판정 요약(margin·decisiveness는 abVerdict로 재계산=단일 출처). */
export function buildAbSummaries(
  rows: { component_type: string; variant: string; ctr_pct: number | null; payload: Json | null }[],
  thresholds: AbThresholds,
): RetroAb[] {
  const out: RetroAb[] = [];
  for (const component of AB_COMPONENTS) {
    const vs = rows.filter((r) => r.component_type === component);
    if (vs.length === 0) continue;
    const verdict = judgeComponent(
      component,
      vs.map((v) => ({ variant: v.variant as AbVariantKey, ctr_pct: v.ctr_pct })),
      thresholds,
    );
    const labelOf = (variant: string): string | null => {
      const p = vs.find((v) => v.variant === variant)?.payload;
      return p && typeof p === "object" && !Array.isArray(p) && typeof (p as Record<string, unknown>).label === "string"
        ? ((p as Record<string, unknown>).label as string)
        : null;
    };
    out.push({
      component,
      winner: verdict.winner,
      margin: verdict.margin,
      decisiveness: verdict.decisiveness,
      variants: verdict.ranked.map((r) => ({ variant: r.variant, label: labelOf(r.variant), ctr_pct: r.ctr_pct })),
    });
  }
  return out;
}

/** 선택한 후보 payload를 LLM이 읽기 좋은 짧은 문자열로(알려진 키 우선, 없으면 압축 JSON). */
export function summarizeChoicePayload(payload: unknown): string {
  if (payload === null || typeof payload !== "object") return String(payload ?? "");
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof p.title === "string") parts.push(`제목: ${p.title}`);
  if (typeof p.thumbnail_copy === "string") parts.push(`썸네일: ${p.thumbnail_copy}`);
  if (typeof p.thumbnail_layout === "string") parts.push(`레이아웃: ${p.thumbnail_layout}`);
  if (Array.isArray(p.outline)) parts.push(`구성: ${p.outline.map((s) => String(s)).join(" → ").slice(0, 240)}`);
  if (typeof p.summary === "string") parts.push(p.summary);
  if (parts.length) return parts.join(" · ");
  const json = JSON.stringify(payload) ?? ""; // 순환참조 등으로 undefined 가능 → 방어.
  return json.length > 280 ? json.slice(0, 280) + "…" : json;
}

/** 발행 후 회고 입력 준비. supa = service-role(admin). thresholds = config.ab. */
export async function prepareRetrospective(supa: Supa, contentId: string, thresholds: AbThresholds): Promise<RetrospectiveInput> {
  // 0) content 메타.
  const { data: content, error: cce } = await supa
    .from("contents")
    .select("title, topic, format, upload_date")
    .eq("id", contentId)
    .maybeSingle();
  if (cce) throw new Error(`contents 조회 실패: ${cce.message}`);
  if (!content) throw new Error(`content를 찾지 못함: ${contentId}`);

  // 1) 성과(performance_metrics overall) — 윈도우 순서 보정.
  const order: Record<MetricWindow, number> = { d1: 0, d7: 1, d14: 2, d30: 3 };
  const { data: pm, error: pe } = await supa
    .from("performance_metrics")
    .select("metric_window, views, ctr, avg_view_pct")
    .eq("content_id", contentId)
    .eq("ab_variant", "overall");
  if (pe) throw new Error(`performance_metrics 조회 실패: ${pe.message}`);
  const windows: RetroWindow[] = (pm ?? [])
    .map((r) => ({ window: r.metric_window as MetricWindow, views: r.views, ctr: r.ctr, avg_view_pct: r.avg_view_pct }))
    .sort((a, b) => order[a.window] - order[b.window]);

  // 2) A/B 회수(ab_variants) → 판정 요약.
  const { data: abRows, error: abe } = await supa
    .from("ab_variants")
    .select("component_type, variant, ctr_pct, payload")
    .eq("content_id", contentId);
  if (abe) throw new Error(`ab_variants 조회 실패: ${abe.message}`);
  const ab = buildAbSummaries(abRows ?? [], thresholds);

  // 3) 그때의 선택 — 이 content의 최신 run의 proposal→selection 코드 조인.
  const choices = await loadChoices(supa, contentId);

  // 4) 발행 후 시청자 반응(거버넌스 C: 원문 비전송·집계만). content_id로 한정(migration 17 백필).
  const { data: comments, error: kce } = await supa
    .from("comments_raw")
    .select("body, like_count")
    .eq("content_id", contentId)
    .is("redacted_at", null)
    .not("body", "is", null)
    .limit(5000);
  if (kce) throw new Error(`comments_raw 조회 실패: ${kce.message}`);
  const agg = aggregateCommentSignals(comments ?? []);

  return {
    content,
    performance: { windows, ab },
    choices,
    audience_reaction: {
      comment_count: agg.comment_count,
      question_comment_count: agg.question_comment_count,
      top_keywords: agg.keyword_signals.slice(0, 12).map((s) => ({ term: s.term, count: s.count })),
    },
    has_performance: windows.length > 0,
  };
}

/** 최신 run의 단계별 선택을 코드 조인으로(임베드 타입추론 불가). */
async function loadChoices(supa: Supa, contentId: string): Promise<RetroChoice[]> {
  const { data: run } = await supa
    .from("production_runs")
    .select("id")
    .eq("content_id", contentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return [];

  const { data: proposals } = await supa
    .from("stage_proposals")
    .select("id, stage, candidates, created_at")
    .eq("run_id", run.id)
    .order("created_at", { ascending: false });
  if (!proposals || proposals.length === 0) return [];

  // 단계별 최신 proposal만.
  const latestByStage = new Map<string, { id: string; candidates: unknown[] }>();
  for (const p of proposals) {
    if (latestByStage.has(p.stage)) continue;
    latestByStage.set(p.stage, { id: p.id, candidates: (p.candidates as unknown[]) ?? [] });
  }
  const proposalIds = [...latestByStage.values()].map((v) => v.id);
  const { data: sels } = await supa
    .from("stage_selections")
    .select("proposal_id, chosen_idx, edited_payload, selection_reason, created_at")
    .in("proposal_id", proposalIds)
    .order("created_at", { ascending: false });
  const selByProposal = new Map<string, { chosen_idx: number | null; edited_payload: unknown | null; reason: string | null }>();
  for (const s of sels ?? []) {
    if (selByProposal.has(s.proposal_id)) continue;
    selByProposal.set(s.proposal_id, { chosen_idx: s.chosen_idx, edited_payload: s.edited_payload, reason: s.selection_reason });
  }

  const stageOrder: Record<string, number> = { topic: 0, title_thumb: 1, structure: 2, research: 3, script: 4 };
  const choices: RetroChoice[] = [];
  for (const [stage, prop] of latestByStage) {
    const sel = selByProposal.get(prop.id);
    if (!sel) continue;
    const cand = sel.chosen_idx !== null ? (prop.candidates[sel.chosen_idx] as { payload?: unknown } | undefined) : undefined;
    const payload = sel.edited_payload ?? cand?.payload ?? null;
    choices.push({ stage, chosen: summarizeChoicePayload(payload), reason: sel.reason });
  }
  return choices.sort((a, b) => (stageOrder[a.stage] ?? 9) - (stageOrder[b.stage] ?? 9));
}
