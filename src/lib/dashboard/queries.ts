import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import type { RunState } from "../../domain/enums.js";

// 대시보드 읽기 헬퍼(Phase 3) — 서버 컴포넌트 전용.
//   ⚠️ 개발 단계에선 admin(service-role)으로 읽는다(owner 바이패스와 짝). 진짜 인증 와이어링 후엔
//      RLS 적용 server 클라이언트로 전환해야 한다(Phase 5 하드닝). 읽기 전용이라 위험은 낮음.

export interface RunListItem {
  id: string;
  state: RunState;
  costUsd: number;
  reworkCount: number;
  abortReason: string | null;
  createdAt: string;
  contentId: string;
  topic: string | null;
  title: string | null;
}

/** 제작 런 목록 — 최신순. contents(topic·title)는 별도 조회 후 코드 조인
 *  (database.types.ts의 Relationships가 비어 있어 PostgREST 임베드가 타입 추론 안 됨). */
export async function listRuns(limit = 50): Promise<RunListItem[]> {
  const supa = createAdminClient();
  const { data: runs, error } = await supa
    .from("production_runs")
    .select("id, state, cost_usd, rework_count, abort_reason, created_at, content_id, is_standalone")
    .eq("is_standalone", false) // 메인 목록은 파이프라인 run 만(단독 run 숨김). 상세 조회엔 이 필터 없음.
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`런 목록 조회 실패: ${error.message}`);
  if (!runs || runs.length === 0) return [];

  const contentIds = [...new Set(runs.map((r) => r.content_id))];
  const { data: contents, error: ce } = await supa
    .from("contents")
    .select("id, topic, title")
    .in("id", contentIds);
  if (ce) throw new Error(`contents 조회 실패: ${ce.message}`);
  const byId = new Map((contents ?? []).map((c) => [c.id, c]));

  return runs.map((r) => {
    const c = byId.get(r.content_id);
    return {
      id: r.id,
      state: r.state as RunState,
      costUsd: r.cost_usd,
      reworkCount: r.rework_count,
      abortReason: r.abort_reason,
      createdAt: r.created_at,
      contentId: r.content_id,
      topic: c?.topic ?? null,
      title: c?.title ?? null,
    };
  });
}

export interface ReferenceEdition {
  id: string;
  label: string; // 드롭다운 표시용(제목 또는 주제)
  uploadDate: string | null;
}

/** 씨앗 모드 참조 선택지 — 보유 기존편(contents source='imported', 스크립트/자막/댓글 보유). 최신 업로드순. */
export async function listReferenceEditions(limit = 50): Promise<ReferenceEdition[]> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("contents")
    .select("id, title, topic, upload_date")
    .eq("source", "imported")
    .order("upload_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`참조편 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    label: c.title || c.topic || "(제목 미정)",
    uploadDate: c.upload_date,
  }));
}
