"use server";
// 단계 경계 버튼의 Server Action(§8.2: 버튼 → ServerAction → DB저장 → 이벤트 발행. 버튼→AI 직접호출 금지).
//   startTopicRun: 새 편(contents) + run(created) 생성 → "run/topic.requested" 발행(여기서 AI 돈 쓰기 시작).
//   selectTopic:   사람 게이트. proposed→selected 상태 전환만(AI 0회, §8.1).
// ★ 모든 액션은 requireOwner()로 owner 검증 후에만 service-role 사용(코드리뷰 P0: RLS 우회 노출 차단).

import { createAdminClient } from "../../lib/supabase/admin.js";
import { inngest } from "../../inngest/client.js";
import { selectProposal, confirmThumbnailSet, editSelectedTitle, editSelectedThumbnails, editSelectedTopic, editSelectedStructure, editSegmentText, type SelectInput } from "../../pipeline/gate.js";
import { getSelectedStagePayload } from "../../pipeline/context.js";
import type { TitlePayload, ThumbnailPayload, TopicPayload, StructurePayload } from "../../lib/dashboard/proposalTypes.js";
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import { transitionRun } from "../../pipeline/runState.js";
import { enterResearchReview, approveResearch, listEscalatedFacts, type ResearchApproval } from "../../pipeline/researchGate.js";
import { selectResearchScope, regenerateResearchScope, type ManualClaim, type ManualConcept } from "../../pipeline/researchScope.js";
import { reenterResearch } from "../../pipeline/researchReentry.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";
import { enterScriptReview, approveScript, requestScriptRework, reviewScript } from "../../pipeline/scriptGate.js";
import { abortRun, resumeFromSoftCap } from "../../pipeline/runGuards.js";
import { requireOwner } from "./auth.js";
import { auditLog } from "../../lib/observability/auditLog.js";
import { deleteProducedContent } from "./contentLifecycle.js";
import { loadOnboardingArc, saveOnboardingGold } from "../../pipeline/onboarding.js";
import { extractGold, type ArcAnswer } from "../../lib/onboarding/arc.js";
import type { ArcDifficulty } from "../../agents/onboarder/schema.js";
import type { Json } from "../../lib/supabase/database.types.js";
import type { SeedRunInput } from "../../lib/dashboard/seedTypes.js";

export async function startTopicRun(topic?: string, levelSplit?: boolean, targetPersona?: string): Promise<{ runId: string; contentId: string }> {
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
  //   targetPersona: "타겟 먼저" 모드 — 고정 타겟을 페이로드로 전달(levelSplit과 동일 조건부, 있을 때만).
  await inngest.send({ name: "run/topic.requested", data: { runId: run.id, ...(levelSplit ? { levelSplit: true } : {}), ...(targetPersona ? { targetPersona } : {}) } });
  await auditLog(supa, { actorId: ownerId, action: "run_started", targetType: "run", targetId: run.id, detail: { mode: topic ? "keyword" : "discovery", topic: topic ?? null, levelSplit: !!levelSplit, ...(targetPersona ? { targetPersona } : {}) } });
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
 * 편 하드 삭제 — produced content 삭제 → DB 캐스케이드로 run + 모든 자식(제안·선택·리서치·대본·
 *   lineage·비용·content_links) 제거. ★ imported(참조용 기존편)는 source 가드로 절대 삭제 안 됨.
 *   캐스케이드 시퀀스(detach+cleanup+delete, 두 CHECK 가드)는 contentLifecycle.deleteProducedContent 로
 *   추출돼 deleteLearningVideo 와 공유한다(복붙 금지 — 드리프트 방지).
 */
export async function deleteRun(runId: string): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const { data: run, error } = await supa.from("production_runs").select("content_id").eq("id", runId).maybeSingle();
  if (error) throw new Error(`런 조회 실패: ${error.message}`);
  if (!run) return; // 이미 없음 = 멱등
  const { deleted } = await deleteProducedContent(supa, run.content_id);
  if (deleted === 0) throw new Error("삭제 거부: produced 콘텐츠가 아닙니다(참조용 기존편은 삭제 불가).");
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

// 확정 후 손편집(§8.1 사람 게이트의 연장) — 상태 전이 없이 제목/썸네일 payload만 새 selection으로 기록.
//   selectTitles/confirmThumbnails 패턴 미러. editedBy=ownerId(감사필드 위조 차단). AI 0회(저장만).
export async function editTitle(runId: string, payload: TitlePayload): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  await editSelectedTitle(supa, runId, payload, ownerId);
  await auditLog(supa, { actorId: ownerId, action: "stage_edited", targetType: "run", targetId: runId, detail: { stage: "title_thumb" } });
}
// 확정된 주제의 타겟 페르소나만 손편집 — title·audience_level·audience_need 등 나머지 필드는 보존(★불변식).
//   현재 선택된 주제 payload(편집본 우선)를 읽어 target_persona만 교체·병합 → editSelectedTopic(상태 전이 없음).
//   edited_payload 우선 반환(context.ts) 덕에 편집한 페르소나가 구다리·짠펜에 자동 전파. editTitle 패턴 미러.
export async function editTopicPersona(runId: string, persona: string): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();

  const next = persona.trim();
  if (!next) throw new Error("타겟은 비울 수 없습니다.");

  const current = await getSelectedStagePayload(supa, runId, "topic");
  if (current == null) throw new Error("선택된 주제가 없습니다 — 주제 확정 후에만 타겟을 손질할 수 있습니다.");

  // ★ persona만 교체. title 등 나머지 필드는 스프레드로 그대로 보존(다운스트림 제목·구성 보호).
  const payload: TopicPayload = { ...(current as TopicPayload), target_persona: next };
  await editSelectedTopic(supa, runId, payload, ownerId);
  await auditLog(supa, { actorId: ownerId, action: "stage_edited", targetType: "run", targetId: runId, detail: { stage: "topic" } });
}

