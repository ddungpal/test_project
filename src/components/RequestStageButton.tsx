"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestTitles, requestStructure, requestResearch, requestScript } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";

// 폴링 상한 — 단계가 영영 완료 안 되면 버튼이 안 사라져 폴링이 무한히 돈다. 3분 지나면 끄고 안내만 표시.
const POLL_LIMIT_MS = 180000;

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
  const [submitted, setSubmitted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 제출 후 상한 시간 지나면 폴링 중단(무한 폴링 방지). 결과가 들어오면 버튼이 언마운트되며 타이머도 정리됨.
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [submitted]);

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        await ACTION[next](runId);
        setSubmitted(true);
        router.refresh();
      } catch (e) {
        setSubmitted(false);
        setError(e instanceof Error ? e.message : "요청 실패");
      }
    });
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={pending || submitted}
        className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
      >
        {pending ? "요청 중…" : submitted ? "생성 중…" : label}
      </button>
      {submitted && !timedOut && (
        <div className="mt-2">
          <LiveRefresh active fallbackMs={3000} />
        </div>
      )}
      {submitted && timedOut && (
        <p className="mt-2 text-xs text-trus-white/50">오래 걸립니다 — 새로고침하거나 로그를 확인하세요.</p>
      )}
      {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
