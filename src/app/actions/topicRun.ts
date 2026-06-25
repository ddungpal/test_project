"use server";
// 단계 경계 버튼의 Server Action(§8.2: 버튼 → ServerAction → DB저장 → 이벤트 발행. 버튼→AI 직접호출 금지).
//   startTopicRun: 새 편(contents) + run(created) 생성 → "run/topic.requested" 발행(여기서 AI 돈 쓰기 시작).
//   selectTopic:   사람 게이트. proposed→selected 상태 전환만(AI 0회, §8.1).
// ★ 모든 액션은 requireOwner()로 owner 검증 후에만 service-role 사용(코드리뷰 P0: RLS 우회 노출 차단).

import { createAdminClient } from "../../lib/supabase/admin.js";
import { inngest } from "../../inngest/client.js";
import { selectProposal, confirmThumbnailSet, type SelectInput } from "../../pipeline/gate.js";
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import { transitionRun, type Supa } from "../../pipeline/runState.js";
import { enterResearchReview, approveResearch, listEscalatedFacts, type ResearchApproval } from "../../pipeline/researchGate.js";
import { enterScriptReview, approveScript, requestScriptRework } from "../../pipeline/scriptGate.js";
import { abortRun, resumeFromSoftCap } from "../../pipeline/runGuards.js";
import { requireOwner } from "./auth.js";
import { auditLog } from "../../lib/observability/auditLog.js";
import type { Json } from "../../lib/supabase/database.types.js";
import type { SeedRunInput } from "../../lib/dashboard/seedTypes.js";

export async function startTopicRun(topic?: string, levelSplit?: boolean): Promise<{ runId: string; contentId: string }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();

  const { data: content, error: ce } = await supa
    .from("contents")
    .insert({ source: "produced", status: "in_production", ...(topic ? { topic } : {}) })
    .select("id")
    .single();
  if (ce) throw new Error(`contents insert 실패: ${ce.message}`);

  const { data: run, error: re } = await supa
    .from("production_runs")
    .insert({ content_id: content.id }) // state는 트리거가 'created' 강제
    .select("id")
    .single();
  if (re) throw new Error(`production_runs insert 실패: ${re.message}`);

  // 결정적 로직(DB저장) 끝 → 이벤트로 durable 파이프라인에 넘김. AI는 함수 안에서 1회.
  //   levelSplit: 촉이 수준 분해 모드(이벤트 페이로드로 전달 — durable 보존, migration 불필요).
  await inngest.send({ name: "run/topic.requested", data: { runId: run.id, ...(levelSplit ? { levelSplit: true } : {}) } });
  await auditLog(supa, { actorId: ownerId, action: "run_started", targetType: "run", targetId: run.id, detail: { mode: topic ? "keyword" : "discovery", topic: topic ?? null, levelSplit: !!levelSplit } });
  return { runId: run.id, contentId: content.id };
}

/**
 * 씨앗 모드 — 사용자가 준 주제를 '확정'으로 시작(촉이 LLM 건너뜀, 전부 결정적·$0).
 *   주제 입력 + 참조 기존편(reference|series_followup) + 연결 의도 → content_links 저장.
 *   주제 단계는 후보1=씨앗으로 자동 제안·선택 처리 → created→topic_proposed→topic_selected.
 *   바로 제목(훅이) 단계에서 시작. 참조/의도는 나중 단계가 쓸 컨텍스트로 보존.
 */
