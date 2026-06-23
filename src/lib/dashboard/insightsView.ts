import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import type { InsightCategory } from "../../agents/retrospectivist/schema.js";
import type { InsightStatus } from "../../domain/insightStatus.js";

// 인사이트 승인(Phase 4 슬라이스 3) 읽기 — 서버 전용. admin 클라이언트(바이패스와 짝, 읽기전용).
//   회고가 만든 학습 노트(insights)를 상태별로 묶어 보여준다. source content는 코드 조인(임베드 추론 불가).

export interface InsightView {
  id: string;
  category: InsightCategory;
  title: string | null;
  body: string | null;
  confidence: number | null;
  status: InsightStatus;
  sourceType: string | null;
  sourceLabel: string | null; // 회고 기원 영상 제목/주제(있으면)
  validUntil: string | null;
  createdAt: string;
}

export interface InsightsBoard {
  byStatus: Record<InsightStatus, InsightView[]>;
  total: number;
  draftCount: number;
}

const EMPTY = (): Record<InsightStatus, InsightView[]> => ({ draft: [], reviewed: [], approved: [], deprecated: [] });

export async function getInsightsBoard(): Promise<InsightsBoard> {
  const supa = createAdminClient();
  const { data: rows, error } = await supa
    .from("insights")
    .select("id, category, title, body, confidence, status, source_type, source_content_id, valid_until, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`인사이트 조회 실패: ${error.message}`);

  // source content 라벨 코드 조인(있는 것만).
  const contentIds = [...new Set((rows ?? []).map((r) => r.source_content_id).filter((v): v is string => !!v))];
  const labelById = new Map<string, string>();
  if (contentIds.length > 0) {
    const { data: contents } = await supa.from("contents").select("id, title, topic").in("id", contentIds);
    for (const c of contents ?? []) labelById.set(c.id, c.title || c.topic || "(제목 미정)");
  }

  const byStatus = EMPTY();
  for (const r of rows ?? []) {
    const status = r.status as InsightStatus;
    (byStatus[status] ?? byStatus.draft).push({
      id: r.id,
      category: r.category as InsightCategory,
      title: r.title,
      body: r.body,
      confidence: r.confidence,
      status,
      sourceType: r.source_type,
      sourceLabel: r.source_content_id ? (labelById.get(r.source_content_id) ?? null) : null,
      validUntil: r.valid_until,
      createdAt: r.created_at,
    });
  }

  return { byStatus, total: rows?.length ?? 0, draftCount: byStatus.draft.length };
}
