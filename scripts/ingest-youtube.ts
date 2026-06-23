// YouTube ingest — 자막(transcripts) + 댓글(comments_raw). tech.md §3.2·§8.1·governance §2.
//   소스: contents(source='imported')의 youtube_video_id → 척추에 자동 매칭.
//   자막 = youtube-transcript(timedtext, API키 불필요) / 댓글 = Data API v3 commentThreads(공개·API키).
//   거버넌스: 댓글 author 미보관 + external_id HMAC. 원문 body는 저장하되 LLM 비전송(C안).
//
//   실행:
//     set -a; . ./.env; set +a
//     npx tsx scripts/ingest-youtube.ts            # dry-run: corpus/parsed/에 요약(DB 미반영)
//     npx tsx scripts/ingest-youtube.ts --commit    # transcripts+comments_raw 적재(service-role)

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { YoutubeTranscript } from "youtube-transcript";
import { createClient } from "@supabase/supabase-js";

const OUT_DIR = "corpus/parsed";
const COMMIT = process.argv.includes("--commit");
const YT_API = "https://www.googleapis.com/youtube/v3";
const MAX_COMMENT_PAGES = 100; // 안전 상한(=댓글 ~1만개/편). 도달 시 log로 경고(무음 절단 금지).

function db() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  return createClient(url, key, { auth: { persistSession: false } });
}

// governance §2: 댓글ID HMAC(원본·작성자 미보관). src/lib/commentHash.ts와 동일 로직.
function hashExternalId(externalId: string): string {
  const secret = process.env.COMMENT_HASH_SECRET;
  if (!secret) throw new Error("COMMENT_HASH_SECRET 미설정(governance §2)");
  return createHmac("sha256", secret).update(externalId).digest("hex");
}

// content_id는 보내지 않는다 — migration 18의 before-insert 트리거가
// youtube_video_id → contents.id 로 권위있게 파생(누락방지+일치보장). 앱 주입은 중복이라 제거.
interface TranscriptOut {
  youtube_video_id: string;
  lang: string | null;
  full_text: string;
  segments: { text: string; offset: number; duration: number }[];
  source: "subtitle";
}
interface CommentOut {
  youtube_video_id: string;
  external_id_hash: string;
  body: string;
  like_count: number;
  posted_at: string | null;
}

async function fetchTranscript(videoId: string): Promise<TranscriptOut | null> {
  for (const lang of ["ko", "en", undefined]) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
      if (items && items.length) {
        const segments = items.map((i) => ({ text: i.text, offset: i.offset, duration: i.duration }));
        return {
          youtube_video_id: videoId,
          lang: lang ?? null,
          full_text: segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim(),
          segments,
          source: "subtitle",
        };
      }
    } catch {
      /* 다음 언어 폴백 */
    }
  }
  return null; // 우아한 실패(자막 없음)
}

async function fetchComments(videoId: string): Promise<{ comments: CommentOut[]; disabled: boolean }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY 미설정");
  const out: CommentOut[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  const push = (id: string, snip: any) =>
    out.push({
      youtube_video_id: videoId,
      external_id_hash: hashExternalId(id), // ★ HMAC, author는 안 읽음
      body: snip.textOriginal ?? snip.textDisplay ?? "",
      like_count: snip.likeCount ?? 0,
      posted_at: snip.publishedAt ?? null,
    });

  do {
    const p = new URLSearchParams({ part: "snippet,replies", videoId, maxResults: "100", order: "relevance", key: apiKey });
    if (pageToken) p.set("pageToken", pageToken);
    const res = await fetch(`${YT_API}/commentThreads?${p}`);
    if (res.status === 403) return { comments: out, disabled: true }; // 댓글 비활성
    if (!res.ok) throw new Error(`commentThreads ${res.status}: ${await res.text().catch(() => "")}`);
    const data: any = await res.json();
    for (const t of data.items ?? []) {
      push(t.snippet.topLevelComment.id, t.snippet.topLevelComment.snippet);
      for (const r of t.replies?.comments ?? []) push(r.id, r.snippet);
    }
    pageToken = data.nextPageToken;
    pages++;
  } while (pageToken && pages < MAX_COMMENT_PAGES);

  if (pageToken) console.log(`   ⚠️ ${videoId}: ${MAX_COMMENT_PAGES}페이지 상한 도달 — 일부 댓글 미수집`);
  return { comments: out, disabled: false };
}

