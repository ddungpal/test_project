"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateStage } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";

// 폴링 상한 — 재생성은 상태 전이가 없어(같은 proposedState 유지) 버튼이 자동 언마운트되지 않는다.
//   새 proposal이 들어오면 LiveRefresh가 갱신하지만, 영영 안 들어오면 폴링이 무한히 돈다. 60초 지나면 끄고 안내만.
const POLL_LIMIT_MS = 60000;

// '다시 생성'(§8.2) — 현재 후보를 버리고 force로 같은 단계를 다시 돌린다. regenerateStage(force) 호출.
//   보조 행동(확정보다 약한 위계) + 실수 클릭 방지 confirm. proposedState 분기에서만 노출(다운스트림 무효화 방지).
export function RegenerateButton({ runId, stage }: { runId: string; stage: "topic" | "titles" | "structure" }) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 제출 후 상한 시간 지나면 폴링 중단(무한 폴링 방지). 새 후보가 들어와 router.refresh되면 이 컴포넌트도 재마운트되며 정리됨.
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [submitted]);

  function onClick() {
    if (!window.confirm("현재 후보를 버리고 새로 생성합니다.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await regenerateStage(runId, stage);
        setSubmitted(true);
        router.refresh();
      } catch (e) {
        setSubmitted(false);
        setError(e instanceof Error ? e.message : "재생성 실패");
      }
    });
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={pending || submitted}
        className="border border-trus-yellow/50 px-5 py-2 text-sm font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
      >
        {pending ? "요청 중…" : submitted ? "생성 중…" : "다시 생성"}
      </button>
      {submitted && !timedOut && (
        <div className="mt-2">
          <LiveRefresh active fallbackMs={3000} />
        </div>
      )}
      {submitted && timedOut && (
        <p className="mt-2 text-xs text-trus-white/50">새 후보가 위에 반영됐는지 확인하세요.</p>
      )}
      {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
