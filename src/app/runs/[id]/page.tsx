import { notFound } from "next/navigation";
import { getRunDetail, type StageView } from "@/lib/dashboard/runDetail";
import { getResearchView, type ResearchView } from "@/lib/dashboard/researchView";
import { getScriptView, getCostView, type SegmentView, type CostView } from "@/lib/dashboard/scriptView";
import { getOutlierThumbnailRefs } from "@/lib/dashboard/outlierThumbnailsView";
import type { OutlierThumbnailRef } from "@/agents/hook_maker/externalRefs";
import { STAGE_DESCRIPTORS, type StageDescriptor } from "@/pipeline/stages";
import { STATE_LABEL, runTone } from "@/lib/dashboard/labels";
import { PROPOSAL_STAGES, STAGE_TITLE, type ProposalStage, type StructurePayload } from "@/lib/dashboard/proposalTypes";
import { RELATION_LABEL } from "@/lib/dashboard/seedTypes";
import { isDevBypass, requireOwnerPage } from "@/app/actions/auth";
import { ProposalSelector } from "@/components/ProposalSelector";
import { RegenerateButton } from "@/components/RegenerateButton";
import { CandidateBody } from "@/components/CandidateBody";
import { RequestStageButton } from "@/components/RequestStageButton";
import { ThumbnailStudio } from "@/components/ThumbnailStudio";
import { PostConfirmTitleEdit } from "@/components/PostConfirmTitleEdit";
import { PostConfirmStructureEdit } from "@/components/PostConfirmStructureEdit";
import { PostConfirmTopicPersonaEdit } from "@/components/PostConfirmTopicPersonaEdit";
import { PostConfirmThumbnailsEdit } from "@/components/PostConfirmThumbnailsEdit";
import { RefreshButton } from "@/components/RefreshButton";
import { FactCard } from "@/components/FactCard";
import { ScriptReview } from "@/components/ScriptReview";
import { SegmentList } from "@/components/SegmentList";
import { ResearchAssetList } from "@/components/ResearchAssetList";
import { UnusedResearch } from "@/components/UnusedResearch";
import { unusedResearch } from "@/lib/research/evidence";
import { CostPanel } from "@/components/CostPanel";
import { RunControls } from "@/components/RunControls";
import { StageStepper } from "@/components/StageStepper";
import { parseSubProgress } from "@/lib/dashboard/stageProgress";
import { ResearchPhaseStepper } from "@/components/ResearchPhaseStepper";
import { SourceLinks } from "@/components/SourceLinks";
import { RequestOnboardingButton } from "@/components/RequestOnboardingButton";
import { OnboardingQuiz } from "@/components/OnboardingQuiz";
import { loadOnboardingArc, loadOnboardingGold, loadOnboardingReferences, loadOnboardingFailure } from "@/pipeline/onboarding";
import { MustWatchReferences } from "@/components/MustWatchReferences";
import type { OnboardingArc, OnboardingGold } from "@/agents/onboarder/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOnboardingVisible } from "@/domain/enums";
import type { RunState } from "@/domain/enums";

export const dynamic = "force-dynamic";

// 리서치 fact가 존재하는 상태(검수 뷰를 읽어올 상태들). research_ready부터 fact 존재(미리보기 가능).
const RESEARCH_LOADED: RunState[] = [
  "research_ready",
  "research_review",
  "research_approved",
  "scripting",
  "script_ready",
  "script_review",
  "approved",
  "published",
];

// 대본 세그먼트가 존재하는 상태(script_ready 이후).
const SCRIPT_LOADED: RunState[] = ["script_ready", "script_review", "approved", "published"];

const TONE_CLASS = {
  done: "border-trus-yellow text-trus-yellow",
  paused: "border-trus-yellow/60 text-trus-yellow/80",
  aborted: "border-trus-white/25 text-trus-white/40",
  active: "border-trus-white/30 text-trus-white/80",
} as const;

// ProposalStage → regenerateStage 인자. 없는 stage는 재생성 미지원 → 버튼 생략.
const REGEN_STAGE: Partial<Record<ProposalStage, "topic" | "titles" | "structure">> = {
  topic: "topic",
  title_thumb: "titles",
  structure: "structure",
};

