// 성과 적재(Phase 4) — 수동 입력 파일(fixtures/performance/manual.json)을 DB에 적재. 개발 $0·멱등.
//   운영 전환 시 입력부만 YouTube Analytics 어댑터로 교체(writer 동일).
//
//   실행:
//     set -a; . ./.env; set +a
//     npx tsx scripts/ingest-performance.ts --list     # 성과 입력이 필요한 영상(content_id·youtube_video_id) 출력
//     npx tsx scripts/ingest-performance.ts            # manual.json 읽어 적재(performance_metrics·ab_variants·contents.ab_*)
//     npx tsx scripts/ingest-performance.ts --cleanup  # manual.json 영상의 성과·A/B 행 삭제 + ab_* 초기화(역연산)

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.js";
import { loadConfig } from "../src/llm/config.js";
import { ingestPerformance, cleanupPerformance } from "../src/performance/ingest.js";
import { loadManualPerformance, MANUAL_PERF_PATH } from "../src/performance/manualSource.js";

const LIST = process.argv.includes("--list");
const CLEANUP = process.argv.includes("--cleanup");

function makeClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

async function listContents() {
  const supa = makeClient();
  const { data, error } = await supa
    .from("contents")
    .select("id, title, youtube_video_id, upload_date, ab_result_status")
    .order("upload_date", { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) throw new Error(`contents 조회 실패: ${error.message}`);
  console.log(`\n📋 성과 입력 대상 영상 (${data?.length ?? 0}건) — manual.json 의 youtube_video_id 로 매칭\n`);
  for (const c of data ?? []) {
    console.log(`  • ${c.youtube_video_id ?? "(vid 없음)"}  ${(c.title ?? "(제목 없음)").slice(0, 40)}`);
    console.log(`      content_id=${c.id}  upload=${c.upload_date ?? "-"}  ab=${c.ab_result_status}`);
  }
  console.log(`\n  → ${MANUAL_PERF_PATH} 에 위 영상의 결과 숫자를 채우세요.`);
}

async function ingest() {
  const supa = makeClient();
  const cfg = loadConfig();
  const entries = await loadManualPerformance();
  console.log(`\n📥 성과 적재 — 영상 ${entries.length}건 입력`);
  const r = await ingestPerformance(supa, entries, cfg.ab);
  console.log(`\n✅ 적재 완료`);
  console.log(`    영상 ${r.contents} · performance_metrics ${r.metrics}행 · ab_variants ${r.abVariants}행 · A/B 확정 ${r.decided}건`);
  if (r.skipped.length) {
    console.log(`\n⚠️  건너뜀 ${r.skipped.length}건:`);
    r.skipped.forEach((s) => console.log(`    - ${s.ref}: ${s.reason}`));
  }
}

async function cleanup() {
  const supa = makeClient();
  const entries = await loadManualPerformance();
  const r = await cleanupPerformance(supa, entries);
  console.log(`\n🧹 cleanup: 영상 ${r.contents}건의 성과·A/B 행 삭제 + contents.ab_* 초기화`);
}

(LIST ? listContents() : CLEANUP ? cleanup() : ingest()).catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
