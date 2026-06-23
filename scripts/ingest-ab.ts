// A/B 썸네일 성과 적재(Phase B) — corpus/thumbnails/ab-results.json(YouTube Test&Compare 9영상)을
//   ab_variants 테이블에 멱등 upsert + contents.ab_* 캐시 파생. 코드 전용·LLM 0회(거버넌스 C).
//   ★ ingest.ts(성과 적재) 미러: 같은 judgeComponent 재계산·같은 onConflict·같은 pickContentVerdict→contents.ab_* 파생.
//     다른 점은 입력 소스(ab-results.json)와 지표뿐 — watch_share_pct 를 ctr_pct 슬롯에 주입(아래 ⚠️).
//
//   ⚠️ 지표 주의: ab-results.json 의 비교 지표는 watch_share_pct('시청 시간 점유율')다 — CTR 아님.
//     ctr_pct 컬럼 슬롯에 넣되, payload.metric="watch_share_pct" 로 무엇인지 명시한다(오기재 방지).
//   ⚠️ 분모 주의: 파일 relative_lift_pct=(winner-2nd)/winner, judgeComponent margin=(winner-2nd)/2nd.
//     판정 권위는 judgeComponent 재계산(rank·is_winner). 파일 is_winner/verdict 와 다르면 console.warn 만(throw 금지).
//   ⚠️ content_id 해석: youtube_video_id → contents 매칭. 없으면 topic 매칭. 그래도 없으면 최소필드 스텁 생성
//     (source='produced'·status='in_production'·title=topic — contents 척추 규칙 위반 금지·중복 생성 금지). dry-run 에선 insert 안 함.
//
//   실행(.env 필요):
//     set -a; . ./.env; set +a
//     npx tsx scripts/ingest-ab.ts            # dry-run: 매핑·해석 결과만 출력(DB 미반영·스텁 미생성)
//     npx tsx scripts/ingest-ab.ts --commit   # ab_variants upsert + contents.ab_* 파생 + (필요시)스텁 생성
//     npx tsx scripts/ingest-ab.ts --cleanup  # ab-results.json 영상의 ab_variants 행 삭제 + contents.ab_* 초기화(역연산)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Database, Json, TablesInsert } from "../src/lib/supabase/database.types.js";
import { loadConfig } from "../src/llm/config.js";
import { judgeComponent, pickContentVerdict, type AbScoreInput, type AbThresholds, type AbVerdict } from "../src/performance/abVerdict.js";
import type { AbResultVariant, AbResultVideo } from "./learn-ab-style.js";

const COMMIT = process.argv.includes("--commit");
const CLEANUP = process.argv.includes("--cleanup");
const AB_RESULTS_PATH = join(process.cwd(), "corpus", "thumbnails", "ab-results.json");

/** ab_variants.payload 의 metric 표식 — watch_share_pct 가 ctr_pct 슬롯에 들어가 있음을 명시. */
export const AB_METRIC = "watch_share_pct" as const;

/** 한 변형의 payload(공개 카피·시각만 — 거버넌스 §4: PII 없음). metric 으로 ctr_pct 의 정체를 박는다. */
function buildPayload(v: AbResultVariant): Json {
  const payload: Record<string, string> = { metric: AB_METRIC };
  if (typeof v.copy_top === "string" && v.copy_top.trim()) payload.copy_top = v.copy_top.trim();
  if (typeof v.copy_main === "string" && v.copy_main.trim()) payload.copy_main = v.copy_main.trim();
  if (typeof v.copy_box === "string" && v.copy_box.trim()) payload.copy_box = v.copy_box.trim();
  if (typeof v.visual === "string" && v.visual.trim()) payload.visual = v.visual.trim();
  return payload;
}

/**
 * 한 영상 → ab_variants 행 배열(순수 변환 — DB·시각 무관, 테스트 import 용).
 *   - component_type='thumbnail' 고정(ab-results.json 은 썸네일 A/B).
 *   - watch_share_pct 를 judgeComponent('thumbnail') 에 ctr_pct 슬롯으로 주입 → rank·is_winner 재계산(권위).
 *   - 행의 ctr_pct = watch_share_pct, impressions=null(Studio 미노출), weight=null(여기서 미산출).
 *   - 파일 is_winner/verdict 와 재계산이 다르면 console.warn 만(throw 금지). 같은 입력 2회 → 동일 행 배열(멱등).
 */
