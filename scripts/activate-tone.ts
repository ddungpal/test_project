// tone_profile 승격 — 최신 draft를 active로(짠펜이 사용). 사람 게이트(검수 후 승격).
//   같은 종류(tone) active는 1개만 유지(기존 active는 retired).
//   실행: set -a; . ./.env; set +a; npx tsx scripts/activate-tone.ts [version]
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.js";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const supa = createClient<Database>(url, key, { auth: { persistSession: false } });

  const wantVersion = process.argv[2] ? Number(process.argv[2]) : null;
  const q = supa.from("tone_profile").select("id, version, status").order("version", { ascending: false });
  const { data: rows, error } = await q;
  if (error) throw new Error(`tone_profile 조회 실패: ${error.message}`);
  if (!rows?.length) throw new Error("tone_profile 없음 — extract-tone을 먼저 커밋");

  const target = wantVersion ? rows.find((r) => r.version === wantVersion) : rows[0];
  if (!target) throw new Error(`tone_profile v${wantVersion} 없음`);
  if (target.status === "active") {
    console.log(`ℹ️ tone_profile v${target.version} 이미 active`);
    return;
  }

  // 기존 active → retired (active 1개 유지).
  await supa.from("tone_profile").update({ status: "retired" }).eq("status", "active");
  const { error: ue } = await supa.from("tone_profile").update({ status: "active" }).eq("id", target.id);
  if (ue) throw new Error(`승격 실패: ${ue.message}`);
  console.log(`✅ tone_profile v${target.version} → active (짠펜 사용 가능)`);
}

main().catch((e) => {
  console.error("activate-tone 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
