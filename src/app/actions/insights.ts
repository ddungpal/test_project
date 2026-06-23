"use server";
// 인사이트 승인 워크플로우 액션(Phase 4 슬라이스 3) — 김짠부의 '선택'(+수정).
//   회고가 만든 draft를 검토→승인(또는 폐기). 상태 전이는 서버가 가드(canTransitionInsightStatus).
//   ★ 모든 액션 requireOwner() 후에만 service-role 사용(RLS 우회 노출 차단·감사필드 위조 차단).

import { createAdminClient } from "../../lib/supabase/admin.js";
import { requireOwner } from "./auth.js";
import { auditLog } from "../../lib/observability/auditLog.js";
import { canTransitionInsightStatus, type InsightStatus } from "../../domain/insightStatus.js";
import type { TablesUpdate } from "../../lib/supabase/database.types.js";

/** 상태 전이(검토/승인/폐기/되살리기). 허용되지 않은 전이는 거부. */
export async function setInsightStatus(insightId: string, to: InsightStatus): Promise<{ status: InsightStatus }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const { data: cur, error: ce } = await supa.from("insights").select("status").eq("id", insightId).maybeSingle();
  if (ce) throw new Error(`인사이트 조회 실패: ${ce.message}`);
  if (!cur) throw new Error("인사이트를 찾지 못했습니다.");
  const from = cur.status as InsightStatus;
  if (!canTransitionInsightStatus(from, to)) {
    throw new Error(`허용되지 않은 전이: ${from} → ${to}`);
  }
  // 낙관적 잠금 — 조회 후 다른 곳에서 상태가 바뀌었으면(.eq status=from 불일치) 갱신 0행 → 충돌로 거부.
  const { data: updated, error: ue } = await supa
    .from("insights")
    .update({ status: to })
    .eq("id", insightId)
    .eq("status", from)
    .select("id");
  if (ue) throw new Error(`상태 변경 실패: ${ue.message}`);
  if (!updated || updated.length === 0) throw new Error("상태가 사이에 변경되었습니다. 새로고침 후 다시 시도하세요.");
  await auditLog(supa, { actorId: ownerId, action: "insight_status", targetType: "insight", targetId: insightId, detail: { from, to } });
  return { status: to };
}

export interface InsightEdit {
  title?: string;
  body?: string;
  confidence?: number | null;
  valid_until?: string | null; // 'YYYY-MM-DD' 또는 null
}

/** 승인 전 학습 노트 수정(선택+수정 패턴). 빈 제목·본문은 거부. */
export async function updateInsight(insightId: string, edit: InsightEdit): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const patch: TablesUpdate<"insights"> = {};
  if (edit.title !== undefined) {
    const t = edit.title.trim();
    if (!t) throw new Error("제목은 비울 수 없습니다.");
    patch.title = t;
  }
  if (edit.body !== undefined) {
    const b = edit.body.trim();
    if (!b) throw new Error("본문은 비울 수 없습니다.");
    patch.body = b;
  }
  if (edit.confidence !== undefined) {
    patch.confidence = edit.confidence === null ? null : Math.max(0, Math.min(1, edit.confidence));
  }
  if (edit.valid_until !== undefined) {
    const v = edit.valid_until;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("유효기간은 YYYY-MM-DD 형식이어야 합니다.");
    if (v && Number.isNaN(Date.parse(v))) throw new Error("유효하지 않은 날짜입니다.");
    patch.valid_until = v || null;
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supa.from("insights").update(patch).eq("id", insightId);
  if (error) throw new Error(`인사이트 수정 실패: ${error.message}`);
  await auditLog(supa, { actorId: ownerId, action: "insight_edited", targetType: "insight", targetId: insightId, detail: { fields: Object.keys(patch) } });
}