export async function editThumbnails(runId: string, payloads: ThumbnailPayload[]): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  await editSelectedThumbnails(supa, runId, payloads, ownerId);
  await auditLog(supa, { actorId: ownerId, action: "stage_edited", targetType: "run", targetId: runId, detail: { stage: "thumbnail" } });
}

// 쏙이 온보딩 아크 생성 요청(온디맨드·게이트 아님) — requestStructure 미러(requireOwner → 이벤트 발행).
//   버튼 트리거 → run/onboarding.requested → onboardingStage(prepare→step)가 아크를 stage_proposals에 저장. AI는 함수 안에서.
//   more: 난이도 타겟 추가 문항 요청(basic/mid/deep). 없으면 이벤트 data는 { runId }로 기존과 바이트 동일
//   (조건부 스프레드로 undefined 키 대입 금지 — exactOptionalPropertyTypes 준수).
export async function requestOnboarding(runId: string, more?: { difficulty: ArcDifficulty }): Promise<void> {
  await requireOwner();
  await inngest.send({ name: "run/onboarding.requested", data: { runId, ...(more ? { more } : {}) } });
}

// 쏙이 온보딩 응답 제출 — 저장된 아크 로드 → extractGold(순수) → 금맥 저장(온디맨드·게이트 아님).
//   requireOwner 게이트. 아크 없으면 throw(먼저 "이해하기" 실행 필요). audit best-effort.
export async function submitOnboarding(runId: string, answers: ArcAnswer[]): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();

  const arc = await loadOnboardingArc(supa, runId);
  if (!arc) throw new Error("온보딩 아크가 없습니다 — 먼저 이해하기를 실행하세요.");

  const gold = extractGold(arc, answers);
  await saveOnboardingGold(supa, runId, gold);
  await auditLog(supa, { actorId: ownerId, action: "onboarding_submitted", targetType: "run", targetId: runId, detail: { answers: answers.length } });
}
// 확정된 구성(approach+outline) 손편집 — 상태 전이 없이 새 selection으로 기록. editTitle 패턴 미러.
//   edited_payload 우선 반환(context.ts) 덕에 편집한 구성이 짠펜·다운스트림에 자동 전파. editedBy=ownerId(감사필드 위조 차단).
export async function editStructure(runId: string, payload: StructurePayload): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  await editSelectedStructure(supa, runId, payload, ownerId);
  await auditLog(supa, { actorId: ownerId, action: "stage_edited", targetType: "run", targetId: runId, detail: { stage: "structure" } });
}

// 짠펜 대본 세그먼트 프로즈 텍스트 직접 수정 — editStructure 미러(requireOwner·auditLog·상태 전이 0·AI 0).
//   ★ 구성편집은 edited_payload 한 방 전파지만 세그먼트는 script_segments 행 직접 update(정규화 저장·전파 경로 없음).
//   ★ 프로즈(kind=prose/null)만 — 블록은 내용이 payload에 있어 text 직접수정 무의미(editSegmentText가 거부). run 스코프 필수.
export async function editSegment(runId: string, segmentId: string, text: string): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  await editSegmentText(supa, runId, segmentId, text);
  await auditLog(supa, { actorId: ownerId, action: "segment_edited", targetType: "run", targetId: runId, detail: { segmentId } });
}

