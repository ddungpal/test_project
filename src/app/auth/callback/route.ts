// OAuth 콜백(구글) — 인증 코드를 세션으로 교환하고 owner 여부를 결정한다.
//   단독 owner 앱: 이메일이 OWNER_EMAIL과 같으면 owner 승격(service-role), 아니면 접근 거부+로그아웃.
//   handle_new_user 트리거가 신규 가입을 viewer로 생성 → 여기서 owner로 올린다(멱등 upsert).
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server.js";
import { createAdminClient } from "../../../lib/supabase/admin.js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const supa = await createSupabaseServerClient();
  const { data, error } = await supa.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const userEmail = (data.user.email ?? "").trim().toLowerCase();

  if (ownerEmail && userEmail === ownerEmail) {
    // owner 승격(service-role = guard_role_change 허용 컨텍스트). 트리거 viewer 행을 owner로, 없으면 생성.
    const admin = createAdminClient();
    const displayName = (data.user.user_metadata?.name as string | undefined) ?? data.user.email ?? null;
    const { error: ue } = await admin
      .from("profiles")
      .upsert({ id: data.user.id, role: "owner", display_name: displayName }, { onConflict: "id" });
    if (ue) return NextResponse.redirect(`${origin}/login?error=owner`);
    return NextResponse.redirect(`${origin}${next}`);
  }

  // owner 아님 — 단독 owner 앱이므로 접근 차단(세션 폐기 후 로그인으로).
  await supa.auth.signOut();
  return NextResponse.redirect(`${origin}/login?error=denied`);
}
