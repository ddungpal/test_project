import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types.js";

// SSR 서버 클라이언트 — anon 키 + 사용자 세션 쿠키 → RLS 적용(역할 기반 권한).
// 대시보드 서버 컴포넌트/액션에서 사용. service-role 아님(admin.ts와 구분).
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 미설정.");

  const cookieStore = await cookies();
  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component에서 호출 시 set 불가 — 미들웨어/액션에서 세션 갱신 처리.
        }
      },
    },
  });
}
