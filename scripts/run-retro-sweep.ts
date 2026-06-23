// 회고 자동 sweep(운영 자동화 ①) 통합 검증 — Inngest 함수가 부르는 retrospectiveSweep을 그대로 호출.
//   성과는 있는데 회고가 없는 콘텐츠를 찾아 회고 실행. 멱등(2회차엔 새 회고 0건).
//
//   실행:
//     set -a; . ./.env; set +a
//     # 먼저 성과 적재(scripts/ingest-performance.ts) 후:
//     LLM_BACKEND=claude-p LLM_FIXTURES=record npx tsx scripts/run-retro-sweep.ts            # sweep 실행($0)
//     npx tsx scripts/run-retro-sweep.ts --limit 5                                            # 1회 처리 상한

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.js";
import { retrospectiveSweep } from "../src/agents/retrospectivist/runRetrospective.js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : null;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const supa = createClient<Database>(url, key, { auth: { persistSession: false } });
  const limit = Number(arg("--limit") ?? 20);

  console.log(`\n🪞 회고 sweep — 성과 있고 회고 없는 콘텐츠 (limit ${limit})`);
  const r = await retrospectiveSweep(supa, { limit });
  console.log(`\n✅ sweep 완료 — 대상 ${r.eligible} · 실행 ${r.ran}`);
  r.results.forEach((res) =>
    console.log(`    ${res.contentId.slice(0, 8)} → ${res.skipped ? `건너뜀(${res.skipped})` : `인사이트 ${res.insightCount}건`}`),
  );
  if (r.eligible === 0) console.log("    (대상 없음 — 모든 성과 콘텐츠가 이미 회고됨 = 멱등)");
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
