# Step 0: channel-titles-ingest

김짠부 유튜브 채널의 **최근 50개 영상 제목**(실제 발행 제목 = 정확한 텍스트)을 YouTube Data API로 가져와 파일 산출물로 저장한다. 이 산출물을 step1의 제목 스타일 학습이 소비한다.

## 읽어야 할 파일

먼저 아래를 읽고 기존 ingest·설정 패턴을 파악하라:

- `CLAUDE.md` (보안: API 키·`.env*` 커밋 금지 / 채널 @zzanboo)
- `.claude/rules/rules.md` (새 env는 `.env.example`에도 추가)
- `scripts/ingest-youtube.ts` — **YouTube Data API v3 호출 패턴의 단일 출처**. `YT_API` 상수(`https://www.googleapis.com/youtube/v3`), `process.env.YOUTUBE_API_KEY` 사용법, `URLSearchParams`로 쿼리 빌드, dry-run/`--commit` 분기, 멱등 저장을 그대로 미러링하라. 절대 새 호출 방식을 발명하지 마라.
- `scripts/extract-tone.ts` — dry-run vs `--commit`, `corpus/` 하위에 산출물 JSON을 쓰는 학습 작업 스크립트 형태(이 phase의 step1이 이걸 미러링함). 산출물 디렉토리 컨벤션 참고.

## 작업

### 1) 순수 파서 모듈 — `src/ingest/channelTitles.ts` (신규)
네트워크 없이 테스트 가능한 순수 함수만 둔다(I/O는 스크립트가 담당):

```ts
// channels.list 응답에서 업로드 재생목록 ID 추출
export function parseUploadsPlaylistId(channelsResponse: unknown): string;
//   → items[0].contentDetails.relatedPlaylists.uploads. 없으면 throw(채널 못 찾음).

// playlistItems.list 응답 → 제목 목록
export interface ChannelTitle { video_id: string; title: string; published_at: string | null; }
export function parseRecentTitles(playlistItemsResponse: unknown): ChannelTitle[];
//   → items[].snippet.{ title, resourceId.videoId, publishedAt }. title 공백/누락 항목은 제외.

// 입력 채널 식별자(핸들/URL) → channels.list 쿼리 파라미터로 정규화
export function resolveChannelQuery(input: string): { forHandle: string } | { id: string };
//   → "@zzanboo" / "youtube.com/@zzanboo" → {forHandle:"zzanboo"} (@·URL 제거).
//   → "youtube.com/channel/UCxxxx" → {id:"UCxxxx"}. 그 외 형태는 forHandle로 폴백.
```

### 2) 스크립트 래퍼 — `scripts/ingest-channel-titles.ts` (신규)
- 채널 식별자를 **인자 또는 env로** 받는다(`process.argv[2]` 우선, 없으면 `process.env.CHANNEL_HANDLE`). 둘 다 없으면 사용법 출력 후 throw. **채널을 코드에 하드코딩하지 마라.**
- 흐름: `resolveChannelQuery` → `channels.list`(`part=contentDetails`) → `parseUploadsPlaylistId` → `playlistItems.list`(`part=snippet`, `maxResults=50`) → `parseRecentTitles` → 최대 50개.
- `YOUTUBE_API_KEY` 미설정 시 명확한 에러(ingest-youtube와 동일 메시지 형식).
- **dry-run**(기본): 가져온 개수 + 제목 샘플 몇 개를 출력하고 파일은 쓰지 않는다.
- **`--commit`**: `corpus/titles/channel-recent.json`에 `ChannelTitle[]`를 저장(디렉토리 없으면 생성). 재실행 시 덮어쓰기(멱등).
- `.env.example`에 `CHANNEL_HANDLE`(선택적, 기본 채널 핸들 메모) 한 줄 추가.

### 3) 테스트 — `tests/channelTitles.test.ts` (신규)
`parseUploadsPlaylistId` / `parseRecentTitles` / `resolveChannelQuery`를 **인라인 픽스처 JSON**(실제 응답 형태 모사)으로 검증한다. 네트워크 호출 없음. 최소 케이스: 정상 50개 파싱, 제목 누락 항목 제외, 핸들/URL/채널ID 정규화 3형태.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 API 호출은 AC에서 하지 않는다 — 라이브 fetch는 사람이 키로 1회 실행. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 파서가 순수 함수이고(네트워크 의존 0) 테스트가 픽스처만으로 도는가.
   - `YT_API`·키·쿼리 빌드를 `ingest-youtube.ts`에서 재사용했는가(중복 구현 아님).
   - 채널이 하드코딩되지 않고 인자/env로 주입되는가.
   - 새 DB 테이블·마이그레이션이 없는가(파일 산출물만).
3. `phases/title-channel-learn/index.json`의 step 0을 갱신한다(completed+summary / error / blocked). **index.json은 반드시 유효한 JSON으로 저장하라.**

## 금지사항

- `statistics`(조회수) part 호출 금지. 이유: 결정1=(A) 순수 스타일 학습 — CTR/조회수 가중을 쓰지 않으므로 불필요하고, 안 가져온다.
- 새 DB 테이블·마이그레이션 추가 금지. 이유: 50개 제목은 파일 산출물(`corpus/titles/channel-recent.json`)로 충분하다. 무게 최소화.
- 채널 핸들 하드코딩 금지. 이유: 인자/env로 받아 재사용 가능하게.
- `YOUTUBE_API_KEY`·실제 키 값을 코드/커밋에 넣지 마라. 이유: 보안(CLAUDE.md).
- step1 영역(스타일 추출·`style_profiles` INSERT)을 건드리지 마라. 이유: 이 step은 ingest만.
- 기존 테스트를 깨뜨리지 마라.
