import "server-only";
import { createAdminClient } from "../supabase/admin.js";
import { getSelectedStagePayload } from "../../pipeline/context.js";
import { gatherOutlierThumbnails, type OutlierThumbnailRef } from "../../agents/hook_maker/externalRefs.js";

// 썸네일 아웃라이어 레퍼런스 읽기(step2) — 서버 컴포넌트 전용. admin(읽기전용).
//   선택된 주제로 '구독자 대비 조회수가 터진' 외부 영상 썸네일을 시각 레퍼런스로 모은다.
//   게이트(titleReferencesEnabled) off거나 주제 없으면 []. best-effort(gatherOutlierThumbnails가 throw 안 함).

// 가져올 아웃라이어 썸네일 개수(소량 — 시각 레퍼런스 천장 관리). 천장 문제되면 prepare 1회 수집으로 업그레이드.
const OUTLIER_THUMBNAIL_N = 6;

// ponytail: gather-on-read, persist if render cost matters
//   이 read는 렌더 시 YouTube API를 친다 — dev는 fixture 리플레이로 $0, 운영은 실호출.
//   천장이 문제되면 썸네일 prepare 시 1회 수집해 영속화하는 경로로 업그레이드한다(지금은 옵트인·best-effort·소량 N으로 충분).
export async function getOutlierThumbnailRefs(runId: string): Promise<OutlierThumbnailRef[]> {
  const supa = createAdminClient();
  // 선택된 주제(title) — topic payload는 { title }. 없으면 수집 스킵.
  const topic = ((await getSelectedStagePayload(supa, runId, "topic")) as { title?: string } | null)?.title;
  if (!topic) return [];
  // 게이트 off면 gatherOutlierThumbnails가 네트워크 0으로 즉시 [] 반환.
  return gatherOutlierThumbnails(topic, OUTLIER_THUMBNAIL_N);
}