export function mapVideoToAbRows(
  video: AbResultVideo,
  contentId: string,
  thresholds: AbThresholds,
): TablesInsert<"ab_variants">[] {
  const scoreInputs: AbScoreInput[] = video.variants.map((v) => ({
    variant: v.variant,
    ctr_pct: v.watch_share_pct ?? null,
    impressions: null,
  }));
  const verdict = judgeComponent("thumbnail", scoreInputs, thresholds);

  // 파일 verdict 와 재계산 불일치 경고(분모 차이로 다를 수 있음 — 재계산이 권위).
  if (video.verdict && verdict.decisiveness && video.verdict !== verdict.decisiveness) {
    console.warn(`⚠️ verdict 불일치(${video.topic}): 파일=${video.verdict} vs 재계산=${verdict.decisiveness} — 재계산 기준`);
  }
  // 파일 is_winner 와 재계산 winner 불일치 경고.
  const fileWinner = video.variants.find((v) => v.is_winner === true)?.variant ?? null;
  if (fileWinner && verdict.winner && fileWinner !== verdict.winner) {
    console.warn(`⚠️ winner 불일치(${video.topic}): 파일=${fileWinner} vs 재계산=${verdict.winner} — 재계산 기준`);
  }

  return verdict.ranked.map((rv) => {
    const src = video.variants.find((v) => v.variant === rv.variant);
    return {
      content_id: contentId,
      component_type: "thumbnail" as const,
      variant: rv.variant,
      payload: src ? buildPayload(src) : { metric: AB_METRIC },
      ctr_pct: rv.ctr_pct ?? null, // = watch_share_pct(payload.metric 참조)
      impressions: null,
      weight: null,
      rank: rv.rank,
      is_winner: rv.is_winner,
    };
  });
}

/** 한 영상의 썸네일 판정(contents.ab_* 파생용) — mapVideoToAbRows 와 동일한 재계산. */
function thumbnailVerdict(video: AbResultVideo, thresholds: AbThresholds): AbVerdict {
  const scoreInputs: AbScoreInput[] = video.variants.map((v) => ({
    variant: v.variant,
    ctr_pct: v.watch_share_pct ?? null,
    impressions: null,
  }));
  return judgeComponent("thumbnail", scoreInputs, thresholds);
}

/** ab-results.json 로드 → videos 배열. */
export function loadAbResults(filePath = AB_RESULTS_PATH): AbResultVideo[] {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as { videos?: AbResultVideo[] };
  if (!Array.isArray(parsed.videos)) throw new Error(`${filePath}: videos 배열 없음`);
  return parsed.videos;
}

type Supa = ReturnType<typeof createClient<Database>>;

