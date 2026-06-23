"use client";

import { useEffect } from "react";

// 라우트 세그먼트 에러 바운더리 — 렌더/클라 에러를 잡아 캡처 싱크로 보고 + 복구 UI(TRUS).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <p className="text-trus-yellow text-xs font-bold tracking-widest uppercase">에러</p>
      <h1 className="mt-2 text-2xl font-black text-trus-white">문제가 발생했어요</h1>
      <p className="mt-3 text-sm text-trus-white/60">에러는 기록됐습니다(logs/errors.jsonl). 다시 시도하거나 목록으로 돌아가세요.</p>
      {error.digest && <p className="mt-1 font-mono text-xs text-trus-white/30">digest {error.digest}</p>}
      <p className="mt-3 border-l-2 border-trus-white/20 pl-2 font-mono text-xs text-trus-white/40">{error.message}</p>
      <div className="mt-6 flex gap-2">
        <button onClick={reset} className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black">
          다시 시도
        </button>
        <a href="/" className="border border-trus-white/30 px-5 py-2 text-sm font-bold text-trus-white/70 hover:border-trus-yellow">
          런 목록
        </a>
      </div>
    </main>
  );
}
