"use client";

import { useEffect } from "react";

// 루트 레이아웃까지 깨지는 최상위 에러 바운더리 — html/body를 자체 렌더해야 한다.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
    <html lang="ko">
      <body style={{ background: "#121212", color: "#fff", fontFamily: "sans-serif", padding: "5rem 1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 900 }}>치명적 에러</h1>
        <p style={{ marginTop: "0.75rem", color: "#ffffff99", fontSize: "0.875rem" }}>
          에러는 기록됐습니다(logs/errors.jsonl). 새로고침하거나 다시 시도하세요.
        </p>
        <p style={{ marginTop: "0.75rem", color: "#ffffff66", fontFamily: "monospace", fontSize: "0.75rem" }}>{error.message}</p>
        <button
          onClick={reset}
          style={{ marginTop: "1.5rem", background: "#F8F082", color: "#121212", fontWeight: 900, padding: "0.5rem 1.25rem", border: 0 }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