// 단계 박스 — 선택됨(요약) | 활성(선택기) | 시작 버튼 | 대기.
//   topic 은 썸네일 교정 패널(ThumbnailStudio)이 교정쌍 컨텍스트로 쓴다 — 빈 문자열 폴백(라벨 아님).
function StageSection({ runId, sv, runState, topic, outlierRefs }: { runId: string; sv: StageView; runState: RunState; topic: string; outlierRefs: OutlierThumbnailRef[] }) {
  const stage = sv.stage as ProposalStage;
  const desc = STAGE_DESCRIPTORS[stage];

  // 썸네일 단계는 전용 UI(ThumbnailStudio·confirmThumbnails) — 제네릭 ProposalSelector/RegenerateButton 경로를 안 탄다.
  if (stage === "thumbnail") {
    return <ThumbnailStageSection runId={runId} sv={sv} runState={runState} desc={desc} topic={topic} outlierRefs={outlierRefs} />;
  }

  let body: React.ReactNode;
  if (sv.selection) {
    // 선택됨 — 확정안 요약. payload는 runDetail이 selection 자신의 proposal로 해석한 확정값(재생성 후에도 안정).
    //   chosenSources는 출처 배지용 — 최신 proposal에서 chosen 후보를 찾으면 그 evidence로 필터(못 찾으면 [] 방어).
    const chosen = sv.proposal?.candidates.find((c) => c.idx === sv.selection?.chosenIdx);
    const effective = sv.selection.payload;
    const chosenSources = chosen && sv.proposal ? sv.proposal.sources.filter((s) => chosen.evidence_ids.includes(s.id)) : [];
    body = (
      <div className="border border-trus-white/15 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-trus-yellow">
            {sv.selection.chosenIdx != null ? `${String.fromCharCode(65 + sv.selection.chosenIdx)}안 선택` : "선택"}
            {sv.selection.editedPayload != null && " · 수정됨"}
          </span>
        </div>
        <div className="mt-2">
          <CandidateBody stage={stage} payload={effective} />
        </div>
        {/* 제목(title_thumb)·구성(structure)은 확정 후 손편집 가능 — editTitle/editStructure(상태 전이 없음). topic은 페르소나만. */}
        {/* proposalId·regenCandidate는 'AI로 다시 생성' 폴링 완료 감지·draft 채움용(최신 proposal 첫 후보). */}
        {stage === "title_thumb" && (
          <PostConfirmTitleEdit
            runId={runId}
            payload={effective}
            proposalId={sv.proposal?.proposalId}
            regenCandidate={sv.proposal?.candidates?.[0]?.payload}
          />
        )}
        {/* 구성(structure) 확정 후 손편집 + AI 재생성 — title_thumb의 PostConfirmTitleEdit와 대칭. runState는 §F staleness 경고용. */}
        {stage === "structure" && (
          <PostConfirmStructureEdit
            runId={runId}
            payload={effective as StructurePayload}
            runState={runState}
            proposalId={sv.proposal?.proposalId}
            regenCandidate={sv.proposal?.candidates?.[0]?.payload}
          />
        )}
        {/* 주제(topic) 확정 후 타겟 페르소나 손편집 — title_thumb의 PostConfirmTitleEdit와 대칭(editTopicPersona·상태 전이 없음). */}
        {stage === "topic" && <PostConfirmTopicPersonaEdit runId={runId} payload={effective} />}
        {sv.selection.reason && <p className="mt-2 text-xs text-trus-white/50">이유: {sv.selection.reason}</p>}
        <SourceLinks sources={chosenSources} />
      </div>
    );
  } else if (runState === desc.proposedState && sv.proposal) {
    // ProposalStage → regenerateStage 인자 매핑. 없는 stage면 '다시 생성' 버튼 생략(방어).
    const regenStage = REGEN_STAGE[stage];
    body = (
      <div className="flex flex-col gap-3">
        <ProposalSelector
          runId={runId}
          stage={stage}
          proposalId={sv.proposal.proposalId}
          candidates={sv.proposal.candidates}
          sources={sv.proposal.sources}
        />
        {regenStage && <RegenerateButton runId={runId} stage={regenStage} proposalId={sv.proposal.proposalId} />}
      </div>
    );
  } else if (stage === "topic" && runState === "created") {
    body = <WaitingNote text="촉이가 주제 생성 중… (inngest:dev 가동 필요)" />;
  } else if (runState === desc.fromState) {
    // title_thumb는 제목 전용(썸네일은 thumbnail 전용 분기가 처리). structure만 남는 제네릭 경로.
    const next = stage === "title_thumb" ? "titles" : "structure";
    const label = stage === "title_thumb" ? "제목 만들기" : "구성 만들기";
    body = (
      <div className="flex flex-col gap-2">
        <RequestStageButton runId={runId} next={next} label={label} />
        <p className="text-xs text-trus-white/40">누르면 생성 시작 — 잠시 후 새로고침하세요.</p>
      </div>
    );
  } else {
    body = <p className="text-sm text-trus-white/30">이전 단계 완료 후 진행됩니다.</p>;
  }

  return (
    <section className="mt-8">
      <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">{STAGE_TITLE[stage]}</h2>
      <div className="mt-3">{body}</div>
    </section>
  );
}

