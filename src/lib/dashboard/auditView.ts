import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import type { Json } from "../supabase/database.types.js";

// 감사 로그 읽기(migration 20) — 서버 전용. owner가 사람 게이트 결정 이력을 본다.
//   actor display_name은 코드 조인(임베드 추론 불가).

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  run_started: "런 시작",
  stage_selected: "단계 선택",
  research_approved: "리서치 승인",
  script_approved: "대본 승인",
  script_rework: "대본 수정요청",
  run_aborted: "런 중단",
  run_deleted: "런 삭제",
  insight_status: "인사이트 상태변경",
  insight_edited: "인사이트 수정",
};

export interface AuditView {
  id: string;
  action: string;
  actionLabel: string;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  detail: Json | null;
  createdAt: string;
}

export async function getAuditLog(limit = 100): Promise<AuditView[]> {
  const supa = createAdminClient();
  const { data: rows, error } = await supa
    .from("audit_log")
    .select("id, action, actor_id, target_type, target_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`감사 로그 조회 실패: ${error.message}`);

  const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter((v): v is string => !!v))];
  const nameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supa.from("profiles").select("id, display_name").in("id", actorIds);
    for (const p of profiles ?? []) nameById.set(p.id, p.display_name ?? p.id.slice(0, 8));
  }

  return (rows ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    actionLabel: AUDIT_ACTION_LABEL[r.action] ?? r.action,
    actorName: r.actor_id ? (nameById.get(r.actor_id) ?? null) : null,
    targetType: r.target_type,
    targetId: r.target_id,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}
