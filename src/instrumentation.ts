// Next 15 공식 서버 에러 훅 — Server Component(RSC)·Route Handler·Server Action에서 던져진
//   모든 미처리 에러를 한 곳에서 캡처한다(읽기쿼리 throw·액션 throw 포함). 휘발 방지.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // captureError는 server-only(node fs) — edge 회피 위해 동적 import.
  const { captureError } = await import("./lib/observability/captureError.js");
  await captureError("request", err, {
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