// 확정 후 AI 재생성 — Inngest로 새 proposal 생성(상태 전이 없음). 동기 callLLM 금지(185s 타임아웃 회피).
//   force는 보내지 않는다 — postConfirm은 force와 독립 경로(selectedState 진입·낙관잠금 없음).
//   reason은 비/공백이면 미포함(exactOptionalPropertyTypes — undefined 명시대입 금지).
export async function regenerateAfterConfirm(
  runId: string,
  component: "titles" | "thumbnail" | "structure",
  reason?: string,
): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const name = (
    { titles: "run/titles.requested", thumbnail: "run/thumbnails.requested", structure: "run/structure.requested" } as const
  )[component];
  await inngest.send({ name, data: { runId, postConfirm: true, ...(reason && reason.trim() ? { reason } : {}) } });
  await auditLog(supa, { actorId: ownerId, action: "stage_regenerated", targetType: "run", targetId: runId, detail: { component, postConfirm: true } });
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
// forceLlm=true면 로컬($0) 생성을 건너뛰고 LLM으로 새로 창작('LLM으로 새로 써줘'). 미지정/false면 hybrid 기본(로컬 가능하면 $0).
export async function regenerateStage(runId: string, stage: "topic" | "titles" | "structure" | "thumbnail", reason?: string, forceLlm?: boolean): Promise<void> {
  await requireOwner();
  const name = (
    { topic: "run/topic.requested", titles: "run/titles.requested", structure: "run/structure.requested", thumbnail: "run/thumbnails.requested" } as const
  )[stage];
  // reason·forceLlm은 비/false면 미포함(exactOptionalPropertyTypes — undefined 명시대입 금지). 없으면 기존 페이로드와 동일.
  await inngest.send({ name, data: { runId, force: true, ...(reason && reason.trim() ? { reason } : {}), ...(forceLlm ? { forceLlm: true } : {}) } });
}

// 썸네일 '전체 다시 생성'(3개 새로) 편의 액션 — force=true로 thumbnails.requested 재발행(run-in-place).
//   forceLlm=true면 LLM 새 창작, 미지정/false면 로컬($0) 가능 시 hybrid.
export async function regenerateThumbnails(runId: string, reason?: string, forceLlm?: boolean): Promise<void> {
  await regenerateStage(runId, "thumbnail", reason, forceLlm);
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
// 셜록 scope 선택(사람 게이트) — 사용자가 고른 검증 후보만 기록 + research_scoped→researching 전이 후
//   run/research.requested 재발행. researchStage가 researching 상태로 분기해 선택분만 fan-out 검증한다
//   (새 이벤트/함수 불필요 — 라우팅 이미 존재). select*Action 패턴 미러(requireOwner·auditLog).
export async function selectResearchScopeAction(
  runId: string,
  proposalId: string,
  selected: { claims: number[]; concepts: number[] },
  // 수동 추가(b)는 옵셔널 — proposal candidates를 변형하지 않고 selectResearchScope가 선택에 인라인 저장한다.
  manual?: { claims?: ManualClaim[]; concepts?: ManualConcept[] },
): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  await selectResearchScope(supa, runId, proposalId, selected, manual);
  await inngest.send({ name: "run/research.requested", data: { runId } });
  await auditLog(supa, {
    actorId: ownerId,
    action: "stage_selected",
    targetType: "run",
    targetId: runId,
    detail: {
      stage: "research",
      claims: selected.claims.length,
      concepts: selected.concepts.length,
      manualClaims: manual?.claims?.length ?? 0,
      manualConcepts: manual?.concepts?.length ?? 0,
    },
  });
}

