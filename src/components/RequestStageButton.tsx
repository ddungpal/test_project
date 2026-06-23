"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestTitles, requestStructure, requestResearch, requestScript } from "@/app/actions/topicRun";

// 다음 단계 시작(§8.2 단계경계 버튼) — request 액션(이벤트 발행) → 해당 에이전트 durable 실행.
//   selected/approved 상태에서만 노출. 누르면 *_proposed로 진행(또는 researching/scripting).
type NextStage = "titles" | "structure" | "research" | "script";

const ACTION: Record<NextStage, (runId: string) => Promise<void>> = {
  titles: requestTitles,
  structure: requestStructure,
  research: requestResearch,
  script: requestScript,
};

export function RequestStageButton({ runId, next, label }: { runId: string; next: NextStage; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        await ACTION[next](runId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "요청 실패");
      }
    });
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={pending}
        className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
      >
        {pending ? "요청 중…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
