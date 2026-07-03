"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateOnboarding } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";

// 쏙이 온보딩 재생성 버튼 — 이미 아크가 있을 때 force로 다시 만든다(regenerateOnboarding → run/onboarding.requested force:true).
//   RequestOnboardingButton 미러(폴링 상한·LiveRefresh·error)지만 retryable 분기는 없다(진입 버튼 전용 개념).
//   주제가 바뀌어 stale일 때 갱신 경로이자, stale 아니어도 아크가 있으면 언제든 다시 만들 수 있다(수동·경고만·차단 아님).
const POLL_LIMIT_MS = 180000;

export function RegenerateOnboardingButton({ runId }: { runId: string }) {
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
    // ★ 재생성 직전 풀이이력 제거 — 새 문항이 나올 수 있으니 옛 answers를 남기지 않는다.
    //   키는 OnboardingQuiz.answersKey(`onboarding:answers:${runId}`)와 반드시 동일.
    if (typeof window !== "undefined") window.localStorage.removeItem(`onboarding:answers:${runId}`);
    startTransition(async () => {
      try {
        await regenerateOnboarding(runId);
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
        {pending ? "요청 중…" : submitted ? "다시 만드는 중…" : "온보딩 다시 만들기"}
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
