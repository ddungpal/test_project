// DB 적용 검증 — service-role로 실제 연결해 시드·테이블 확인. (admin.ts는 server-only라 여기선 직접 생성)
//   set -a; . ./.env; set +a; npx tsx scripts/db-verify.ts

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");

const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // 1) config_registry 시드 확인(9개 기대)
  const { data: cfg, error: e1 } = await db.from("config_registry").select("key, value").order("key");
  if (e1) throw new Error(`config_registry 조회 실패: ${e1.message}`);
  console.log(`\n✅ config_registry: ${cfg.length}개 시드`);
  for (const r of cfg) console.log(`   - ${r.key} = ${JSON.stringify(r.value)}`);

  // 2) 핵심 테이블 존재(빈 select)
  const tables = [
    "profiles", "contents", "production_runs", "comments_raw", "research_facts",
    "script_segments", "corpus_editions", "tone_profile", "run_state_transitions",
  ];
  console.log("\n✅ 테이블 접근 확인:");
  for (const t of tables) {
    const { error } = await db.from(t).select("*", { count: "exact", head: true });
    console.log(`   - ${t}: ${error ? "❌ " + error.message : "OK"}`);
  }

  // 3) 전이표 시드 확인
  const { count, error: e3 } = await db.from("run_state_transitions").select("*", { count: "exact", head: true });
  console.log(`\n✅ run_state_transitions: ${e3 ? "❌ " + e3.message : count + "개 전이 규칙"}`);

  console.log("\n검증 완료 — DB가 앱에서 service-role로 접근 가능.");
}

main().catch((e) => {
  console.error("검증 실패:", e.message);
  process.exit(1);
});
