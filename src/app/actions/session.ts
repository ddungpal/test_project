"use server";
// 로그아웃 Server Action(Phase 5 진짜 인증). 로그인은 구글 OAuth(/auth/callback) 전용.
//   signOut은 헤더 SignOutButton과 OAuth 콜백(비owner 거부)에서 사용.

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server.js";

export async function signOut(): Promise<void> {
  const supa = await createSupabaseServerClient();
  await supa.auth.signOut();
  redirect("/login");
}
