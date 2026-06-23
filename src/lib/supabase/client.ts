import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types.js";

// 브라우저 클라이언트 — anon 키. RLS 적용. NEXT_PUBLIC_ 만 사용(비밀 노출 금지).
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 미설정.");
  return createBrowserClient<Database>(url, anon);
}