// 썸네일 단계 전용 — 생성(titles_selected) → 스튜디오(thumbnails_proposed) → 확정 요약(thumbnails_selected).
//   단일 선택이 아니라 A/B/C 3개 세트를 다루므로 ProposalSelector/RegenerateButton 대신 ThumbnailStudio를 쓴다.
function ThumbnailStageSection({
  runId,
  sv,
  runState,
  desc,
  topic,
  outlierRefs,
}: {
  runId: string;
  sv: StageView;
  runState: RunState;
  desc: StageDescriptor;
  topic: string;
  outlierRefs: OutlierThumbnailRef[];
}) {
  let body: React.ReactNode;
  if (sv.selection) {
    // 확정됨 — 확정한 3개를 읽기전용 요약(editedPayload 배열 우선, 없으면 proposal candidates 폴백).
    const edited = Array.isArray(sv.selection.editedPayload) ? (sv.selection.editedPayload as unknown[]) : null;
    const items: { idx: number; payload: unknown }[] =
      edited != null
        ? edited.map((payload, idx) => ({ idx, payload }))
        : (sv.proposal?.candidates ?? []).map((c) => ({ idx: c.idx, payload: c.payload }));
    body = (
      <div className="border border-trus-white/15 p-4">
        <span className="text-xs font-bold text-trus-yellow">3개 확정 — A/B/C</span>
        {items.length === 0 ? (
          <p className="mt-2 text-xs text-trus-white/30">확정된 썸네일을 불러올 수 없습니다.</p>
        ) : (
          // 확정 후 카드별 손편집 — editThumbnails(상태 전이 없음). 한 카드만 고쳐도 3개 세트로 보낸다.
          // proposalId·regenItems는 'AI로 다시 생성'(step1) 폴링 완료 감지·3카드 draft 채움용(최신 proposal 3후보).
          <PostConfirmThumbnailsEdit
            runId={runId}
            items={items}
            proposalId={sv.proposal?.proposalId}
            regenItems={(sv.proposal?.candidates ?? []).map((c) => ({ idx: c.idx, payload: c.payload }))}
          />
        )}
        {sv.selection.reason && <p className="mt-2 text-xs text-trus-white/50">이유: {sv.selection.reason}</p>}
      </div>
    );
  } else if (runState === desc.proposedState && sv.proposal) {
    body = <ThumbnailStudio runId={runId} candidates={sv.proposal.candidates} topic={topic} outlierRefs={outlierRefs} />;
  } else if (runState === desc.fromState) {
    body = (
      <div className="flex flex-col gap-2">
        <RequestStageButton runId={runId} next="thumbnail" label="썸네일 만들기" />
        <p className="text-xs text-trus-white/40">확정한 제목으로 썸네일 3개(A/B/C)를 만듭니다 — 잠시 후 새로고침하세요.</p>
      </div>
    );
  } else {
    body = <p className="text-sm text-trus-white/30">이전 단계 완료 후 진행됩니다.</p>;
  }

  return (
    <section className="mt-8">
      <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">{STAGE_TITLE.thumbnail}</h2>
      <div className="mt-3">{body}</div>
    </section>
  );
}

function WaitingNote({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-between border border-dashed border-trus-white/20 px-4 py-3">
      <span className="text-sm text-trus-white/50">{text}</span>
      <RefreshButton />
    </div>
  );
}

// 리서치 fact/asset 읽기 패널(검수중·승인후 공통).
function ResearchPanel({ rv }: { rv: ResearchView }) {
  return (
    <div className="flex flex-col gap-4">
      {rv.facts.length > 0 && (
        <div>
          <p className="text-xs text-trus-white/40">
            전체 fact {rv.facts.length} · 검수대상 {rv.escalated.length} · 자동통과 {rv.autoPassedCount}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {rv.facts.map((f) => (
              <FactCard key={f.id} fact={f} />
            ))}
          </div>
        </div>
      )}
      {rv.assets.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-trus-white/60">쉬운 설명 자산 ({rv.assets.length})</h3>
          <ResearchAssetList assets={rv.assets} />
        </div>
      )}
    </div>
  );
}

