"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateThumbnails, regenerateThumbnailSlot, confirmThumbnails } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";
import { CandidateBody } from "@/components/CandidateBody";
import { CandidateSourceBadge } from "@/components/CandidateSourceBadge";
import type { CandidateView } from "@/lib/dashboard/proposalTypes";

// 썸네일 스튜디오(§8.1 사람 게이트) — A/B/C 3개를 보고 ① 개별 칸 다시 생성 ② 3개 전체 다시 생성 ③ 3개로 확정.
//   ★ 완료 감지는 RegenerateButton 패턴 그대로: 재생성은 상태 전이 없이 새 stage_proposals 행만 INSERT(같은
//     proposedState 유지)라 state 신호가 없다. 대신 새 proposal의 id가 props로 도착하면 = 재생성 완료. 그때 폴링을 끈다.
//   고정 cutoff을 '완료 판정'으로 쓰지 않는다(opus는 3분+ 걸림). 안전 상한만 5분으로 두고, 진짜 종료는 proposalId로 감지.
const POLL_LIMIT_MS = 300000; // 5분(안전망). 정상 종료는 proposalId 변경이 담당.

// 어떤 작업이 진행 중인지 — 'all'(전체 재생성) | 슬롯 인덱스 | 'confirm' | null(유휴).
type Busy = "all" | "confirm" | number | null;

