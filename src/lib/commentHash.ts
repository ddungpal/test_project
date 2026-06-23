// 댓글 external_id HMAC 해시 — governance §2. 원본 ID 미보관, 작성자 역추적 차단.
// dedup·삭제동기화는 해시 일치로 가능. 키는 서버 전용 env(COMMENT_HASH_SECRET), 절대 클라이언트 노출 금지.

import { createHmac } from "node:crypto";

export function hashExternalId(externalId: string): string {
  const secret = process.env.COMMENT_HASH_SECRET;
  if (!secret) {
    throw new Error("COMMENT_HASH_SECRET 미설정 — 댓글 ingest 전 서버 env에 설정 필요(governance §2).");
  }
  return createHmac("sha256", secret).update(externalId).digest("hex");
}
