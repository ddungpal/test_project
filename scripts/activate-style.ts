// style_profiles 승격 — thumbnail_copy 의 최신 draft를 active로(훅이가 사용). 사람 게이트(검수 후 승격).
//   같은 component_type(thumbnail_copy)의 active는 1개만 유지(기존 active는 retired).
//   migration 18 B3: style_profiles active 단일성 partial unique → 기존 active를 먼저 내려야 위반 안 함.
//   ⚠️ component_type 스코프를 모든 쿼리에 건다(title/description active와 충돌 방지).
//   실행: set -a; . ./.env; set +a; npx tsx scripts/activate-style.ts [version]
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.js";

const COMPONENT_TYPE = "thumbnail_copy" as const;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const supa = createClient<Database>(url, key, { auth: { persistSession: false } });

  const wantVersion = process.argv[2] ? Number(process.argv[2]) : null;
  const { data: rows, error } = await supa
    .from("style_profiles")
    .select("id, version, status")
    .eq("component_type", COMPONENT_TYPE)
    .order("version", { ascending: false });
  if (error) throw new Error(`style_profiles 조회 실패: ${error.message}`);
  if (!rows?.length) throw new Error("style_profiles(thumbnail_copy) 없음 — extract-style을 먼저 커밋");

  const target = wantVersion ? rows.find((r) => r.version === wantVersion) : rows[0];
  if (!target) throw new Error(`style_profiles(thumbnail_copy) v${wantVersion} 없음`);
  if (target.status === "active") {
    console.log(`ℹ️ style_profiles(thumbnail_copy) v${target.version} 이미 active`);
    return;
  }

  // 기존 active → retired (active 1개 유지, partial unique 위반 방지). component_type 스코프.
  await supa
    .from("style_profiles")
    .update({ status: "retired" })
    .eq("component_type", COMPONENT_TYPE)
    .eq("status", "active");
  const { error: ue } = await supa.from("style_profiles").update({ status: "active" }).eq("id", target.id);
  if (ue) throw new Error(`승격 실패: ${ue.message}`);
  console.log(`✅ style_profiles(thumbnail_copy) v${target.version} → active (훅이 사용 가능)`);
}

main().catch((e) => {
  console.error("activate-style 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
