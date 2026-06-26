"use server";
// 카피 학습 입력 저장(copy-learning-admin step0) — 김짠부가 입력한 영상별 썸네일·제목 A/B + CTR(24h)를
//   DB에 멱등 저장하는 백엔드 데이터 계층. UI는 step2, 학습은 step1. 이 step은 저장만.
//   ★ ingest.ts/ingest-ab.ts 미러: judgeComponent 재계산(rank·winner)·같은 onConflict·pickContentVerdict→contents.ab_* 파생.
//   ★ requireOwner() 후에만 service-role 사용(RLS 우회 노출·감사필드 위조 차단).
//   ★ 순수 매핑(mapCopyAbToRows·mapCtr24hToMetricRow)은 copyLearnMap.ts(server-only 무관)에 — 테스트가 DB 없이 import.

import { createAdminClient } from "../../lib/supabase/admin.js";
import { styleRelearnSweep } from "../../performance/styleRelearn.js";
import { requireOwner } from "./auth.js";
import { auditLog } from "../../lib/observability/auditLog.js";
import { loadConfig } from "../../llm/config.js";
import { pickContentVerdict, type AbThresholds } from "../../performance/abVerdict.js";
import { mapCopyAbToRows, mapCtr24hToMetricRow, componentTypeFor, buildLearningVideoStub, type CopyAbInput, type CopyComponent, type NewLearningVideoInput } from "./copyLearnMap.js";
import type { Json } from "../../lib/supabase/database.types.js";

