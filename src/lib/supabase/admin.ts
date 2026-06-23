import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

// service-role 클라이언트 — RLS 우회(ingest·파이프라인·관리 작업). 서버 전용.
// ⚠️ 절대 클라이언트 번들에 들어가면 안 됨 → "server-only"가 빌드 시 차단(governance §5).
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정(서버 env).");
  }
  return createClient<Database>(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
