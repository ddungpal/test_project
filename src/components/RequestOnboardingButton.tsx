"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestOnboarding } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";

// 쏙이 온보딩 진입 버튼 — 아크가 아직 없을 때 "먼저 이해하기" 트리거(requestOnboarding → run/onboarding.requested).
//   RequestStageButton 미러(폴링 상한·LiveRefresh·error). 단 next stage 5종 고정이 아니라 온보딩 전용이라 얇은 별도 컴포넌트로 둔다.
//   온디맨드·게이트 아님 — 이 버튼은 노출돼도 구다리 "구성 만들기"는 그대로 뜬다(건너뛰기 가능).
const POLL_LIMIT_MS = 180000;

export function RequestOnboardingButton({ runId }: { runId: string }) {
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
    startTransition(async () => {
      try {
        await requestOnboarding(runId);
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
        {pending ? "요청 중…" : submitted ? "쏙이가 만드는 중…" : "먼저 이해하기 (쏙이)"}
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