async function main() {
  const supa = db();
  const { data: contents, error } = await supa
    .from("contents")
    .select("youtube_video_id, topic")
    .eq("source", "imported")
    .not("youtube_video_id", "is", null)
    .order("upload_date");
  if (error) throw new Error(`contents 조회 실패: ${error.message}`);
  if (!contents?.length) throw new Error("imported contents 없음 — corpus ingest 먼저 필요");

  const transcripts: TranscriptOut[] = [];
  const commentsByVid: Record<string, { count: number; disabled: boolean }> = {};
  const allComments: CommentOut[] = [];

  console.log(`\n📥 YouTube ingest (${contents.length}편)\n`);
  for (const c of contents as { youtube_video_id: string; topic: string }[]) {
    const vid = c.youtube_video_id;
    const tr = await fetchTranscript(vid);
    if (tr) transcripts.push(tr);
    const { comments, disabled } = await fetchComments(vid);
    allComments.push(...comments);
    commentsByVid[vid] = { count: comments.length, disabled };
    const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].length));
    console.log(
      `   ${pad(c.topic, 24)} 자막 ${tr ? pad(tr.full_text.length + "자", 8) : pad("없음", 8)} 댓글 ${disabled ? "비활성" : comments.length + "개"}`,
    );
  }

  // dry-run 산출물(검수용·gitignore). 댓글은 body 길이만 기록(원문 대량 저장 회피).
  mkdirSync(OUT_DIR, { recursive: true });
  const summary = {
    transcripts: transcripts.map((t) => ({ vid: t.youtube_video_id, lang: t.lang, chars: t.full_text.length, segs: t.segments.length })),
    comments: commentsByVid,
    totals: { transcripts: transcripts.length, comments: allComments.length },
  };
  writeFileSync(join(OUT_DIR, "youtube-parsed.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`\n📄 요약: ${join(OUT_DIR, "youtube-parsed.json")} | 자막 ${transcripts.length}편 · 댓글 ${allComments.length}개`);

  if (!COMMIT) {
    console.log(`\n🔍 dry-run (DB 미반영). 검수 후 --commit 로 적재.`);
    return;
  }

  console.log(`\n💾 DB 적재 시작(service-role)...`);
  // 자막: 불변+youtube_video_id 유일 → 기존 것 건너뛰고 신규만 insert.
  const { data: existTr } = await supa.from("transcripts").select("youtube_video_id");
  const haveTr = new Set((existTr ?? []).map((r: any) => r.youtube_video_id));
  const newTr = transcripts.filter((t) => !haveTr.has(t.youtube_video_id));
  if (newTr.length) {
    const { error: e } = await supa.from("transcripts").insert(newTr);
    if (e) throw new Error(`transcripts insert 실패: ${e.message}`);
  }
  console.log(`   ✅ transcripts: 신규 ${newTr.length}편 적재 (기존 ${haveTr.size}편 건너뜀)`);

  // 댓글: external_id_hash 유일 → upsert(재실행 시 새 댓글만, 멱등).
  let up = 0;
  for (let i = 0; i < allComments.length; i += 500) {
    const batch = allComments.slice(i, i + 500);
    const { error: e } = await supa.from("comments_raw").upsert(batch, { onConflict: "external_id_hash", ignoreDuplicates: true });
    if (e) throw new Error(`comments_raw upsert 실패: ${e.message}`);
    up += batch.length;
  }
  console.log(`   ✅ comments_raw: ${up}개 upsert (author 미보관·HMAC)`);
  console.log(`\n✅ YouTube ingest 완료.`);
}

main().catch((e) => {
  console.error("ingest 실패:", e.message);
  process.exit(1);
});