export async function startSeedRun(input: SeedRunInput): Promise<{ runId: string; contentId: string }> {
  const ownerId = await requireOwner();
  const topic = input.topic.trim();
  if (!topic) throw new Error("씨앗 모드는 주제가 필요합니다.");
  const supa = createAdminClient();

  // 1) 새 편(produced) + 사용자 지정 주제.
  const { data: content, error: ce } = await supa
    .from("contents")
    .insert({ source: "produced", status: "in_production", topic })
    .select("id")
    .single();
  if (ce) throw new Error(`contents insert 실패: ${ce.message}`);

  // 2) 참조 링크(기존편). 중복/자기참조는 DB 제약이 막음.
  const refs = input.references ?? [];
  if (refs.length > 0) {
    const rows = refs.map((r) => ({
      from_content_id: content.id,
      to_content_id: r.contentId,
      relation: r.relation,
      ...(input.intent?.trim() ? { intent: input.intent.trim() } : {}),
    }));
    const { error: le } = await supa.from("content_links").insert(rows);
    if (le) throw new Error(`content_links insert 실패: ${le.message}`);
  }

  // 3) run 생성(트리거가 'created' 강제).
  const { data: run, error: re } = await supa.from("production_runs").insert({ content_id: content.id }).select("id").single();
  if (re) throw new Error(`production_runs insert 실패: ${re.message}`);

  // 4) 주제 단계 = 씨앗 1후보로 결정적 제안(촉이 미호출). evidence: 씨앗 + 참조.
  const evidence_ids = ["seed:topic", ...refs.map((r) => `ref:${r.contentId}`)];
  const reason = "사용자 지정 주제" + (input.intent?.trim() ? ` — 연결 의도: ${input.intent.trim()}` : "");
  const candidates = [{ idx: 0, payload: { title: topic }, reason, evidence_ids }];
  const { data: proposal, error: pe } = await supa
    .from("stage_proposals")
    .insert({ run_id: run.id, stage: "topic", candidates: candidates as unknown as Json })
    .select("id")
    .single();
  if (pe) throw new Error(`stage_proposals insert 실패: ${pe.message}`);

  // 5) created→topic_proposed(코드 전이) → selectProposal이 선택+topic_proposed→topic_selected.
  await transitionRun(supa, run.id, "created", "topic_proposed");
  await selectProposal(supa, STAGE_DESCRIPTORS.topic, {
    runId: run.id,
    proposalId: proposal.id,
    chosenIdx: 0,
    selectionReason: reason,
    selectedBy: ownerId,
  });

  return { runId: run.id, contentId: content.id };
}

/**
 * provenance(profile_training_sources) 선 정리 — contents 삭제 전에 호출.
 *   contents 삭제 → ab_variants·performance_metrics 가 캐스케이드 삭제 → pts 의 ab_variant_id/metric_id 가
 *   `ON DELETE SET NULL`(migration 06). 그 출처가 pts 행의 '유일' 출처였으면 num_nonnulls=0 →
 *   `pts_has_source`(출처≥1) CHECK 위반으로 contents 삭제 트랜잭션 전체가 롤백된다(/copy-learn 재학습이 ab_variant_id를 채운 뒤 발생).
 *   → 유일 출처가 되는 pts 행을 먼저 삭제한다(다중 출처 행은 DB SET NULL 에 맡김 — CHECK 안 깨짐).
 *   cleanupRetrospectives 의 'detach 먼저' 패턴과 동일 클래스. 멱등(대상 없으면 no-op).
 */
async function detachOrphanTrainingSources(supa: Supa, contentId: string): Promise<void> {
  const [{ data: vars }, { data: metrics }] = await Promise.all([
    supa.from("ab_variants").select("id").eq("content_id", contentId),
    supa.from("performance_metrics").select("id").eq("content_id", contentId),
  ]);
  const varIds = (vars ?? []).map((v) => v.id);
  const metricIds = (metrics ?? []).map((m) => m.id);
  if (varIds.length === 0 && metricIds.length === 0) return;

  const filters: string[] = [];
  if (varIds.length) filters.push(`ab_variant_id.in.(${varIds.join(",")})`);
  if (metricIds.length) filters.push(`metric_id.in.(${metricIds.join(",")})`);
  const { data: pts, error } = await supa
    .from("profile_training_sources")
    .select("id, edition_id, component_id, ab_variant_id, metric_id")
    .or(filters.join(","));
  if (error) throw new Error(`provenance 조회 실패: ${error.message}`);

  // 이 콘텐츠의 출처가 사라지면 출처 0개가 되는(=유일 출처) 행만 삭제.
  const orphanIds = (pts ?? [])
    .filter((r) => [r.edition_id, r.component_id, r.ab_variant_id, r.metric_id].filter((x) => x !== null && x !== undefined).length === 1)
    .map((r) => r.id);
  if (orphanIds.length === 0) return;
  const { error: de } = await supa.from("profile_training_sources").delete().in("id", orphanIds);
  if (de) throw new Error(`provenance 정리 실패: ${de.message}`);
}

