"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveScriptAction, requestScriptReworkAction } from "@/app/actions/topicRun";

// 대본 최종 게이트(§8.1) — 승인(→approved) | 수정요청(→scripting 재생성, max_rework 초과 시 중단).
export function ScriptReview({ runId }: { runId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        await approveScriptAction(runId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "승인 실패");
      }
    });
  }

  function rework() {
    if (!window.confirm("대본을 다시 쓰게 합니다(짠펜 재실행, 운영 시 비용 발생). max_rework 초과 시 자동 중단됩니다. 진행할까요?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await requestScriptReworkAction(runId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정요청 실패");
      }
    });
  }

  return (
    <div className="border border-trus-yellow/40 p-4">
      <p className="text-xs text-trus-white/60">대본을 검토하고 확정하거나 다시 쓰게 하세요.</p>
      <div className="mt-3 flex gap-2">
        <button onClick={approve} disabled={pending} className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50">
          {pending ? "처리 중…" : "최종 승인"}
        </button>
        <button onClick={rework} disabled={pending} className="border border-trus-white/30 px-5 py-2 text-sm font-bold text-trus-white/80 hover:border-trus-yellow disabled:opacity-50">
          수정 요청
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