/** youtubeVideoId/contentId → contents.id 해석(content_id 우선). 못 찾으면 null. */
async function resolveContentId(
  supa: ReturnType<typeof createAdminClient>,
  input: CopyAbInput,
): Promise<string | null> {
  if (input.contentId) {
    const { data } = await supa.from("contents").select("id").eq("id", input.contentId).maybeSingle();
    return data?.id ?? null;
  }
  if (input.youtubeVideoId) {
    const { data } = await supa.from("contents").select("id").eq("youtube_video_id", input.youtubeVideoId).maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

/**
 * 영상별 카피 A/B + CTR(24h) 멱등 저장. requireOwner 후 service-role.
 *   - ab_variants(썸네일·제목) 멱등 upsert(onConflict content_id,component_type,variant).
 *   - performance_metrics d1 overall 멱등 upsert(onConflict content_id,metric_window,ab_variant).
 *   - contents.ab_* 캐시 갱신(썸네일 기준 pickContentVerdict).
 *   - 같은 입력 2회 → 행 수 불변.
 */
export async function saveCopyAbResults(input: CopyAbInput): Promise<{ savedThumbnail: number; savedTitle: number; decided: boolean }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const thresholds: AbThresholds = loadConfig().ab;

  const contentId = await resolveContentId(supa, input);
  if (!contentId) throw new Error("영상을 찾지 못했습니다(contentId/youtubeVideoId 확인).");

  const { abRows, thumbnailVerdict } = mapCopyAbToRows(input, contentId, thresholds);
  const savedThumbnail = abRows.filter((r) => r.component_type === "thumbnail").length;
  const savedTitle = abRows.filter((r) => r.component_type === "title").length;

  if (abRows.length) {
    const { error } = await supa.from("ab_variants").upsert(abRows, { onConflict: "content_id,component_type,variant" });
    if (error) throw new Error(`ab_variants 저장 실패: ${error.message}`);
  }

  // performance_metrics d1 overall 멱등 upsert.
  const metricRow = mapCtr24hToMetricRow(input, contentId, new Date().toISOString());
  const { error: me } = await supa.from("performance_metrics").upsert([metricRow], { onConflict: "content_id,metric_window,ab_variant" });
  if (me) throw new Error(`performance_metrics 저장 실패: ${me.message}`);

  // contents.ab_* = ab_variants 파생 캐시(썸네일 기준). 제목 단일은 판정 없음 → 영향 없음.
  const pick = thumbnailVerdict ? pickContentVerdict([thumbnailVerdict]) : null;
  const patch = pick
    ? { ab_margin: pick.margin, ab_decisiveness: pick.decisiveness, ab_result_status: "decided" as const }
    : { ab_margin: null, ab_decisiveness: null, ab_result_status: "pending" as const };
  const { error: ce } = await supa.from("contents").update(patch).eq("id", contentId);
  if (ce) throw new Error(`contents ab_* 갱신 실패: ${ce.message}`);

  const detail: Json = {
    thumb: savedThumbnail,
    titleMode: input.title.hasAbTest ? "ab" : "single",
    ctr24h: input.ctr24h,
  };
  await auditLog(supa, { actorId: ownerId, action: "copy_ab_saved", targetType: "content", targetId: contentId, detail });

  return { savedThumbnail, savedTitle, decided: pick !== null };
}

/**
 * 새 학습 영상 추가 — 학습 전용 contents stub 멱등 생성. requireOwner 후 service-role.
 *   - title 빈값(trim 후)이면 throw(제목 필수 — 라벨·표시용).
 *   - 멱등: youtubeVideoId 가 주어졌고 이미 그 youtube_video_id 의 contents 가 있으면 생성 안 하고 기존 id(created:false).
 *     없으면 buildLearningVideoStub 로 insert(created:true). youtube_video_id 없으면 항상 신규 생성.
 *   - 생성/저장 책임 분리: 여기서는 stub 만 만든다. A/B·CTR 저장은 saveCopyAbResults 가 별도로 한다.
 *   - auditLog 는 best-effort(던지지 않음).
 */
export async function createLearningVideo(input: NewLearningVideoInput): Promise<{ contentId: string; created: boolean }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();

  const title = input.title.trim();
  if (!title) throw new Error("제목을 입력하세요");

  const videoId = input.youtubeVideoId?.trim();
  // 멱등: youtube_video_id 로 기존 contents 조회(있으면 재사용).
  if (videoId) {
    const { data } = await supa.from("contents").select("id").eq("youtube_video_id", videoId).maybeSingle();
    if (data?.id) return { contentId: data.id, created: false };
  }

  const stub = buildLearningVideoStub(input);
  const { data, error } = await supa.from("contents").insert(stub).select("id").single();
  if (error) throw new Error(`학습 영상 생성 실패: ${error.message}`);
  const contentId = data.id;

  await auditLog(supa, {
    actorId: ownerId,
    action: "learning_video_created",
    targetType: "content",
    targetId: contentId,
    detail: { title, hasVideoId: Boolean(videoId) },
  });

  return { contentId, created: true };
}

/**
 * 학습 영상 이름(contents.title) 수정 — 라벨/표시용. requireOwner 후 service-role.
 *   - title 빈값(trim 후)이면 throw(비빈 값만 허용 — null 로 비우는 기능은 범위 외).
 *   - contents.id=contentId 의 title 만 update. update 후 반환 행 0 이면 존재하지 않는 id → throw.
 *   - ab_variants/performance_metrics 등 다른 테이블은 건드리지 않는다(이름만 변경).
 *   - auditLog 는 best-effort(던지지 않음).
 */
export async function updateContentTitle(contentId: string, title: string): Promise<{ updated: boolean }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();

  const trimmed = title.trim();
  if (!trimmed) throw new Error("제목을 입력하세요");

  const { data, error } = await supa
    .from("contents")
    .update({ title: trimmed })
    .eq("id", contentId)
    .select("id");
  if (error) throw new Error(`영상 이름 수정 실패: ${error.message}`);
  if (!data?.length) throw new Error("영상을 찾지 못했습니다");

  await auditLog(supa, {
    actorId: ownerId,
    action: "content_title_updated",
    targetType: "content",
    targetId: contentId,
    detail: { title: trimmed },
  });

  return { updated: true };
}