/**
 * 편 하드 삭제 — produced content 삭제 → DB 캐스케이드로 run + 모든 자식(제안·선택·리서치·대본·
 *   lineage·비용·content_links) 제거. ★ imported(참조용 기존편)는 source 가드로 절대 삭제 안 됨.
 *   ★ 삭제 전 detachOrphanTrainingSources 로 provenance 고아 행을 정리(pts_has_source CHECK 충돌 방지).
 */
export async function deleteRun(runId: string): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const { data: run, error } = await supa.from("production_runs").select("content_id").eq("id", runId).maybeSingle();
  if (error) throw new Error(`런 조회 실패: ${error.message}`);
  if (!run) return; // 이미 없음 = 멱등
  await detachOrphanTrainingSources(supa, run.content_id); // pts_has_source CHECK 충돌 선제 방어.
  const { data: del, error: de } = await supa
    .from("contents")
    .delete()
    .eq("id", run.content_id)
    .eq("source", "produced") // 안전장치: produced만 삭제(기존편/참조 보호)
    .select("id");
  if (de) throw new Error(`삭제 실패: ${de.message}`);
  if (!del || del.length === 0) throw new Error("삭제 거부: produced 콘텐츠가 아닙니다(참조용 기존편은 삭제 불가).");
  await auditLog(supa, { actorId: ownerId, action: "run_deleted", targetType: "run", targetId: runId, detail: { contentId: run.content_id } });
}

export async function selectTopic(sel: SelectInput): Promise<{ state: string }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  // selectedBy는 클라 입력을 무시하고 인증된 owner로 강제(감사필드 위조 차단).
  const res = await selectProposal(supa, STAGE_DESCRIPTORS.topic, { ...sel, selectedBy: ownerId });
  await auditLog(supa, { actorId: ownerId, action: "stage_selected", targetType: "run", targetId: sel.runId, detail: { stage: "topic", chosenIdx: sel.chosenIdx } });
  return { state: res.state };
}

// 이후 단계 버튼(§8.2): 단계 경계마다 request(이벤트 발행) → select(게이트). 같은 패턴.
export async function requestTitles(runId: string): Promise<void> {
  await requireOwner();
  await inngest.send({ name: "run/titles.requested", data: { runId } });
}
export async function selectTitles(sel: SelectInput): Promise<{ state: string }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const res = await selectProposal(supa, STAGE_DESCRIPTORS.title_thumb, { ...sel, selectedBy: ownerId });
  await auditLog(supa, { actorId: ownerId, action: "stage_selected", targetType: "run", targetId: sel.runId, detail: { stage: "title_thumb", chosenIdx: sel.chosenIdx } });
  return { state: res.state };
}

// 썸네일 단계(§8.2): 제목 확정 후 썸네일메이커 트리거.
export async function requestThumbnails(runId: string): Promise<void> {
  await requireOwner();
  await inngest.send({ name: "run/thumbnails.requested", data: { runId } });
}

// 썸네일 '3개 세트 확정'(사람 게이트) — 단일 선택이 아니라 A/B/C 3개를 그대로 확정. AI 0회(상태전환+기록).
export async function confirmThumbnails(runId: string): Promise<{ state: string }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const res = await confirmThumbnailSet(supa, runId);
  await auditLog(supa, { actorId: ownerId, action: "stage_selected", targetType: "run", targetId: runId, detail: { stage: "thumbnail" } });
  return { state: res.state };
}

export async function requestStructure(runId: string): Promise<void> {
  await requireOwner();
  await inngest.send({ name: "run/structure.requested", data: { runId } });
}
export async function selectStructure(sel: SelectInput): Promise<{ state: string }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const res = await selectProposal(supa, STAGE_DESCRIPTORS.structure, { ...sel, selectedBy: ownerId });
  await auditLog(supa, { actorId: ownerId, action: "stage_selected", targetType: "run", targetId: sel.runId, detail: { stage: "structure", chosenIdx: sel.chosenIdx } });
  return { state: res.state };
}

