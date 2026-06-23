// 촉이 외부 evidence 인용 검증 — 토픽 단계만 실행해 후보의 evidence_ids에 web:/yt:가 섞이는지 본다.
//   실행: set -a; . ./.env; set +a; npx tsx scripts/verify-topic-evidence.ts [키워드]
//   (키워드 주면 키워드 발굴 모드, 없으면 광역 발굴 모드.) 끝나면 테스트 run 자동 삭제.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.js";
import { loadConfig } from "../src/llm/config.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import { runProposalStage } from "../src/pipeline/stageContract.js";
import { topicStageSpec } from "../src/agents/topic_scout/stage.js";

const config = loadConfig();
const ledger = new InMemoryCostLedger();
const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

async function main() {
  const supa = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const keyword = process.argv[2] || null;
  const { data: content, error: ce } = await supa
    .from("contents")
    .insert({ source: "produced", status: "in_production", ...(keyword ? { topic: keyword } : {}) })
    .select("id")
    .single();
  if (ce) throw new Error(ce.message);
  const { data: run, error: re } = await supa.from("production_runs").insert({ content_id: content.id }).select("id").single();
  if (re) throw new Error(re.message);

  console.log(`▶ run ${run.id} · mode=${keyword ? `키워드:${keyword}` : "광역"} · search=${process.env.SEARCH_BACKEND} · llm=${config.backend}/${config.fixtures}`);
  console.log("토픽 단계 실행(외부검색+claude-p)…\n");

  const r = await runProposalStage(topicStageSpec(run.id), { supa, config, costGuard, ledger });
  let extCount = 0;
  for (const c of r.candidates) {
    const ext = c.evidence_ids.filter((e) => e.startsWith("web:") || e.startsWith("yt:"));
    if (ext.length) extCount++;
    console.log(`[${c.idx}] ${JSON.stringify((c.payload as { title?: string }).title)}`);
    console.log(`     evidence: ${c.evidence_ids.join(", ")}`);
    console.log(`     왜: ${c.reason.slice(0, 140)}\n`);
  }
  console.log(`▶ 외부(web:/yt:) 인용 후보: ${extCount}/${r.candidates.length}`);

  await supa.from("contents").delete().eq("id", content.id); // 캐스케이드 정리
  console.log("(테스트 run 삭제됨)");
}
main().catch((e) => {
  console.error("실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
