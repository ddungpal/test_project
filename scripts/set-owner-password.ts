// owner 비밀번호 직접 변경(이메일 불필요·service-role admin API). 본인 터미널에서 실행 권장.
//   비번이 셸 히스토리에 남지 않게 read -s 로 입력:
//     set -a; . ./.env; set +a
//     read -s -p "새 비번(8자+): " NEW_OWNER_PASSWORD; echo; export NEW_OWNER_PASSWORD
//     npx tsx scripts/set-owner-password.ts
//     unset NEW_OWNER_PASSWORD
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.js";

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.OWNER_EMAIL;
  const pw = process.env.NEW_OWNER_PASSWORD;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 — 먼저 `set -a; . ./.env; set +a`");
  if (!email) throw new Error("OWNER_EMAIL 미설정 (.env)");
  if (!pw || pw.length < 8) throw new Error("NEW_OWNER_PASSWORD 미설정 또는 8자 미만 — `read -s` 로 입력 후 export");

  const supa = createClient<Database>(url, key, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.admin.listUsers();
  if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`OWNER_EMAIL(${email}) 사용자를 찾을 수 없음`);

  const { error: ue } = await supa.auth.admin.updateUserById(user.id, { password: pw });
  if (ue) throw new Error(`비밀번호 변경 실패: ${ue.message}`);
  console.log(`✅ ${email} 비밀번호 변경 완료. 이제 새 비번으로 로그인하세요.`);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
