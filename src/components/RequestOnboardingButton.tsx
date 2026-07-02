"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestOnboarding } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";

// 쏙이 온보딩 진입 버튼 — 아크가 아직 없을 때 "먼저 이해하기" 트리거(requestOnboarding → run/onboarding.requested).
//   RequestStageButton 미러(폴링 상한·LiveRefresh·error). 단 next stage 5종 고정이 아니라 온보딩 전용이라 얇은 별도 컴포넌트로 둔다.
//   온디맨드·게이트 아님 — 이 버튼은 노출돼도 구다리 "구성 만들기"는 그대로 뜬다(건너뛰기 가능).
const POLL_LIMIT_MS = 180000;

export function RequestOnboardingButton({
  runId,
  retryableFailure,
}: {
  runId: string;
  // 초기 아크 생성이 YouTube quota(429) 등 일시적 실패로 죽었을 때 서버가 내려주는 실패 메시지.
  //   null이면 실패 없음(= 기존 동작 100% 유지). 값이 있으면 "다시 시도" 경로로 분기.
  retryableFailure?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 재시도 가능한 실패가 있고, 아직 이 세션에서 재시도를 누르지 않았을 때만 경고 분기.
  //   재시도를 누르면 submitted=true가 되어 아래 분기를 벗어나고 "만드는 중…" 정상 흐름으로 진입한다.
  const showRetryable = Boolean(retryableFailure) && !submitted && !pending;

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

  if (showRetryable) {
    return (
      <div>
        <p className="mb-2 border-l-2 border-trus-yellow pl-2 text-xs font-black text-trus-yellow">
          ⚠ 유튜브 검색 한도가 초과됐어요 — 잠시 후 다시 시도하세요.
        </p>
        <button
          onClick={onClick}
          className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-50"
        >
          다시 시도
        </button>
        {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
      </div>
    );
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
