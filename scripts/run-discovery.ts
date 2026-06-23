// 매일 발굴(B) 통합 검증 — Inngest cron 함수가 부르는 refreshTopicCandidates 를 그대로 호출($0).
//   멱등성(2회 실행 → 행 수 동일·last_seen_at 갱신)을 라이브 DB로 확인.
//
//   실행:
//     set -a; . ./.env; set +a
//     SEARCH_BACKEND=tavily SEARCH_FIXTURES=record npx tsx scripts/run-discovery.ts            # 실제 발굴(데이터 남김)
//     SEARCH_BACKEND=tavily SEARCH_FIXTURES=replay npx tsx scripts/run-discovery.ts            # fixtures만($0)
//     ... npx tsx scripts/run-discovery.ts --cleanup                                            # 이번에 만든 후보 삭제

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.js";
import { refreshTopicCandidates } from "../src/agents/topic_scout/discovery.js";

const CLEANUP = process.argv.includes("--cleanup");

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`❌ ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const supa = createClient<Database>(url, key, { auth: { persistSession: false } });

  console.log("\n🔭 [발굴 1회차]");
  const r1 = await refreshTopicCandidates(supa);
  console.log(`    댓글 ${r1.comment} · 트렌드 ${r1.trend} · 경쟁 ${r1.competitor} = 총 ${r1.total}`);
  assert(r1.total > 0, "후보 1건 이상 적재");

  // 적재된 행 확인(dedup_key·last_seen_at).
  const { data: after1, error: e1 } = await supa
    .from("topic_candidates")
    .select("id, source, title, signal_score, dedup_key, last_seen_at, status")
    .not("dedup_key", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(50);
  if (e1) throw new Error(`조회 실패: ${e1.message}`);
  const keys1 = new Set((after1 ?? []).map((r) => r.dedup_key));
  assert((after1 ?? []).length >= r1.total, `dedup_key 보유 후보 ≥ ${r1.total} (실제 ${(after1 ?? []).length})`);
  (after1 ?? []).slice(0, 8).forEach((r) => console.log(`    [${r.source}] ${(r.title ?? "").slice(0, 50)} · score ${r.signal_score} · ${r.dedup_key?.slice(0, 40)}`));
  const firstSeen = new Map((after1 ?? []).map((r) => [r.dedup_key, r.last_seen_at]));

  console.log("\n🔭 [발굴 2회차 — 멱등성 검증]");
  const r2 = await refreshTopicCandidates(supa);
  console.log(`    댓글 ${r2.comment} · 트렌드 ${r2.trend} · 경쟁 ${r2.competitor} = 총 ${r2.total}`);

  const { data: after2, error: e2 } = await supa
    .from("topic_candidates")
    .select("dedup_key, last_seen_at")
    .not("dedup_key", "is", null)
    .limit(500);
  if (e2) throw new Error(`재조회 실패: ${e2.message}`);
  const keys2 = new Set((after2 ?? []).map((r) => r.dedup_key));
  // 같은 신호는 새 행이 아니라 갱신 — 1회차 키들이 2회차에도 그대로(중복 폭증 없음).
  assert([...keys1].every((k) => keys2.has(k)), "1회차 dedup_key 전부 유지(중복 행 미생성)");
  const bumped = (after2 ?? []).filter((r) => firstSeen.has(r.dedup_key) && r.last_seen_at !== firstSeen.get(r.dedup_key)).length;
  assert(bumped > 0, `재발견 후보 last_seen_at 갱신(${bumped}건)`);

  if (CLEANUP) {
    const allKeys = [...keys2];
    const { error: de } = await supa.from("topic_candidates").delete().in("dedup_key", allKeys);
    if (de) throw new Error(`cleanup 실패: ${de.message}`);
    console.log(`\n🧹 cleanup: dedup_key 보유 후보 ${allKeys.length}건 삭제`);
  }

  console.log("\n✅ 발굴 검증 통과.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