// 리서치 단계(3.3) — 시작/대기(자동진행)/승인후. 리서치~스크립트는 셜록이 무중단 자동 진행 —
//   research_scoped/ready/review는 전이 중 잠깐만 스치므로 수동 게이트 대신 진행표시만.
function ResearchSection({ runId, runState, rv, progressNote }: { runId: string; runState: RunState; rv: ResearchView | null; progressNote: string | null }) {
  let body: React.ReactNode;
  if (runState === "structure_selected") {
    body = (
      <div className="flex flex-col gap-2">
        <RequestStageButton runId={runId} next="research" label="리서치 시작 (셜록)" />
        <p className="text-xs text-trus-white/40">누르면 셜록 셀(팩트검증·셈이·유이·반론)이 돌아갑니다 — 잠시 후 새로고침.</p>
      </div>
    );
  } else if (runState === "research_scoped") {
    // 셜록이 검증 범위를 자동 선택하고 바로 검증으로 넘어감 — 사람 선택 없음.
    body = <WaitingNote text="셜록이 리서치 준비 중… 새로고침하세요." />;
  } else if (runState === "researching") {
    // 진행 마커(researchCell가 단계마다 progress_note에 "i/n·라벨" 기록)를 본문에 노출 — 어느 작업 중인지.
    //   마커 없으면(셀 미가동·inngest down) 기존 안내로 폴백.
    const sub = parseSubProgress(progressNote);
    body = (
      <WaitingNote
        text={sub ? `셜록 — ${sub.label} (${sub.index}/${sub.total})` : "셜록이 리서치 중… (inngest:dev 가동 필요)"}
      />
    );
  } else if (runState === "research_ready") {
    // 검수 진입도 자동 — research_review로 무중단 통과. 진행표시만.
    body = <WaitingNote text="리서치 마무리 중… 새로고침하세요." />;
  } else if (runState === "research_review") {
    // 고위험 사실 검수는 스크립트 완성 후 최종 검수로 운반 — 여기선 멈추지 않고 자동 통과.
    body = <WaitingNote text="검수 준비 중… 새로고침하세요." />;
  } else if (RESEARCH_LOADED.includes(runState) && !SCRIPT_LOADED.includes(runState) && rv) {
    // script 이전 리서치 상태에서만 평면 패널 노출. script 상태(script_ready~published)에서는
    //   상단 덤프를 걷고, 세그먼트별 토글 + 하단 UnusedResearch(ScriptSection)로 강등 → null.
    body = <ResearchPanel rv={rv} />;
  } else {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">리서치 (셜록)</h2>
      <div className="mt-3">
        <ResearchPhaseStepper state={runState} />
        {body}
      </div>
    </section>
  );
}

// 스크립트 단계(3.4) — 시작/대기/검수진입+세그먼트/검수/완료. segments는 lineage 포함.
function ScriptSection({
  runId,
  runState,
  segments,
  rv,
  progressNote,
}: {
  runId: string;
  runState: RunState;
  segments: SegmentView[] | null;
  rv: ResearchView | null;
  progressNote: string | null;
}) {
  let body: React.ReactNode;
  if (runState === "research_approved") {
    // 검증 완료 시 대본 작성이 자동 발행됨 — 사람 클릭 없음. 진행표시만.
    body = <WaitingNote text="짠펜이 대본 작성 중… 새로고침하세요." />;
  } else if (runState === "scripting") {
    {
      // 짠펜도 진행 마커("1/2·대본 작성"·"2/2·표절 검사")를 본문에 노출. 없으면 기존 안내로 폴백.
      const sub = parseSubProgress(progressNote);
      body = (
        <WaitingNote
          text={sub ? `짠펜 — ${sub.label} (${sub.index}/${sub.total})` : "짠펜이 대본 작성 중… (inngest:dev 가동 필요)"}
        />
      );
    }
  } else if (runState === "script_ready") {
    // 검수 진입도 자동 — script_review로 무중단 통과. 진행표시만.
    body = <WaitingNote text="검수 준비 중… 새로고침하세요." />;
  } else if (runState === "script_review") {
    // ScriptReview가 본문(SegmentBody)을 직접 그린다 → 별도 SegmentList 중복 제거.
    body = (
      <div className="flex flex-col gap-4">
        <ScriptReview runId={runId} segments={segments ?? []} runState={runState} />
      </div>
    );
  } else if ((runState === "approved" || runState === "published") && segments) {
    body = (
      <div className="flex flex-col gap-4">
        <p className="border border-trus-yellow px-4 py-2 text-sm font-bold text-trus-yellow">
          {STATE_LABEL[runState]} — 대본 완성 ({segments.length}단락).
        </p>
        <SegmentList runId={runId} segments={segments} editable={runState === "approved"} runState={runState} />
      </div>
    );
  } else {
    return null;
  }

  // 하단 "안 쓰인 리서치" — 어느 세그먼트에도 안 쓰인 fact·자산을 접힌 토글로 강등(0건이면 null).
  let unused: React.ReactNode = null;
  if (rv && segments) {
    const { factIds, assetIds } = unusedResearch(rv, segments);
    const uFacts = rv.facts.filter((f) => factIds.has(f.id));
    const uAssets = rv.assets.filter((a) => assetIds.has(a.id));
    unused = <UnusedResearch facts={uFacts} assets={uAssets} />;
  }

  return (
    <section className="mt-8">
      <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">스크립트 (짠펜) · lineage</h2>
      <div className="mt-3">{body}</div>
      {unused}
    </section>
  );
}

