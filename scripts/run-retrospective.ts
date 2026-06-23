// 회고 실행(Phase 4 슬라이스 2) — 한 영상의 발행 후 회고 → retrospectives + 인사이트 draft.
//   성과 데이터가 먼저 있어야 의미 있음(scripts/ingest-performance.ts 로 적재 후 실행).
//
//   실행:
//     set -a; . ./.env; set +a
//     # 영상 지정: --content <uuid> 또는 --video <youtube_video_id>
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/run-retrospective.ts --video 5f8EtDUXgoQ
//     LLM_FIXTURES=replay npx tsx scripts/run-retrospective.ts --video 5f8EtDUXgoQ            # 녹화분 재생($0)
//     npx tsx scripts/run-retrospective.ts --video 5f8EtDUXgoQ --cleanup                       # 회고·draft 삭제(역연산)

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.js";
import { runRetrospective, cleanupRetrospectives } from "../src/agents/retrospectivist/runRetrospective.js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : null;
}
const CLEANUP = process.argv.includes("--cleanup");

function makeClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

async function resolveContentId(supa: ReturnType<typeof makeClient>): Promise<string> {
  const cid = arg("--content");
  if (cid) return cid;
  const vid = arg("--video");
  if (!vid) throw new Error("--content <uuid> 또는 --video <youtube_video_id> 필요");
  const { data, error } = await supa.from("contents").select("id").eq("youtube_video_id", vid).maybeSingle();
  if (error) throw new Error(`contents 조회 실패: ${error.message}`);
  if (!data) throw new Error(`youtube_video_id=${vid} 인 content 없음`);
  return data.id;
}

async function main() {
  const supa = makeClient();
  const contentId = await resolveContentId(supa);

  if (CLEANUP) {
    const r = await cleanupRetrospectives(supa, contentId);
    console.log(`\n🧹 cleanup: retrospectives ${r.retrospectives}행 · draft insights ${r.insights}건 삭제 · 승격분 ${r.detached}건 detach(보존)`);
    return;
  }

  console.log(`\n🪞 회고 실행 — content ${contentId}`);
  const r = await runRetrospective(supa, contentId);
  if (r.skipped === "no_performance") {
    console.log("⏭️  성과 데이터 없음 → 회고 건너뜀. 먼저 scripts/ingest-performance.ts 로 성과를 적재하세요.");
    return;
  }
  console.log(`\n✅ 회고 완료 (비용 $${r.costUsd.toFixed(4)})`);
  console.log(`\n  [잘된 점] ${r.output.good_points}`);
  console.log(`  [개선점] ${r.output.improvements}`);
  console.log(`  [교훈] ${r.output.lessons}`);
  console.log(`\n  인사이트 draft ${r.insightCount}건:`);
  r.output.insights.forEach((it, i) =>
    console.log(`    ${i + 1}. [${it.category}·conf ${it.confidence}] ${it.title}\n       ${it.body.slice(0, 100)}… (근거: ${it.evidence.slice(0, 60)})`),
  );
  console.log(`\n  → 인사이트는 status='draft'. 승격(draft→approved)은 김짠부의 선택(슬라이스 3 UI).`);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
