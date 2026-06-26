"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editTitle } from "@/app/actions/topicRun";
import type { TitlePayload } from "@/lib/dashboard/proposalTypes";

// 확정(titles_selected) 후 제목 손편집 — editTitle만 호출(상태 전이 없음).
//   읽기전용 표시(CandidateBody)는 그대로 두고, 그 아래 수정 토글. effective payload를 펼치고 title만 교체해
//   TitlePayload 형태(thumbnail_layout 등) 보존(ProposalSelector EditFields의 { ...p, title } 패턴 미러).
//   busy/error/useTransition·router.refresh()는 ProposalSelector 패턴 그대로.

const inputCls =
  "w-full border border-trus-white/30 bg-transparent px-2 py-1 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow";

export function PostConfirmTitleEdit({ runId, payload }: { runId: string; payload: unknown }) {
  const p = (payload ?? {}) as Partial<TitlePayload>;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const titleId = useId();

  function startEdit() {
    setTitle(p.title ?? ""); // 현재 확정값으로 초기화(취소 후 재진입 대비)
    setError(null);
    setEditing(true);
  }

  function submit() {
    setError(null);
    // 기존 effective payload 펼치고 title만 교체 — thumbnail_layout 등 다른 필드 보존.
    const next = { ...p, title: title.trim() } as TitlePayload;
    startTransition(async () => {
      try {
        await editTitle(runId, next);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  return (
    <div className="mt-3 border-t border-trus-white/15 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-trus-white/40">제목 손편집</span>
        <button
          onClick={() => (editing ? setEditing(false) : startEdit())}
          className="border border-trus-white/30 px-2 py-1 text-xs text-trus-white/70 hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow"
        >
          {editing ? "수정 취소" : "수정"}
        </button>
      </div>

      {editing && (
        <div className="mt-3">
          <label htmlFor={titleId} className="block text-xs text-trus-white/60">제목</label>
          <input
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            disabled={pending}
            className={`mt-1 ${inputCls} disabled:opacity-50`}
          />
          <button
            onClick={submit}
            disabled={pending}
            className="mt-3 bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-50"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
          {error && <p className="mt-2 text-xs font-bold text-trus-yellow">⚠ {error}</p>}
        </div>
      )}
    </div>
  );
}