// 쏙이 온보딩 진입 — 노출 창 전 구간(thumbnails_selected~published)에서 렌더. 온디맨드·건너뛰기 가능(구다리 버튼과 병존).
//   아크 없으면 "먼저 이해하기" 버튼(requestOnboarding 발행), 있으면 OnboardingQuiz 인터랙티브 재생.
//   mode: live=구성 직전(금맥 주입) / review=구성 이후 복습(자동 반영 안 됨). 카피만 분기, 로직·버튼은 동일.
function OnboardingSection({ runId, arc, gold, mode, retryableFailure }: { runId: string; arc: OnboardingArc | null; gold: OnboardingGold | null; mode: "live" | "review"; retryableFailure: string | null }) {
  const review = mode === "review";
  return (
    <section className="mt-8 border border-trus-yellow/50 p-4">
      <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">
        {review ? "다시 훑어보기 (쏙이)" : "먼저 이해하기 (쏙이)"}
      </h2>
      <p className="mt-2 text-xs text-trus-white/60">
        {review
          ? "구성은 이미 만들어졌어요. 복습으로 다시 풀어봐도 좋아요. (새로 풀어도 이미 만든 구성엔 자동 반영되진 않아요 — 반영하려면 구성을 다시 생성하세요.)"
          : "구성 전에 이 주제를 한 번 훑어보세요. 찍고 틀려도 좋아요 — 오히려 더 잘 남습니다. (건너뛰고 바로 구성해도 됩니다.)"}
      </p>
      <div className="mt-3">
        {arc ? (
          <OnboardingQuiz runId={runId} arc={arc} gold={gold} mode={mode} />
        ) : (
          <div className="flex flex-col gap-2">
            <RequestOnboardingButton runId={runId} retryableFailure={retryableFailure} />
            <p className="text-xs text-trus-white/40">누르면 쏙이가 궁금증 아크를 만듭니다 — 잠시 후 새로고침하세요.</p>
          </div>
        )}
      </div>
    </section>
  );
}

