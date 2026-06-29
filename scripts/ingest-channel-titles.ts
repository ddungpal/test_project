// 채널 제목 ingest — 김짠부(또는 인자로 받은) 채널 최근 50개 영상 제목을 파일로 저장.
//   순수 파서는 src/ingest/channelTitles.ts. 호출 패턴은 scripts/ingest-youtube.ts 미러링.
//   statistics(조회수) part 호출 안 함 — 제목만.
//
//   실행:
//     set -a; . ./.env; set +a
//     npx tsx scripts/ingest-channel-titles.ts @zzanboo            # dry-run: 개수+샘플만 출력(파일 미반영)
//     npx tsx scripts/ingest-channel-titles.ts @zzanboo --commit    # corpus/titles/channel-recent.json 저장
//     CHANNEL_HANDLE=@zzanboo npx tsx scripts/ingest-channel-titles.ts --commit  # env로도 가능

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  parseUploadsPlaylistId,
  parseRecentTitles,
  resolveChannelQuery,
  type ChannelTitle,
} from "../src/ingest/channelTitles.js";

const YT_API = "https://www.googleapis.com/youtube/v3";
const OUT_DIR = "corpus/titles";
const OUT_FILE = "channel-recent.json";
const COMMIT = process.argv.includes("--commit");

function resolveChannelInput(): string {
  // process.argv[2]가 --commit가 아닌 실제 인자면 우선, 없으면 env.
  const arg = process.argv[2];
  const fromArg = arg && !arg.startsWith("--") ? arg : undefined;
  const channel = fromArg ?? process.env.CHANNEL_HANDLE;
  if (!channel) {
    console.error("사용법: npx tsx scripts/ingest-channel-titles.ts <@handle|채널URL> [--commit]");
    console.error("  또는 CHANNEL_HANDLE 환경변수 설정.");
    throw new Error("채널 식별자 미지정");
  }
  return channel;
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY 미설정");

  const channelInput = resolveChannelInput();
  const query = resolveChannelQuery(channelInput);
  const queryLabel = "forHandle" in query ? `@${query.forHandle}` : query.id;

  // 1) channels.list(part=contentDetails) — 핸들은 forHandle, 채널ID는 id 파라미터.
  const cp = new URLSearchParams({ part: "contentDetails", key: apiKey });
  if ("forHandle" in query) cp.set("forHandle", query.forHandle);
  else cp.set("id", query.id);
  const cRes = await fetch(`${YT_API}/channels?${cp}`);
  if (!cRes.ok) throw new Error(`channels.list ${cRes.status}: ${await cRes.text().catch(() => "")}`);
  const cData: unknown = await cRes.json();
  const uploadsPlaylistId = parseUploadsPlaylistId(cData);

  // 2) playlistItems.list(part=snippet, maxResults=50) — 최근 업로드.
  const pp = new URLSearchParams({
    part: "snippet",
    playlistId: uploadsPlaylistId,
    maxResults: "50",
    key: apiKey,
  });
  const pRes = await fetch(`${YT_API}/playlistItems?${pp}`);
  if (!pRes.ok) throw new Error(`playlistItems.list ${pRes.status}: ${await pRes.text().catch(() => "")}`);
  const pData: unknown = await pRes.json();
  const titles: ChannelTitle[] = parseRecentTitles(pData).slice(0, 50);

  console.log(`\n📥 채널 제목 ingest — ${queryLabel} | 가져온 제목 ${titles.length}개`);
  for (const t of titles.slice(0, 5)) {
    console.log(`   - ${t.title}  (${t.video_id}${t.published_at ? ` · ${t.published_at.slice(0, 10)}` : ""})`);
  }
  if (titles.length > 5) console.log(`   … 외 ${titles.length - 5}개`);

  if (!COMMIT) {
    console.log(`\n🔍 dry-run(파일 미반영). --commit 으로 ${join(OUT_DIR, OUT_FILE)} 저장.`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, OUT_FILE);
  writeFileSync(outPath, JSON.stringify(titles, null, 2), "utf8");
  console.log(`\n💾 저장: ${outPath} (${titles.length}개, 덮어쓰기)`);
}

main().catch((e) => {
  console.error("ingest-channel-titles 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
