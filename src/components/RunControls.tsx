"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abortRunAction, resumeRunAction } from "@/app/actions/topicRun";
import type { RunState } from "@/domain/enums";

// 반장 마감 제어 — kill switch(중단) + SOFT 캡 일시정지 재개.
//   재개 단계(research|script)는 owner가 선택(어느 단계에서 멈췄는지는 상태에 보존 안 됨).
const TERMINAL: RunState[] = ["approved", "published", "aborted"];

export function RunControls({ runId, runState }: { runId: string; runState: RunState }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "실패");
      }
    });
  }

  function abort() {
    if (!window.confirm("이 런을 중단합니다(되돌릴 수 없음). 진행할까요?")) return;
    run(() => abortRunAction(runId));
  }

  if (runState === "paused_soft_cap") {
    return (
      <div className="border border-trus-yellow px-4 py-3">
        <p className="text-sm text-trus-yellow">⏸ 비용 SOFT 한도로 일시정지. 멈춘 단계부터 이어서 재개합니다.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => run(() => resumeRunAction(runId))} disabled={pending} className="bg-trus-yellow px-4 py-1.5 text-xs font-black text-trus-black disabled:opacity-50">
            {pending ? "…" : "재개"}
          </button>
          <button onClick={abort} disabled={pending} className="border border-trus-white/30 px-4 py-1.5 text-xs font-bold text-trus-white/70 hover:border-trus-yellow disabled:opacity-50">
            중단
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
      </div>
    );
  }

  if (TERMINAL.includes(runState)) return null;

  return (
    <div>
      <button onClick={abort} disabled={pending} className="border border-trus-white/25 px-3 py-1 text-xs font-bold text-trus-white/50 hover:border-trus-yellow hover:text-trus-yellow disabled:opacity-50">
        {pending ? "…" : "런 중단"}
      </button>
      {error && <p className="mt-1 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
