"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openScriptReview } from "@/app/actions/topicRun";

// script_ready → script_review 진입. AI 0회, 상태전환만.
export function EnterScriptReviewButton({ runId }: { runId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        await openScriptReview(runId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "검수 진입 실패");
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
        {pending ? "여는 중…" : "대본 검수 시작"}
      </button>
      {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