function makeClient(): Supa {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

/**
 * content_id 해석: youtube_video_id → topic 순으로 contents 매칭.
 *   못 찾으면(commit 시) 최소필드 스텁 생성(source='produced'·status='in_production'·title=topic). dry-run 이면 생성 안 하고 null.
 */
async function resolveOrStubContentId(
  supa: Supa,
  video: AbResultVideo,
  opts: { create: boolean },
): Promise<{ contentId: string | null; created: boolean }> {
  if (video.youtube_video_id) {
    const { data } = await supa.from("contents").select("id").eq("youtube_video_id", video.youtube_video_id).maybeSingle();
    if (data?.id) return { contentId: data.id, created: false };
  }
  // topic 매칭(비골든 — vid 없음). 정확 일치만(느슨한 매칭은 오연결 위험).
  if (video.topic) {
    const { data } = await supa.from("contents").select("id").eq("title", video.topic).maybeSingle();
    if (data?.id) return { contentId: data.id, created: false };
  }
  if (!opts.create) return { contentId: null, created: false }; // dry-run: 스텁 미생성.

  // 최소필드 스텁 — contents 척추 규칙 준수(source/status 유효값·title 채움). 중복 생성 금지(위에서 매칭 실패 후만 도달).
  const stub: TablesInsert<"contents"> = {
    source: "produced",
    status: "in_production",
    title: video.topic ?? null,
  };
  if (video.youtube_video_id) stub.youtube_video_id = video.youtube_video_id;
  const { data, error } = await supa.from("contents").insert(stub).select("id").single();
  if (error) throw new Error(`contents 스텁 생성 실패(${video.topic}): ${error.message}`);
  return { contentId: data.id, created: true };
}

interface IngestAbResult {
  videos: number;
  abVariants: number;
  decided: number;
  stubsCreated: number;
  skipped: { ref: string; reason: string }[];
}

/** ab-results.json → ab_variants 멱등 upsert + contents.ab_* 파생. create=false(dry-run) 시 DB 미변경. */
async function ingestAb(supa: Supa, videos: AbResultVideo[], thresholds: AbThresholds, opts: { create: boolean }): Promise<IngestAbResult> {
  const result: IngestAbResult = { videos: 0, abVariants: 0, decided: 0, stubsCreated: 0, skipped: [] };

  for (const video of videos) {
    const ref = video.youtube_video_id ?? video.topic ?? "(미상)";
    const { contentId, created } = await resolveOrStubContentId(supa, video, opts);
    if (!contentId) {
      result.skipped.push({ ref, reason: opts.create ? "content 해석/스텁 실패" : "dry-run(스텁 미생성) — content 미매칭" });
      continue;
    }
    if (created) result.stubsCreated += 1;
    result.videos += 1;

    const abRows = mapVideoToAbRows(video, contentId, thresholds);
    const pick = pickContentVerdict([thumbnailVerdict(video, thresholds)]);

    if (!opts.create) {
      // dry-run: 매핑 결과만 출력(upsert·update 안 함).
      result.abVariants += abRows.length;
      if (pick) result.decided += 1;
      console.log(`  • ${ref} → content=${contentId} · ab_variants ${abRows.length}행 · 판정=${pick ? pick.decisiveness : "pending"}`);
      continue;
    }

    const { error } = await supa.from("ab_variants").upsert(abRows, { onConflict: "content_id,component_type,variant" });
    if (error) throw new Error(`ab_variants upsert 실패(${ref}): ${error.message}`);
    result.abVariants += abRows.length;

    // contents.ab_* = ab_variants 파생 캐시(단일 출처 → 드리프트 차단). ingest.ts 와 동일.
    const patch = pick
      ? { ab_margin: pick.margin, ab_decisiveness: pick.decisiveness, ab_result_status: "decided" as const }
      : { ab_margin: null, ab_decisiveness: null, ab_result_status: "pending" as const };
    const { error: ce } = await supa.from("contents").update(patch).eq("id", contentId);
    if (ce) throw new Error(`contents ab_* 갱신 실패(${ref}): ${ce.message}`);
    if (pick) result.decided += 1;
  }
  return result;
}

/** 적재 역연산 — ab-results.json 영상의 ab_variants 행 삭제 + contents.ab_* 초기화(스텁 content 는 삭제 안 함). */
async function cleanupAb(supa: Supa, videos: AbResultVideo[]): Promise<{ videos: number }> {
  let n = 0;
  for (const video of videos) {
    const { contentId } = await resolveOrStubContentId(supa, video, { create: false });
    if (!contentId) continue;
    await supa.from("ab_variants").delete().eq("content_id", contentId).eq("component_type", "thumbnail");
    await supa.from("contents").update({ ab_margin: null, ab_decisiveness: null, ab_result_status: "pending" }).eq("id", contentId);
    n += 1;
  }
  return { videos: n };
}

async function main() {
  const videos = loadAbResults();
  const cfg = loadConfig();

  if (CLEANUP) {
    const supa = makeClient();
    const r = await cleanupAb(supa, videos);
    console.log(`\n🧹 cleanup: 영상 ${r.videos}건의 ab_variants(thumbnail) 삭제 + contents.ab_* 초기화`);
    return;
  }

  if (!COMMIT) {
    console.log(`\n🔎 dry-run — ab-results.json ${videos.length}영상 매핑(DB 미반영·스텁 미생성)\n`);
    const supa = makeClient();
    const r = await ingestAb(supa, videos, cfg.ab, { create: false });
    console.log(`\n📋 dry-run 요약: 매칭 ${r.videos}영상 · ab_variants ${r.abVariants}행(예정) · 판정 ${r.decided}건`);
    if (r.skipped.length) {
      console.log(`\n⚠️ 미매칭 ${r.skipped.length}건(--commit 시 스텁 생성):`);
      r.skipped.forEach((s) => console.log(`    - ${s.ref}: ${s.reason}`));
    }
    console.log(`\nℹ️ 실제 적재는 --commit. 비골든 영상은 vid/topic 미매칭 시 스텁 content 가 생성됩니다.`);
    return;
  }

  const supa = makeClient();
  console.log(`\n📥 A/B 적재 — ab-results.json ${videos.length}영상`);
  const r = await ingestAb(supa, videos, cfg.ab, { create: true });
  console.log(`\n✅ 적재 완료`);
  console.log(`    영상 ${r.videos} · ab_variants ${r.abVariants}행 · A/B 확정 ${r.decided}건 · 스텁 생성 ${r.stubsCreated}건`);
  if (r.skipped.length) {
    console.log(`\n⚠️ 건너뜀 ${r.skipped.length}건:`);
    r.skipped.forEach((s) => console.log(`    - ${s.ref}: ${s.reason}`));
  }
}

const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invokedDirectly) {
  main().catch((e) => {
    console.error("\ningest-ab 실패:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
