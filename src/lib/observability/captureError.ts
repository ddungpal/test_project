// 에러 영속 캡처(실사용 디버깅) — 발생한 에러를 logs/errors.jsonl에 append + 콘솔 출력.
//   목적: 실사용 중 나는 에러를 "기억"해 두고 나중에 고친다(휘발 방지). 4개 표면 공통 싱크:
//   instrumentation.onRequestError(서버: RSC·라우트·Server Action) / Inngest onFailure(파이프라인) /
//   error.tsx·global-error.tsx→/api/client-error(클라 렌더) / 읽기쿼리.
//   ★ 절대 throw 안 한다(로깅이 앱을 깨면 안 됨).
//   ★ node 모듈(fs/path)은 함수 내부에서 동적 import — instrumentation이 edge용으로도
//     컴파일될 때 정적 node: import가 번들 에러를 내기 때문(node 런타임에서만 실제 파일쓰기).

export interface ErrorRecord {
  id: string;
  at: string;
  source: "request" | "inngest" | "client" | "query" | "action" | "unknown";
  message: string;
  stack?: string | undefined;
  digest?: string | undefined;
  context?: Record<string, unknown> | undefined;
}

// crypto 비의존 짧은 id(추적용·충돌 무해).
function shortId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 에러를 캡처해 파일+콘솔에 남기고 짧은 추적 id를 반환. 실패해도 절대 throw 안 함. */
export async function captureError(
  source: ErrorRecord["source"],
  err: unknown,
  context?: Record<string, unknown>,
): Promise<string> {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));
  const rec: ErrorRecord = {
    id: shortId(),
    at: new Date().toISOString(),
    source,
    message: e.message,
    stack: e.stack,
    digest: (e as { digest?: string }).digest,
    context,
  };

  // 콘솔은 항상(dev 서버 로그에서 즉시 보임).
  console.error(`[CAPTURE:${source}] #${rec.id} ${rec.message}`, context ?? "");

  // 파일 append(영속). node 런타임에서만 — edge/권한문제 등으로 실패해도 무시(콘솔엔 이미 남음).
  if (process.env.NEXT_RUNTIME !== "edge") {
    try {
      const { appendFile, mkdir } = await import("node:fs/promises");
      const path = await import("node:path");
      const dir = path.join(process.cwd(), "logs");
      await mkdir(dir, { recursive: true });
      await appendFile(path.join(dir, "errors.jsonl"), JSON.stringify(rec) + "\n", "utf8");
    } catch (writeErr) {
      console.error("[CAPTURE] 로그 파일 기록 실패(무시):", writeErr);
    }
  }
  return rec.id;
}
