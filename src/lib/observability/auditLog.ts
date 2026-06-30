import "server-only";
import type { Supa } from "../../pipeline/runState.js";
import type { Json } from "../supabase/database.types.js";

// 감사 로그(migration 20) — 사람 게이트 결정·변경을 영속 기록. ★ best-effort: 실패해도 액션을 안 깨뜨린다
//   (테이블 미적용·일시 오류여도 본 작업은 진행). 행위자는 requireOwner가 반환한 ownerId.

export type AuditAction =
  | "run_started"
  | "stage_selected"
  | "stage_edited"
  | "stage_regenerated"
  | "research_approved"
  | "script_approved"
  | "script_rework"
  | "script_reviewed"
  | "run_aborted"
  | "run_deleted"
  | "insight_status"
  | "insight_edited"
  | "copy_ab_saved"
  | "copy_relearn_requested"
  | "channel_title_relearn_requested"
  | "copy_style_activated"
  | "learning_video_created"
  | "content_title_updated"
  | "content_deleted"
  | "content_upload_date_updated"
  | "correction_saved"
  | "correction_analyzed";

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType?: "run" | "insight" | "content" | "thumbnail_correction";
  targetId?: string;
  detail?: Json;
}

/** supa = service-role(admin, RLS 우회 쓰기). 던지지 않음 — 감사 실패가 사용자 작업을 막지 않게. */
export async function auditLog(supa: Supa, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await supa.from("audit_log").insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      detail: entry.detail ?? null,
    });
    if (error) console.error("[audit] 기록 실패(무시):", error.message);
  } catch (e) {
    console.error("[audit] 기록 예외(무시):", e instanceof Error ? e.message : e);
  }
}