export function ThumbnailStudio({
  runId,
  proposalId,
  candidates,
}: {
  runId: string;
  proposalId: string;
  candidates: CandidateView[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null); // 진행 중인 작업(카드별 표시·버튼 disable용)
  const [startId, setStartId] = useState<string | null>(null); // 재생성 제출 시점 proposalId(null=유휴). 바뀌면 완료.
  const [timedOut, setTimedOut] = useState(false);
  const [allReason, setAllReason] = useState(""); // 전체 다시 생성 공용 사유(선택). 비/공백이면 백엔드에서 미전송.
  const [slotReasons, setSlotReasons] = useState<Record<number, string>>({}); // 카드별 사유(선택). idx→reason.
  const allReasonId = useId();
  const slotReasonBaseId = useId();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const submitted = startId !== null;

  // 완료 감지 — router.refresh 폴링으로 새 proposal이 도착하면 proposalId prop이 startId와 달라진다 → 폴링 종료·busy 해제.
  useEffect(() => {
    if (startId !== null && proposalId !== startId) {
      setStartId(null);
      setBusy(null);
      setTimedOut(false);
      setAllReason(""); // 재생성 완료 → 다음 입력 위해 사유칸 비움(RegenerateButton 패턴)
      setSlotReasons({});
    }
  }, [proposalId, startId]);

  // 안전 상한 — 워커 실패 등으로 영영 새 후보가 안 오면 폴링을 멈추고 안내만(무한 폴링 방지).
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [submitted]);

  // 재생성(전체/개별) 공통 — busy 표시 + 현재 proposalId 기록(새 행 도착해 바뀌면 완료) + 폴링 시작.
  function runRegen(which: "all" | number, fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setBusy(which);
        setStartId(proposalId);
        router.refresh();
      } catch (e) {
        setBusy(null);
        setStartId(null);
        setError(e instanceof Error ? e.message : "재생성 실패");
      }
    });
  }

  // 확정 — 상태 전이(thumbnails_selected)라 새로고침하면 selected 요약으로 다시 그려진다(proposalId 폴링 불필요).
  function onConfirm() {
    if (!window.confirm("이 3개 썸네일을 A/B/C 테스트 세트로 확정합니다.")) return;
    setError(null);
    setBusy("confirm");
    startTransition(async () => {
      try {
        await confirmThumbnails(runId);
        router.refresh();
      } catch (e) {
        setBusy(null);
        setError(e instanceof Error ? e.message : "확정 실패");
      }
    });
  }

  const disabledAll = pending || submitted || busy === "confirm";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {candidates.map((c) => {
          const slotBusy = busy === c.idx;
          return (
            <div
              key={c.idx}
              className={`flex flex-col justify-between border-2 ${slotBusy ? "border-trus-yellow" : "border-trus-white/25"}`}
            >
              <div>
                {/* 카드 헤더 — A/B/C 채운 뱃지 + 슬롯 진행 표시. 아래 본문과 구분선으로 분리해 위계를 또렷이. */}
                <div className="flex items-center justify-between border-b-2 border-trus-white/25 px-3 py-2">
                  <span className="flex h-6 w-6 items-center justify-center bg-trus-yellow text-sm font-black text-trus-black">
                    {String.fromCharCode(65 + c.idx)}
                  </span>
                  {slotBusy ? (
                    <span className="text-xs font-bold tracking-wide text-trus-yellow">생성 중…</span>
                  ) : (
                    <CandidateSourceBadge evidenceIds={c.evidence_ids} />
                  )}
                </div>
                <div className={`p-3 ${slotBusy ? "opacity-50" : ""}`}>
                  <CandidateBody stage="thumbnail" payload={c.payload} />
                </div>
              </div>
              <div className="m-3 mt-0 flex flex-col gap-2">
                {/* 카드별 사유(선택) — 이 칸만 다시 생성할 때 왜 다시인지. 비/공백이면 미전송(기존 동작). */}
                <label htmlFor={`${slotReasonBaseId}-${c.idx}`} className="sr-only">
                  {String.fromCharCode(65 + c.idx)} 칸 다시 생성 이유 (선택)
                </label>
                <input
                  id={`${slotReasonBaseId}-${c.idx}`}
                  type="text"
                  value={slotReasons[c.idx] ?? ""}
                  onChange={(e) => setSlotReasons((prev) => ({ ...prev, [c.idx]: e.target.value }))}
                  disabled={disabledAll}
                  placeholder="이 칸 왜 다시? (선택)"
                  className="block w-full border border-trus-white/25 bg-transparent px-2 py-1.5 text-xs text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
                />
                <button
                  onClick={() => runRegen(c.idx, () => regenerateThumbnailSlot(runId, c.idx, slotReasons[c.idx]))}
                  disabled={disabledAll}
                  className="border border-trus-white/30 px-3 py-2 text-xs font-bold text-trus-white/80 hover:border-trus-yellow hover:text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
                >
                  {slotBusy ? "이 칸 생성 중…" : "이 썸네일만 다시 생성"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 액션 — 보조(전체 다시 생성, outline)와 주 액션(확정, 노란 채움)을 좌우로 갈라 위계를 분명히. */}
      <div className="flex flex-col gap-3 border-t-2 border-trus-white/20 pt-4">
        {/* 전체 공용 사유(선택) — 3개 전체 다시 생성 시 함께 전달. 비/공백이면 미전송(기존 동작). */}
        <div className="max-w-md">
          <label htmlFor={allReasonId} className="mb-1.5 block text-xs font-bold text-trus-white/60">
            전체 다시 생성 이유 (선택)
          </label>
          <textarea
            id={allReasonId}
            value={allReason}
            onChange={(e) => setAllReason(e.target.value)}
            disabled={disabledAll}
            rows={2}
            placeholder="왜 다시? (선택) 예: 박스 문구 더 짧게"
            className="block w-full resize-none border border-trus-yellow/40 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 전체 재생성 두 경로 — '다시 생성($0)'(로컬 우선) vs 'LLM으로 새로 써줘'(forceLlm·비용). 슬롯('이 칸만')은 별도 경로라 미변경. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => runRegen("all", () => regenerateThumbnails(runId, allReason))}
              disabled={disabledAll}
              className="border border-trus-yellow/50 px-5 py-2.5 text-sm font-bold text-trus-yellow hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
            >
              {busy === "all" ? "전체 생성 중…" : "다시 생성 ($0)"}
            </button>
            <button
              onClick={() => runRegen("all", () => regenerateThumbnails(runId, allReason, true))}
              disabled={disabledAll}
              className="border border-trus-white/30 px-5 py-2.5 text-sm font-bold text-trus-white/80 hover:border-trus-yellow hover:text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
            >
              LLM으로 새로 써줘
            </button>
          </div>
          <button
            onClick={onConfirm}
            disabled={disabledAll}
            className="bg-trus-yellow px-6 py-2.5 text-sm font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-40"
          >
            {busy === "confirm" ? "확정 중…" : "이 3개로 확정"}
          </button>
        </div>
      </div>

      {submitted && !timedOut && (
        <div>
          <LiveRefresh active fallbackMs={3000} />
        </div>
      )}
      {submitted && timedOut && (
        <p className="text-xs text-trus-white/50">새 썸네일이 위에 반영됐는지 확인하세요.</p>
      )}
      {error && <p className="text-xs font-bold text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
