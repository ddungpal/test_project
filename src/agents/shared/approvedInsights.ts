// 환류(Phase 4 슬라이스 4) — 승인된 학습 인사이트를 차기 런 prepare에 주입하는 공유 헬퍼.
//   학습 루프를 닫는다: 성과 → 회고 → 인사이트 draft → (사람 승인) → 여기서 다음 제작에 반영.
//   ★ status='approved'만 환류(슬라이스 3에서 승인을 게이트로 확정). draft/reviewed는 아직 미반영.
//   ★ 결정성/픽스처 보존: 호출부는 결과가 '비었으면' input/system을 건드리지 않는다(해시 불변).

import type { Supa } from "../../pipeline/runState.js";
import type { InsightCategory } from "../retrospectivist/schema.js";

export interface LearnedInsight {
  id: string; // "insight:<uuid>" — 후보 evidence_ids로 링크
  category: string;
  rule: string; // 한 줄 규칙(insights.title)
  detail: string; // 근거·적용법(insights.body)
  confidence: number | null;
}

interface InsightRow {
  id: string;
  category: string;
  title: string | null;
  body: string | null;
  confidence: number | null;
  valid_until: string | null;
}

/** 유효기간 필터(순수) — valid_until 없으면 영구, 있으면 asOf(YYYY-MM-DD) 이전 만료분 제외. */
export function filterValidInsights<T extends { valid_until: string | null }>(rows: T[], asOf: string): T[] {
  return rows.filter((r) => !r.valid_until || r.valid_until >= asOf);
}

/** 승인된 인사이트를 카테고리로 로드(신뢰도 내림차순). asOf 미지정 시 오늘 기준. */
export async function loadApprovedInsights(
  supa: Supa,
  categories: readonly InsightCategory[],
  opts: { asOf?: string; limit?: number } = {},
): Promise<LearnedInsight[]> {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supa
    .from("insights")
    .select("id, category, title, body, confidence, valid_until")
    .eq("status", "approved")
    .in("category", [...categories])
    // 완전 정렬(동점 tie-break) — prepare input/system에 들어가므로 순서가 흔들리면 promptHash가 변동한다.
    .order("confidence", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(opts.limit ?? 10);
  if (error) throw new Error(`승인 인사이트 조회 실패: ${error.message}`);
  return filterValidInsights((data ?? []) as InsightRow[], asOf).map((r) => ({
    id: `insight:${r.id}`,
    category: r.category,
    rule: r.title ?? "",
    detail: r.body ?? "",
    confidence: r.confidence,
  }));
}

/** 시스템 프롬프트에 학습 규칙 섹션을 덧붙인다(순수). 비었으면 원본 그대로(해시 불변). */
export function appendLearnedInsights(system: string, insights: LearnedInsight[]): string {
  if (insights.length === 0) return system;
  const lines = insights.map((i) => {
    const conf = i.confidence !== null ? ` (신뢰도 ${Math.round(i.confidence * 100)}%)` : "";
    const detail = i.detail.length > 160 ? i.detail.slice(0, 160) + "…" : i.detail;
    return `  - [${i.category}] ${i.rule}${conf} — ${detail} (${i.id})`;
  });
  return [
    system,
    "",
    "── 과거 회고에서 김짠부가 '승인'한 학습 규칙(반드시 반영) ──",
    "지난 영상들의 성과 회고에서 승인된 규칙이다. 이번 제안에 적극 적용하고,",
    "어떤 규칙을 따랐는지 해당 후보의 evidence_ids에 그 id(insight:…)를 포함하라.",
    "(이 경우 'insight:'도 위 유효 접두사 목록에 더해진 정식 evidence 접두사다.)",
    ...lines,
  ].join("\n");
}