// '다시 생성'(§8.2 단계경계 버튼) — 같은 단계 이벤트를 force=true로 재발행.
//   멱등 메모이즈를 우회해 proposedState에서 새 제안을 INSERT(상태 전이 없음). 최신-우선 읽기라
//   새 제안이 자동으로 화면에 뜬다. research/script는 제안 단계가 아니라 범위 밖.
export async function regenerateStage(runId: string, stage: "topic" | "titles" | "structure" | "thumbnail", reason?: string): Promise<void> {
  await requireOwner();
  const name = (
    { topic: "run/topic.requested", titles: "run/titles.requested", structure: "run/structure.requested", thumbnail: "run/thumbnails.requested" } as const
  )[stage];
  // reason은 비/공백이면 미포함(exactOptionalPropertyTypes — undefined 명시대입 금지). 없으면 기존 페이로드와 동일.
  await inngest.send({ name, data: { runId, force: true, ...(reason && reason.trim() ? { reason } : {}) } });
}

// 썸네일 '전체 다시 생성'(3개 새로) 편의 액션 — force=true로 thumbnails.requested 재발행(run-in-place).
export async function regenerateThumbnails(runId: string, reason?: string): Promise<void> {
  await regenerateStage(runId, "thumbnail", reason);
}

// 썸네일 '개별 슬롯 다시 생성'(3칸 중 slotIdx만 교체·나머지 보존) — 무전이 in-place(상태 유지).
export async function regenerateThumbnailSlot(runId: string, slotIdx: number, reason?: string): Promise<void> {
  await requireOwner();
  // reason은 비/공백이면 미포함(exactOptionalPropertyTypes — undefined 명시대입 금지). 없으면 기존 페이로드와 동일.
  await inngest.send({ name: "run/thumbnail-slot.requested", data: { runId, slotIdx, ...(reason && reason.trim() ? { reason } : {}) } });
}

// 셜록 리서치(§8.2 단계경계 버튼) — request(이벤트) → 검수 진입 → 트리아지 승인(§11).
export async function requestResearch(runId: string): Promise<void> {
  await requireOwner();
  await inngest.send({ name: "run/research.requested", data: { runId } });
}
export async function openResearchReview(runId: string) {
  await requireOwner();
  const supa = createAdminClient();
  await enterResearchReview(supa, runId);
  return listEscalatedFacts(supa, runId); // 사람이 검수할 고위험 fact만
}
export async function approveResearchAction(runId: string, approval?: ResearchApproval): Promise<{ state: string; approved: number }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const res = await approveResearch(supa, runId, approval);
  await auditLog(supa, { actorId: ownerId, action: "research_approved", targetType: "run", targetId: runId, detail: { approved: res.approved } });
  return res;
}

// 짠펜 스크립트(§8.2) — request(이벤트) → 검수 진입 → 승인 | 수정요청(rework).
export async function requestScript(runId: string): Promise<void> {
  await requireOwner();
  await inngest.send({ name: "run/script.requested", data: { runId } });
}
export async function openScriptReview(runId: string): Promise<void> {
  await requireOwner();
  await enterScriptReview(createAdminClient(), runId);
}
export async function approveScriptAction(runId: string): Promise<{ state: string }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const res = await approveScript(supa, runId);
  await auditLog(supa, { actorId: ownerId, action: "script_approved", targetType: "run", targetId: runId });
  return res;
}
export async function requestScriptReworkAction(runId: string): Promise<{ state: string }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const res = await requestScriptRework(supa, runId);
  await auditLog(supa, { actorId: ownerId, action: "script_rework", targetType: "run", targetId: runId });
  return res;
}

// 반장 마감: kill switch + SOFT 캡 일시정지 재개.
export async function abortRunAction(runId: string, reason = "사용자 중단(kill switch)"): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  await abortRun(supa, runId, reason);
  await auditLog(supa, { actorId: ownerId, action: "run_aborted", targetType: "run", targetId: runId, detail: { reason } });
}
export async function resumeRunAction(runId: string): Promise<void> {
  await requireOwner();
  const supa = createAdminClient();
  // 재개 단계는 서버가 판정(클라 입력 미신뢰 — 잘못된 단계 이벤트 발행 차단).
  const { stage } = await resumeFromSoftCap(supa, runId);
  // 사람 SOFT 승인 → 이벤트 재발행(softAck=true로 캡 일시정지 없이 진행).
  await inngest.send({ name: stage === "research" ? "run/research.requested" : "run/script.requested", data: { runId, softAck: true } });
}