/**
 * A/B 스타일 재학습(사람 게이트). requireOwner 후 styleRelearnSweep 를 **동기로 await** 한다.
 *   ★ 이벤트 발행(fire-and-forget)이 아니라 직접 실행 — 그래야 프런트의 pending 이 학습 끝까지 유지돼
 *     '진행중' 표시가 정확하고, 반환값으로 component별 draft 생성/스킵을 알려 자동 새로고침·메시지가 정확해진다.
 *   sweep 은 표본 증가분으로 thumbnail_copy·title draft 까지만 만든다(activate 는 별도 사람 게이트).
 *   적격 아니거나 표본 0 이면 LLM 호출 0·draft 0(과금 0·멱등) → created=false 로 "변경 없음" 안내.
 *   // ponytail: 동기 실행 — 개발(claude-p $0·수십초)엔 적합. 운영에서 LLM 이 길어 서버액션 타임아웃이 문제되면
 *   //   다시 Inngest 비동기 + 상태 폴링으로 옮긴다(durability 필요 시).
 */
export async function requestCopyRelearn(): Promise<{
  thumbnail: { created: boolean };
  title: { created: boolean };
  anyCreated: boolean;
}> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const res = await styleRelearnSweep(supa);
  const thumbnailCreated = res.thumbnail.created !== null;
  const titleCreated = res.title.created !== null;
  // auditLog 는 best-effort(던지지 않음).
  await auditLog(supa, {
    actorId: ownerId,
    action: "copy_relearn_requested",
    detail: { thumbnailCreated, titleCreated },
  });
  return {
    thumbnail: { created: thumbnailCreated },
    title: { created: titleCreated },
    anyCreated: thumbnailCreated || titleCreated,
  };
}

/**
 * draft → active 승격(component별 사람 게이트). activate-style.ts 로직 포팅.
 *   component "thumbnail" → component_type='thumbnail_copy', "title" → 'title'.
 *   version 미지정 시 해당 component 의 최신 version(보통 새 draft) 사용.
 *   ★ 같은 component_type 의 active 는 1개만 유지 — 기존 active 를 먼저 retired 로 내린다(partial unique 위반 방지).
 *   ★ component_type 스코프를 모든 쿼리에 건다(다른 component active 와 충돌 방지).
 */
export async function activateCopyStyle(component: CopyComponent, version?: number): Promise<{ activated: number }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const componentType = componentTypeFor(component);

  const { data: rows, error } = await supa
    .from("style_profiles")
    .select("id, version, status")
    .eq("component_type", componentType)
    .order("version", { ascending: false });
  if (error) throw new Error(`style_profiles 조회 실패: ${error.message}`);
  if (!rows?.length) throw new Error(`style_profiles(${componentType}) 없음 — 먼저 재학습으로 draft 를 만드세요.`);

  const target = version != null ? rows.find((r) => r.version === version) : rows[0];
  if (!target) throw new Error(`style_profiles(${componentType}) v${version} 없음`);

  if (target.status === "active") {
    // 이미 active — 멱등. 감사만 남기고 활성화 0.
    await auditLog(supa, { actorId: ownerId, action: "copy_style_activated", detail: { componentType, version: target.version, alreadyActive: true } });
    return { activated: 0 };
  }

  // 기존 active → retired (active 1개 유지). component_type 스코프.
  const { error: re } = await supa
    .from("style_profiles")
    .update({ status: "retired" })
    .eq("component_type", componentType)
    .eq("status", "active");
  if (re) throw new Error(`기존 active 내리기 실패: ${re.message}`);

  const { error: ue } = await supa.from("style_profiles").update({ status: "active" }).eq("id", target.id);
  if (ue) throw new Error(`승격 실패: ${ue.message}`);

  await auditLog(supa, { actorId: ownerId, action: "copy_style_activated", detail: { componentType, version: target.version } });
  return { activated: 1 };
}
