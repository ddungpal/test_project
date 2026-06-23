"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectTopic, selectTitles, selectStructure } from "@/app/actions/topicRun";
import type { SelectInput } from "@/pipeline/gate";
import {
  type CandidateView,
  type ProposalStage,
  type TopicPayload,
  type TitlePayload,
  type StructurePayload,
  type StructureSection,
  type ProposalSource,
} from "@/lib/dashboard/proposalTypes";
import { CandidateBody } from "./CandidateBody";
import { SourceLinks } from "./SourceLinks";

// 제안→선택(§8.1 사람 게이트) — 후보 라디오 선택 + (선택)수정 + 한 줄 이유 → select 액션(상태전환만, AI 0회).
//   editedPayload는 원안과 다를 때만 전송(§8.4 학습: proposed↔selected 델타 + selection_reason).

const SELECT: Record<ProposalStage, (sel: SelectInput) => Promise<{ state: string }>> = {
  topic: selectTopic,
  title_thumb: selectTitles,
  structure: selectStructure,
};

const inputCls =
  "w-full border border-trus-white/30 bg-transparent px-2 py-1 text-sm text-trus-white focus:border-trus-yellow focus:outline-none";

export function ProposalSelector({
  runId,
  stage,
  proposalId,
  candidates,
  sources = [],
}: {
  runId: string;
  stage: ProposalStage;
  proposalId: string;
  candidates: CandidateView[];
  sources?: ProposalSource[];
}) {
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const chosen = candidates.find((c) => c.idx === chosenIdx) ?? null;

  function pick(idx: number) {
    setChosenIdx(idx);
    setEditing(false);
    setDraft(null);
    setError(null);
  }
  function startEdit() {
    if (!chosen) return;
    setDraft(structuredClone(chosen.payload));
    setEditing(true);
  }

  function submit() {
    if (chosen == null) return;
    setError(null);
    const edited = editing && draft != null && JSON.stringify(draft) !== JSON.stringify(chosen.payload);
    startTransition(async () => {
      try {
        await SELECT[stage]({
          runId,
          proposalId,
          chosenIdx: chosen.idx,
          ...(edited ? { editedPayload: draft } : {}),
          ...(reason.trim() ? { selectionReason: reason.trim() } : {}),
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "확정 실패");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {candidates.map((c) => {
        const active = c.idx === chosenIdx;
        // 이 후보가 실제 인용한 검색 출처만(evidence_ids ∩ sources). 주제와 무관한 건 안 보임.
        const candSources = sources.filter((s) => c.evidence_ids.includes(s.id));
        return (
          <div key={c.idx} className={`border ${active ? "border-trus-yellow" : "border-trus-white/20"}`}>
            <button onClick={() => pick(c.idx)} className="block w-full p-4 text-left hover:bg-trus-white/[0.03]">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-xs font-black ${active ? "border-trus-yellow bg-trus-yellow text-trus-black" : "border-trus-white/40 text-trus-white/50"}`}
                >
                  {String.fromCharCode(65 + c.idx)}
                </span>
                <div className="min-w-0 flex-1">
                  <CandidateBody stage={stage} payload={c.payload} />
                  <p className="mt-2 text-xs leading-snug text-trus-white/60">왜: {c.reason}</p>
                  {c.evidence_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.evidence_ids.map((id) => (
                        <span key={id} className="border border-trus-white/15 px-1.5 py-0.5 text-[10px] text-trus-white/40">
                          {id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
            {candSources.length > 0 && (
              <div className="px-4 pb-3">
                <SourceLinks sources={candSources} />
              </div>
            )}
          </div>
        );
      })}

      {chosen && (
        <div className="border border-trus-yellow/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-trus-yellow text-xs font-bold tracking-widest uppercase">
              {String.fromCharCode(65 + chosen.idx)}안 확정
            </span>
            <button
              onClick={() => (editing ? setEditing(false) : startEdit())}
              className="border border-trus-white/30 px-2 py-1 text-xs text-trus-white/70 hover:border-trus-yellow"
            >
              {editing ? "수정 취소" : "수정"}
            </button>
          </div>

          {editing && draft != null && (
            <div className="mt-3">
              <EditFields stage={stage} draft={draft} setDraft={setDraft} />
            </div>
          )}

          <label className="mt-4 block text-xs text-trus-white/60">선택 이유 한 줄 (학습 신호)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="왜 이 안을 골랐는지 한 줄로"
            className={`mt-1 ${inputCls}`}
          />

          <button
            onClick={submit}
            disabled={pending}
            className="mt-4 bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
          >
            {pending ? "확정 중…" : "이 안으로 확정"}
          </button>
          {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
        </div>
      )}
    </div>
  );
}

// ── 후보 수정(편집 필드) ──
function EditFields({
  stage,
  draft,
  setDraft,
}: {
  stage: ProposalStage;
  draft: unknown;
  setDraft: (d: unknown) => void;
}) {
  if (stage === "topic") {
    const p = (draft ?? {}) as Partial<TopicPayload>;
    // ...p 보존: audience_level/audience_need가 제목 수정 시 사라지지 않게.
    return <input value={p.title ?? ""} onChange={(e) => setDraft({ ...p, title: e.target.value })} className={inputCls} />;
  }
  if (stage === "title_thumb") {
    const p = (draft ?? {}) as Partial<TitlePayload>;
    const set = (patch: Partial<TitlePayload>) => setDraft({ ...p, ...patch });
    return (
      <div className="flex flex-col gap-2">
        <input value={p.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="제목" className={inputCls} />
        <input
          value={p.thumbnail_copy ?? ""}
          onChange={(e) => set({ thumbnail_copy: e.target.value })}
          placeholder="썸네일 문구"
          className={inputCls}
        />
        <textarea
          value={p.thumbnail_layout ?? ""}
          onChange={(e) => set({ thumbnail_layout: e.target.value })}
          placeholder="레이아웃 설명"
          rows={2}
          className={inputCls}
        />
      </div>
    );
  }
  const p = (draft ?? {}) as Partial<StructurePayload>;
  const outline = Array.isArray(p.outline) ? p.outline : [];
  const setSection = (i: number, patch: Partial<StructureSection>) => {
    const next = outline.map((s, j) => (j === i ? { ...s, ...patch } : s));
    setDraft({ ...p, outline: next });
  };
  return (
    <div className="flex flex-col gap-3">
      <input
        value={p.approach ?? ""}
        onChange={(e) => setDraft({ ...p, approach: e.target.value })}
        placeholder="구성 컨셉"
        className={inputCls}
      />
      {outline.map((s, i) => (
        <div key={i} className="flex flex-col gap-1 border-l border-trus-white/15 pl-2">
          <input value={s?.section ?? ""} onChange={(e) => setSection(i, { section: e.target.value })} placeholder="섹션" className={inputCls} />
          <input value={s?.goal ?? ""} onChange={(e) => setSection(i, { goal: e.target.value })} placeholder="목표" className={inputCls} />
          <textarea value={s?.why ?? ""} onChange={(e) => setSection(i, { why: e.target.value })} placeholder="왜 이 순서" rows={2} className={inputCls} />
        </div>
      ))}
    </div>
  );
}