// scope 재생성(a·§8.2 단계경계) — 셜록 후보 부족 시 '기존 외 추가'를 받는다. 새 proposal INSERT·전이 없음
//   (research_scoped 유지). select*Action 패턴 미러(requireOwner·비용가드·auditLog). LLM 1회라 withStageRuntime로 감싼다.
export async function regenerateResearchScopeAction(runId: string, reason?: string): Promise<{ proposalId?: string }> {
  const ownerId = await requireOwner();
  const guarded = await withStageRuntime(runId, (deps) =>
    regenerateResearchScope(deps.supa, runId, deps, reason),
  );
  const supa = createAdminClient();
  await auditLog(supa, {
    actorId: ownerId,
    action: "stage_regenerated",
    targetType: "run",
    targetId: runId,
    detail: { stage: "research", ...(reason && reason.trim() ? { reason } : {}), status: guarded.status },
  });
  return guarded.status === "ok" ? { proposalId: guarded.value.proposalId } : {};
}
// 리서치 단계 내부 되돌림(re-entry, migration 28) — 사용자가 결과/검수에서 이전으로 복귀해 다시 돈다.
//   세 액션 모두: requireOwner → reenterResearch(가드+전이) → (이벤트 필요 시) run/research.requested 재발행 → auditLog.
//   ★ 새 Inngest 이벤트/함수 금지 — 기존 라우팅(researchStage가 researching 상태 + fromStep으로 분기)을 재사용.
//   ★ rework_count 미증가(reenterResearch가 빈 patch로 전이 — 내부 재진입은 비용 캡으로만 제한, step0 정책).
//   auditLog는 기존 라벨(stage_regenerated) 재사용 + detail.kind로 종류 기록(새 AuditAction enum 추가 안 함).

// ① 다시 선택/보완: research_ready/research_review → research_scoped. 전이만(셀 실행·이벤트 없음).
export async function backToResearchScope(runId: string): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  await reenterResearch(supa, runId, "scope");
  await auditLog(supa, { actorId: ownerId, action: "stage_regenerated", targetType: "run", targetId: runId, detail: { stage: "research", reentry: true, kind: "scope" } });
}

// ② 다시 검증: research_ready/research_review → researching → run/research.requested(fromStep='full').
export async function reverifyResearch(runId: string): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const res = await reenterResearch(supa, runId, "reverify");
  if (res.event) await inngest.send({ name: "run/research.requested", data: { runId, fromStep: res.fromStep } });
  await auditLog(supa, { actorId: ownerId, action: "stage_regenerated", targetType: "run", targetId: runId, detail: { stage: "research", reentry: true, kind: "reverify" } });
}

// ④ 예시 다시 생성: research_ready/research_review → researching → run/research.requested(fromStep='examples').
export async function regenResearchExamples(runId: string): Promise<void> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const res = await reenterResearch(supa, runId, "examples");
  if (res.event) await inngest.send({ name: "run/research.requested", data: { runId, fromStep: res.fromStep } });
  await auditLog(supa, { actorId: ownerId, action: "stage_regenerated", targetType: "run", targetId: runId, detail: { stage: "research", reentry: true, kind: "examples" } });
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
  // rework는 script_review→scripting으로 되돌린다 — 짠펜 재실행 이벤트를 반드시 재발행한다.
  //   (이유: scriptStageFn은 run/script.requested로만 실행. 안 쏘면 scripting 상태로 멈춰 "작성 중" 안내만 뜬 채 stuck.)
  if (res.state === "scripting") await inngest.send({ name: "run/script.requested", data: { runId } });
  return res;
}

// 단일 최종 검수(autoflow §D) — 인라인 칩에서 사람이 보류 fact를 확정한다.
//   reject 비었으면 전체 승인(→approved), 반려 있으면 그 fact만 false·나머지 보류 true 후 전체 재작성(→scripting).
//   보류 fact의 human_approved=true는 오직 이 사람 액션에서만 확정(거버넌스 '사람 최종확인').
export async function reviewScriptAction(runId: string, decision: { rejectFactIds: string[] }): Promise<{ state: string }> {
  const ownerId = await requireOwner();
  const supa = createAdminClient();
  const rejected = decision.rejectFactIds ?? [];
  const res = await reviewScript(supa, runId, rejected);
  await auditLog(supa, {
    actorId: ownerId,
    action: "script_reviewed",
    targetType: "run",
    targetId: runId,
    detail: { approved: res.state, rejected: rejected.length },
  });
  // 반려가 있으면 reviewScript가 requestScriptRework로 scripting까지 되돌린다 — 짠펜 재실행 이벤트 재발행.
  //   (이유: 안 쏘면 반려해도 대본이 다시 안 써져 출력이 그대로. scriptStageFn은 이 이벤트로만 실행.)
  if (res.state === "scripting") await inngest.send({ name: "run/script.requested", data: { runId } });
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
