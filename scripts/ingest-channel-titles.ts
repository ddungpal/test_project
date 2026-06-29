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
  fetchChannelTitles,
  resolveChannelQuery,
  type ChannelTitle,
} from "../src/ingest/channelTitles.js";

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

  // 네트워크 fetch(채널 → 업로드 재생목록 → 최근 50개 제목)는 공유 코어로 위임. 파일 쓰기·출력은 CLI에 유지.
  const titles: ChannelTitle[] = await fetchChannelTitles(channelInput, apiKey);

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