// 편당 비용 — 엔트리가 있으면 항상 표시.
function CostSection({ cost }: { cost: CostView }) {
  if (cost.entries.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">비용</h2>
      <div className="mt-3 border border-trus-white/15 p-4">
        <CostPanel cost={cost} />
      </div>
    </section>
  );
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOwnerPage(); // 읽기 상세도 owner 게이트 — 미인증은 /login. 바이패스 시 통과.
  const [detail, devBypass] = await Promise.all([getRunDetail(id), isDevBypass()]);
  if (!detail) notFound();
  const { run, content, stages, references } = detail;
  const heading = content.title || content.topic || "(주제 미정)";

  // 상태에 따라 필요한 추가 조회(병렬). 비용은 항상.
  //   outlierRefs는 썸네일 제안 단계(thumbnails_proposed)에서만 — 게이트 off면 read가 즉시 []. 그 외 상태는 호출 안 함.
  //   onboardingArc는 노출 창 전 구간(thumbnails_selected~published)에서 로드 — review 상태에서도 기존 아크를 복습 재생.
  //   그 외 상태는 호출 안 함(getRunDetail과 같은 admin 클라 경로 재사용).
  //   mustWatchRefs는 스크립트가 보이는 상태(SCRIPT_LOADED)에서만 로드 — 아크 payload의 경량 references(없으면 []).
  const [rv, segments, cost, outlierRefs, onboardingArc, onboardingGold, mustWatchRefs, onboardingFailure] = await Promise.all([
    RESEARCH_LOADED.includes(run.state) ? getResearchView(run.id) : Promise.resolve(null),
    SCRIPT_LOADED.includes(run.state) ? getScriptView(run.id) : Promise.resolve(null),
    getCostView(run.id),
    run.state === "thumbnails_proposed" ? getOutlierThumbnailRefs(run.id) : Promise.resolve([]),
    isOnboardingVisible(run.state)
      ? loadOnboardingArc(createAdminClient(), run.id)
      : Promise.resolve(null),
    isOnboardingVisible(run.state)
      ? loadOnboardingGold(createAdminClient(), run.id)
      : Promise.resolve(null),
    SCRIPT_LOADED.includes(run.state)
      ? loadOnboardingReferences(createAdminClient(), run.id)
      : Promise.resolve([]),
    isOnboardingVisible(run.state)
      ? loadOnboardingFailure(createAdminClient(), run.id)
      : Promise.resolve(null),
  ]);

  // 쏙이 모드 — thumbnails_selected = live(금맥 주입 시점), 그 이후 = review(복습·자동 반영 안 됨).
  const onbMode = run.state === "thumbnails_selected" ? "live" : "review";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-xs text-trus-white/50 hover:text-trus-yellow">
        ← 런 목록
      </a>

      {devBypass && (
        <div className="mt-4 border border-trus-yellow/40 px-3 py-2 text-xs text-trus-yellow/80">
          ⚠ 개발용 owner 바이패스 활성.
        </div>
      )}

      <div className="mt-4 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-black leading-tight">{heading}</h1>
        <span className={`shrink-0 border px-2 py-1 text-xs font-bold ${TONE_CLASS[runTone(run.state)]}`}>
          {STATE_LABEL[run.state]}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-trus-white/45">
        <span className="font-mono">{run.id.slice(0, 8)}</span>
        <span>기준일 {run.asOfDate}</span>
        <span>${run.costUsd.toFixed(2)}</span>
        {run.model && <span>{run.model}</span>}
        {run.reworkCount > 0 && <span>재작업 {run.reworkCount}</span>}
      </div>

      <div className="mt-5">
        <StageStepper state={run.state} progressNote={run.progressNote} />
      </div>

      {references.length > 0 && (
        <div className="mt-4 border border-trus-white/15 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-trus-white/40">참조 · 시리즈 연결</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {references.map((r, i) => (
              <li key={i} className="text-sm text-trus-white/80">
                <span className="border border-trus-yellow/50 px-1.5 py-0.5 text-[10px] font-bold text-trus-yellow">{RELATION_LABEL[r.relation]}</span>
                <span className="ml-2">{r.label}</span>
                {r.intent && <span className="ml-2 text-xs text-trus-white/45">— {r.intent}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <RunControls runId={run.id} runState={run.state} />
      </div>

      {run.state === "aborted" && (
        <div className="mt-6 border border-trus-white/25 px-4 py-3 text-sm text-trus-white/50">
          ■ 중단됨{run.abortReason ? ` — ${run.abortReason}` : ""}
        </div>
      )}

      {PROPOSAL_STAGES.map((stage) => (
        <StageSection key={stage} runId={run.id} sv={stages[stage]} runState={run.state} topic={content.title || content.topic || ""} outlierRefs={outlierRefs} />
      ))}

      {/* 쏙이 온보딩 — 노출 창 전 구간(thumbnails_selected~published)에서 노출. live=구성 직전 / review=구성 이후 복습. 게이트 아님. */}
      {isOnboardingVisible(run.state) && <OnboardingSection runId={run.id} arc={onboardingArc} gold={onboardingGold} mode={onbMode} retryableFailure={onboardingFailure} />}

      <ResearchSection runId={run.id} runState={run.state} rv={rv} progressNote={run.progressNote} />
      {/* 필수 시청 유튜브 영상 — 쏙이 아크 근거 3개(스크립트 위). refs 없으면 컴포넌트가 null 반환(패널 숨김). */}
      <MustWatchReferences refs={mustWatchRefs} />
      <ScriptSection runId={run.id} runState={run.state} segments={segments} rv={rv} progressNote={run.progressNote} />
      <CostSection cost={cost} />
    </main>
  );
}
