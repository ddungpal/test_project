"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editTitle, regenerateAfterConfirm } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";
import type { TitlePayload } from "@/lib/dashboard/proposalTypes";

// 확정(titles_selected) 후 제목 손편집 — editTitle만 호출(상태 전이 없음).
//   읽기전용 표시(CandidateBody)는 그대로 두고, 그 아래 수정 토글. effective payload를 펼치고 title만 교체해
//   TitlePayload 형태(thumbnail_layout 등) 보존(ProposalSelector EditFields의 { ...p, title } 패턴 미러).
//   busy/error/useTransition·router.refresh()는 ProposalSelector 패턴 그대로.
//   ★ 'AI로 다시 생성'(step1) — regenerateAfterConfirm("titles")로 새 proposal 생성(상태 전이 없음).
//     완료 감지는 RegenerateButton 정본 미러: 제출 시 proposalId를 startId에 기록 → proposalId가 바뀌면 완료.
//     완료 시 regenCandidate(최신 proposal 첫 후보)에서 title만 뽑아 draft에 채운다(editTitle 호출 X·자동저장 금지).

const inputCls =
  "w-full border border-trus-white/30 bg-transparent px-2 py-1 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow";

// 안전 상한 — 완료는 proposalId 변경으로 감지하지만, 워커가 영영 끝나지 않을(실패) 때 폴링 무한루프 방지.
//   ★ 고정 시간 cutoff을 '완료 판정'으로 쓰지 마라(opus 생성 185s). 진짜 종료는 proposalId로 감지(RegenerateButton 정본).
const POLL_LIMIT_MS = 300000; // 5분(안전망).

export function PostConfirmTitleEdit({
  runId,
  payload,
  proposalId,
  regenCandidate,
}: {
  runId: string;
  payload: unknown;
  proposalId?: string | undefined;
  regenCandidate?: unknown;
}) {
  const p = (payload ?? {}) as Partial<TitlePayload>;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const titleId = useId();

  // 재생성(step1) — RegenerateButton 폴링 정본 미러.
  const [reason, setReason] = useState(""); // 선택 입력 — 왜 다시 생성하는지. 비/공백이면 백엔드에서 미전송.
  const [startId, setStartId] = useState<string | null>(null); // 제출 시점 proposalId(null=유휴). 이게 바뀌면 완료.
  const [timedOut, setTimedOut] = useState(false);
  const reasonId = useId();
  const submitted = startId !== null;

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

  // 재생성 완료 감지 — 새 proposal이 도착하면 proposalId prop이 startId와 달라진다 → 폴링 종료 + draft 채움.
  //   regenCandidate(최신 proposal 첫 후보)에서 title을 뽑아 setTitle만 한다(editTitle 호출 X·자동저장 금지).
  //   editing 패널은 열린 채 유지 — 사용자가 새 카피를 보고 검토/수정 후 기존 저장 버튼으로 확정.
  useEffect(() => {
    if (startId !== null && proposalId != null && proposalId !== startId) {
      const fresh = (regenCandidate ?? {}) as Partial<TitlePayload>;
      if (typeof fresh.title === "string") setTitle(fresh.title);
      setEditing(true); // 새 후보를 바로 보고 저장하게 패널 유지/오픈
      setStartId(null);
      setTimedOut(false);
      setReason(""); // 다음 입력을 위해 이유칸 비움
    }
  }, [proposalId, startId, regenCandidate]);

  // 안전 상한 — 워커 실패 등으로 영영 새 후보가 안 오면 폴링을 멈추고 안내만(무한 폴링 방지).
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [submitted]);

  function onRegenerate() {
    if (!proposalId) return;
    if (!window.confirm("AI로 제목 후보를 다시 생성합니다. 새 후보가 도착하면 수정칸에 채워집니다(자동 저장 X).")) return;
    setError(null);
    startTransition(async () => {
      try {
        await regenerateAfterConfirm(runId, "titles", reason); // 빈/공백 reason은 백엔드에서 미전송. force·forceLlm 미전송.
        setStartId(proposalId); // 현재 proposalId 기록 → 새 행 도착해 바뀌면 완료
        router.refresh();
      } catch (e) {
        setStartId(null);
        setError(e instanceof Error ? e.message : "재생성 실패");
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
            disabled={pending || submitted}
            className={`mt-1 ${inputCls} disabled:opacity-50`}
          />
          <button
            onClick={submit}
            disabled={pending || submitted}
            className="mt-3 bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-50"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
          {error && <p className="mt-2 text-xs font-bold text-trus-yellow">⚠ {error}</p>}

          {/* AI로 다시 생성(step1) — proposalId 없으면(방어) 숨김. 완료 시 위 제목칸에 새 후보 draft가 채워진다. */}
          {proposalId && (
            <div className="mt-4 border-t border-trus-white/15 pt-3">
              <label htmlFor={reasonId} className="mb-1.5 block text-xs font-bold text-trus-white/60">
                다시 생성 이유 (선택)
              </label>
              <textarea
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending || submitted}
                rows={2}
                placeholder="왜 다시 생성하나요? (선택) 예: 더 자극적인 후킹으로"
                className="mb-2 block w-full max-w-md resize-none border border-trus-yellow/40 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
              />
              <button
                onClick={onRegenerate}
                disabled={pending || submitted}
                className="border border-trus-yellow/50 px-5 py-2 text-sm font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
              >
                {pending ? "요청 중…" : submitted ? "생성 중…" : "AI로 다시 생성"}
              </button>
              {submitted && !timedOut && (
                <div className="mt-2">
                  <LiveRefresh active fallbackMs={3000} />
                </div>
              )}
              {submitted && timedOut && (
                <p className="mt-2 text-xs text-trus-white/50">새 후보가 수정칸에 반영됐는지 확인하세요.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
