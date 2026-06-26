import { notFound } from "next/navigation";
import { getRunDetail, type StageView } from "@/lib/dashboard/runDetail";
import { getResearchView, type ResearchView } from "@/lib/dashboard/researchView";
import { getScriptView, getCostView, type SegmentView, type CostView } from "@/lib/dashboard/scriptView";
import { STAGE_DESCRIPTORS, type StageDescriptor } from "@/pipeline/stages";
import { STATE_LABEL, runTone } from "@/lib/dashboard/labels";
import { PROPOSAL_STAGES, STAGE_TITLE, type ProposalStage } from "@/lib/dashboard/proposalTypes";
import { RELATION_LABEL } from "@/lib/dashboard/seedTypes";
import { isDevBypass, requireOwnerPage } from "@/app/actions/auth";
import { ProposalSelector } from "@/components/ProposalSelector";
import { RegenerateButton } from "@/components/RegenerateButton";
import { CandidateBody } from "@/components/CandidateBody";
import { RequestStageButton } from "@/components/RequestStageButton";
import { ThumbnailStudio } from "@/components/ThumbnailStudio";
import { PostConfirmTitleEdit } from "@/components/PostConfirmTitleEdit";
import { PostConfirmThumbnailsEdit } from "@/components/PostConfirmThumbnailsEdit";
import { RefreshButton } from "@/components/RefreshButton";
import { EnterReviewButton } from "@/components/EnterReviewButton";
import { ResearchReview } from "@/components/ResearchReview";
import { FactCard } from "@/components/FactCard";
import { EnterScriptReviewButton } from "@/components/EnterScriptReviewButton";
import { ScriptReview } from "@/components/ScriptReview";
import { SegmentList } from "@/components/SegmentList";
import { CostPanel } from "@/components/CostPanel";
import { RunControls } from "@/components/RunControls";
import { StageStepper } from "@/components/StageStepper";
import { SourceLinks } from "@/components/SourceLinks";
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
function StageSection({ runId, sv, runState, topic }: { runId: string; sv: StageView; runState: RunState; topic: string }) {
  const stage = sv.stage as ProposalStage;
  const desc = STAGE_DESCRIPTORS[stage];

  // 썸네일 단계는 전용 UI(ThumbnailStudio·confirmThumbnails) — 제네릭 ProposalSelector/RegenerateButton 경로를 안 탄다.
  if (stage === "thumbnail") {
    return <ThumbnailStageSection runId={runId} sv={sv} runState={runState} desc={desc} topic={topic} />;
  }

  let body: React.ReactNode;
  if (sv.selection) {
    // 선택됨 — 확정안(수정본 우선) 요약.
    const chosen = sv.proposal?.candidates.find((c) => c.idx === sv.selection?.chosenIdx);
    const effective = sv.selection.editedPayload ?? chosen?.payload ?? {};
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
        {/* 제목(title_thumb)은 확정 후 손편집 가능 — editTitle(상태 전이 없음). topic/structure는 미지원. */}
        {stage === "title_thumb" && <PostConfirmTitleEdit runId={runId} payload={effective} />}
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
}: {
  runId: string;
  sv: StageView;
  runState: RunState;
  desc: StageDescriptor;
  topic: string;
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
          <PostConfirmThumbnailsEdit runId={runId} items={items} />
        )}
        {sv.selection.reason && <p className="mt-2 text-xs text-trus-white/50">이유: {sv.selection.reason}</p>}
      </div>
    );
  } else if (runState === desc.proposedState && sv.proposal) {
    body = <ThumbnailStudio runId={runId} proposalId={sv.proposal.proposalId} candidates={sv.proposal.candidates} topic={topic} />;
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
          <div className="mt-2 flex flex-col gap-1.5">
            {rv.assets.map((a) => (
              <div key={a.id} className="border border-trus-white/15 px-3 py-2 text-xs">
                <span className="text-trus-yellow font-bold">{a.kind === "number" ? "숫자" : "비유"}</span>
                <span className="text-trus-white/50"> · {a.concept}</span>
                <div className="mt-1 text-trus-white/70">{a.numericExample || a.analogy}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 리서치 단계(3.3) — 시작/대기/검수시작/트리아지/승인후.
function ResearchSection({ runId, runState, rv }: { runId: string; runState: RunState; rv: ResearchView | null }) {
  let body: React.ReactNode;
  if (runState === "structure_selected") {
    body = (
      <div className="flex flex-col gap-2">
        <RequestStageButton runId={runId} next="research" label="리서치 시작 (셜록)" />
        <p className="text-xs text-trus-white/40">누르면 셜록 셀(팩트검증·셈이·유이·반론)이 돌아갑니다 — 잠시 후 새로고침.</p>
      </div>
    );
  } else if (runState === "researching") {
    body = <WaitingNote text="셜록이 리서치 중… (inngest:dev 가동 필요)" />;
  } else if (runState === "research_ready") {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <EnterReviewButton runId={runId} />
          <p className="text-xs text-trus-white/40">고위험 fact만 검수 대상으로 띄웁니다(전건 검토 아님). 아래는 생성된 리서치 미리보기.</p>
        </div>
        {rv && <ResearchPanel rv={rv} />}
      </div>
    );
  } else if (runState === "research_review") {
    body = (
      <div className="flex flex-col gap-5">
        {rv == null ? (
          <WaitingNote text="검수 데이터를 불러오는 중… 새로고침하세요." />
        ) : rv.escalated.length > 0 ? (
          <ResearchReview runId={runId} escalated={rv.escalated} />
        ) : (
          <ApproveAllInline runId={runId} />
        )}
        {rv && <ResearchPanel rv={rv} />}
      </div>
    );
  } else if (RESEARCH_LOADED.includes(runState) && rv) {
    body = <ResearchPanel rv={rv} />;
  } else {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">리서치 (셜록)</h2>
      <div className="mt-3">{body}</div>
    </section>
  );
}

// 검수대상 0건이면 토글 없이 바로 승인(상태전환만).
function ApproveAllInline({ runId }: { runId: string }) {
  return (
    <div>
      <p className="text-xs text-trus-white/50">검수할 고위험 fact가 없습니다(전부 자동 통과). 승인하고 다음으로.</p>
      <div className="mt-2">
        <ResearchReview runId={runId} escalated={[]} />
      </div>
    </div>
  );
}

// 스크립트 단계(3.4) — 시작/대기/검수진입+세그먼트/검수/완료. segments는 lineage 포함.
function ScriptSection({
  runId,
  runState,
  segments,
}: {
  runId: string;
  runState: RunState;
  segments: SegmentView[] | null;
}) {
  let body: React.ReactNode;
  if (runState === "research_approved") {
    body = (
      <div className="flex flex-col gap-2">
        <RequestStageButton runId={runId} next="script" label="대본 작성 시작 (짠펜)" />
        <p className="text-xs text-trus-white/40">freshness 게이트·표절 가드를 거쳐 대본을 씁니다 — 잠시 후 새로고침.</p>
      </div>
    );
  } else if (runState === "scripting") {
    body = <WaitingNote text="짠펜이 대본 작성 중… (inngest:dev 가동 필요)" />;
  } else if (runState === "script_ready") {
    body = (
      <div className="flex flex-col gap-4">
        <EnterScriptReviewButton runId={runId} />
        {segments && <SegmentList segments={segments} />}
      </div>
    );
  } else if (runState === "script_review") {
    body = (
      <div className="flex flex-col gap-4">
        <ScriptReview runId={runId} />
        {segments && <SegmentList segments={segments} />}
      </div>
    );
  } else if ((runState === "approved" || runState === "published") && segments) {
    body = (
      <div className="flex flex-col gap-4">
        <p className="border border-trus-yellow px-4 py-2 text-sm font-bold text-trus-yellow">
          {STATE_LABEL[runState]} — 대본 완성 ({segments.length}단락).
        </p>
        <SegmentList segments={segments} />
      </div>
    );
  } else {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">스크립트 (짠펜) · lineage</h2>
      <div className="mt-3">{body}</div>
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
  const [rv, segments, cost] = await Promise.all([
    RESEARCH_LOADED.includes(run.state) ? getResearchView(run.id) : Promise.resolve(null),
    SCRIPT_LOADED.includes(run.state) ? getScriptView(run.id) : Promise.resolve(null),
    getCostView(run.id),
  ]);

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
        <StageSection key={stage} runId={run.id} sv={stages[stage]} runState={run.state} topic={content.title || content.topic || ""} />
      ))}

      <ResearchSection runId={run.id} runState={run.state} rv={rv} />
      <ScriptSection runId={run.id} runState={run.state} segments={segments} />
      <CostSection cost={cost} />
    </main>
  );
}
