import { NextRequest } from "next/server";
import { captureError } from "@/lib/observability/captureError";

// 클라이언트 렌더 에러 수신 싱크 — error.tsx/global-error.tsx가 POST한다. logs/errors.jsonl에 기록.
export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    stack?: string;
    digest?: string;
    url?: string;
  };
  const err = new Error(body.message ?? "client error");
  if (body.stack) err.stack = body.stack;
  const id = await captureError("client", err, { url: body.url, digest: body.digest });
  return Response.json({ ok: true, id });
}
