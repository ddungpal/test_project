"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateApprovedScriptAction } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";

// 승인된 런의 대본 재생성 버튼 — approved→scripting 재오픈 후 짠펜 재실행(regenerateApprovedScriptAction).
//   RegenerateOnboardingButton 미러(폴링 상한·LiveRefresh·error). 다만 재생성은 승인 해제 + 검수부터 다시라
//   실행 전 window.confirm으로 그 사실을 정직하게 확인받는다(오너 의도 액션·되돌리기 안내).
const POLL_LIMIT_MS = 180000;
const CONFIRM_COPY =
  "대본을 다시 생성하면 현재 승인이 해제되고 검수 단계로 돌아갑니다. 새 대본이 만들어지는 동안 잠시 기다려 주세요. 계속할까요?";

export function RegenerateApprovedScriptButton({ runId }: { runId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [submitted]);

  function onClick() {
    setError(null);
    // 확인 절차 — 취소하면 아무것도 하지 않는다(승인 해제·검수 회귀를 숨기지 않는다).
    if (typeof window !== "undefined" && !window.confirm(CONFIRM_COPY)) return;
    startTransition(async () => {
      try {
        await regenerateApprovedScriptAction(runId);
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
        className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-50"
      >
        {pending ? "요청 중…" : submitted ? "다시 생성 중…" : "대본 다시 생성"}
      </button>
      <p className="mt-2 text-xs text-trus-white/50">승인이 해제되고 검수 단계부터 다시 진행됩니다.</p>
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
