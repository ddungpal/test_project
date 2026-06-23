// owner 계정 시드 — Supabase Auth 가입 + owner 승격. tech.md §11·migration 02·11.
//   흐름: auth user 생성(admin API) → handle_new_user 트리거가 profiles(viewer) 자동생성
//        → service-role로 role='owner' 승격(guard_role_change는 auth.uid()=NULL=서버만 허용).
//   멱등: 같은 이메일 user 있으면 재사용, 이미 owner면 그대로.
//
//   실행(.env에 OWNER_EMAIL 필요, OWNER_PASSWORD는 선택):
//     set -a; . ./.env; set +a
//     npx tsx scripts/seed-owner.ts

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const email = process.env.OWNER_EMAIL?.trim();
  if (!email) throw new Error("OWNER_EMAIL 미설정(.env) — owner로 만들 이메일을 넣으세요");
  const password = process.env.OWNER_PASSWORD?.trim() || undefined; // 없으면 비밀번호 없이 생성(나중에 reset)

  const supa = createClient(url, key, { auth: { persistSession: false } });

  // 1) 기존 auth user 찾기(멱등) — 없으면 생성.
  const { data: list, error: le } = await supa.auth.admin.listUsers();
  if (le) throw new Error(`listUsers 실패: ${le.message}`);
  let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    // exactOptionalPropertyTypes: password는 있을 때만 포함(undefined 명시 전달 금지).
    const attrs: { email: string; email_confirm: boolean; password?: string } = { email, email_confirm: true };
    if (password) attrs.password = password; // 없으면 비밀번호 없이 생성(추후 reset)
    const { data: created, error: ce } = await supa.auth.admin.createUser(attrs);
    if (ce) throw new Error(`createUser 실패: ${ce.message}`);
    user = created.user!;
    console.log(`✅ auth user 생성: ${email} (${user.id})${password ? " · 비밀번호 설정됨" : " · 비밀번호 없음(추후 reset)"}`);
  } else {
    console.log(`ℹ️ 기존 auth user 사용: ${email} (${user.id})`);
  }

  // 2) profiles 보장(트리거가 viewer로 생성하지만, 혹시 없으면 채움). service-role이라 RLS 우회.
  const { error: ue } = await supa
    .from("profiles")
    .upsert({ id: user.id, role: "viewer", display_name: email }, { onConflict: "id", ignoreDuplicates: true });
  if (ue) throw new Error(`profiles upsert 실패: ${ue.message}`);

  // 3) owner 승격(service-role → guard_role_change 통과).
  const { error: pe } = await supa.from("profiles").update({ role: "owner" }).eq("id", user.id);
  if (pe) throw new Error(`owner 승격 실패: ${pe.message}`);

  // 4) 검증.
  const { data: prof, error: se } = await supa.from("profiles").select("id, role, display_name").eq("id", user.id).single();
  if (se) throw new Error(`검증 조회 실패: ${se.message}`);
  const { count } = await supa.from("profiles").select("*", { count: "exact", head: true }).eq("role", "owner");
  console.log(`\n✅ owner 시드 완료 — ${prof.display_name} / role=${prof.role}`);
  console.log(`   전체 owner 수: ${count}`);
  if ((count ?? 0) > 1) console.log(`   ⚠️ owner가 2명 이상입니다. 의도한 게 맞는지 확인하세요.`);
}

main().catch((e) => {
  console.error("seed-owner 실패:", e.message);
  process.exit(1);
});
