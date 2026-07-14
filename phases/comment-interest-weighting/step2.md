# Step 2: discovery-join

## 배경 (자기완결)

이제 실데이터를 결선한다. 댓글을 그 영상의 **조회수·업로드일**과 조인해 `videoWeight`를 계산하고, 각 댓글 행에 `weight`로 붙여 `aggregateCommentSignals`(step 1에서 확장됨)에 넘긴다. 두 소비처 모두에 적용한다:
- `src/agents/topic_scout/discovery.ts` (`refreshTopicCandidates`, 발굴 Cron — 전역)
- `src/agents/topic_scout/prepare.ts` (per-run 주제 분석)

`src/agents/retrospectivist/prepare.ts`는 **건드리지 않는다**(단일 영상이라 영상 가중 무의미 — step 1 불변식으로 자동 보존).

**데이터 소재(확인 완료):**
- 댓글↔영상 링크: `comments_raw.youtube_video_id`
- 영상 업로드일: `contents.upload_date` (join key: `contents.youtube_video_id`)
- 영상 조회수: `performance_metrics.views`, **`metric_window = 'd1'`** (join key: `performance_metrics.content_id = contents.id`). ★ d7/d14/d30은 현재 비어 있으니 **d1을 쓴다**.
- 데이터 없는 영상(views/date null)은 `videoWeight`가 1.0 폴백 → 우아한 강등.

## 읽어야 할 파일

- `src/agents/topic_scout/videoWeight.ts` (step 0) — `buildVideoWeightMap`, `videoWeight` 시그니처.
- `src/agents/topic_scout/commentSignals.ts` (step 1) — `aggregateCommentSignals`가 `weight`를 받는 형태.
- `src/agents/topic_scout/discovery.ts` — `refreshTopicCandidates`의 댓글 조회(`comments_raw` select, `.limit(5000)`)와 `aggregateCommentSignals(comments ?? [])` 호출부.
- `src/agents/topic_scout/prepare.ts` — `comments_raw` 조회 + `aggregateCommentSignals(comments ?? [], { keyword })` 호출부.
- `src/lib/supabase/database.types.ts` — `Contents`, `PerformanceMetrics`, `CommentsRaw` 행 타입.
- `src/pipeline/runState.ts` — `Supa` 타입(service-role 클라이언트).

## 작업

### 1) 공유 async 로더 (중복 방지)

discovery와 prepare 둘 다 videoWeight 맵이 필요하므로, DB에서 맵을 만드는 async 함수를 **한 곳에 정의하고 재사용**한다. `discovery.ts`에 아래를 추가하고 export하라(prepare.ts가 import — 두 파일 다 `topic_scout/`, `prepare→discovery` import는 비순환: discovery는 prepare를 import하지 않는다. 확인하라):

```ts
// contents(upload_date) + performance_metrics(views, window='d1') 조회 → videoId→가중 맵.
//   best-effort: 조회 실패/빈 결과여도 throw 하지 않고 빈 맵 반환(가중 없이 기존 동작으로 강등).
//   now 주입으로 결정적(콜러가 nowIso 전달).
export async function loadVideoWeightMap(supa: Supa, now: Date | string): Promise<Map<string, number>>;
```
- `contents`에서 `id, youtube_video_id, upload_date`(youtube_video_id not null) 조회.
- `performance_metrics`에서 `content_id, views` (`metric_window = 'd1'`) 조회 → `content_id → views` 맵.
- 두 개를 합쳐 `{ youtubeVideoId, views, uploadDate }[]` 만들고 `buildVideoWeightMap(videos, now)` 호출해 반환.

### 2) discovery.ts 결선

`refreshTopicCandidates` 안에서:
- 댓글 조회 select에 `youtube_video_id`를 추가하고 `.order("posted_at", { ascending: false })` 추가(현재 정렬 없는 `.limit(5000)`는 임의 순서 — 최근순으로).
- `const wmap = await loadVideoWeightMap(supa, nowIso);` (이미 있는 `nowIso` 재사용).
- 각 댓글 행을 `{ body, like_count, weight: wmap.get(row.youtube_video_id) ?? 1 }` 로 매핑해 `aggregateCommentSignals`에 전달.

### 3) prepare.ts 결선

동일하게:
- 댓글 select에 `youtube_video_id` 추가 + `.order("posted_at", { ascending: false })`.
- `loadVideoWeightMap(supa, <now>)` 호출. per-run에 `nowIso`가 없으면 `new Date().toISOString()`을 함수 진입부에서 한 번 만들어 넘긴다(런타임 값 — 스크립트 컨텍스트 아님, 앱 서버라 `new Date()` 허용).
- 댓글 행에 `weight` 부여 후 `aggregateCommentSignals(rows, { keyword })` 호출.

**핵심 규칙(반드시 준수):**
- `loadVideoWeightMap`은 **best-effort** — 조회 에러/빈 결과도 throw 금지, 빈 맵 반환. 이유: 발굴/주제분석이 성과 데이터 부재로 죽으면 안 된다(기존 best-effort 철학).
- `metric_window` 필터는 반드시 `'d1'`. 이유: 다른 window는 데이터가 없어 views 전부 null → 인기도 가중이 죽는다.
- `competitorSignalScore`·`gatherExternalSignals`·`pickSpreadYoutube` 등 **유튜브 경쟁영상 랭킹 경로는 건드리지 마라**. 이유: 그건 다른 채널 영상 대상이고 이번 변경(자기 채널 댓글 가중)과 무관.
- 거버넌스 C 유지: 댓글 `body`는 여전히 코드 안에서만 쓰고 LLM에 안 보낸다(집계만). select에 body가 이미 있으니 추가 노출 없음.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

- DB 라이브 실행은 AC가 아니다(하네스는 service-role 라이브 write를 하지 않는다). typecheck + 기존 테스트 불파손 + `buildVideoWeightMap`/`loadVideoWeightMap` 단위 검증으로 충분.
- `loadVideoWeightMap`의 데이터 정형 부분이 순수 헬퍼(`buildVideoWeightMap`)로 빠져 있으므로, 그 순수부는 step 0 테스트가 이미 커버. `loadVideoWeightMap` 자체는 supabase 목킹 없이 typecheck로만 검증(기존 프로젝트에 supabase 목킹 인프라 없음 — 새로 만들지 마라).
- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.

## 검증 절차

1. AC 실행.
2. 회귀 체크: retrospectivist/prepare.ts가 diff에 **없어야** 한다(미수정). discovery.ts·prepare.ts·(테스트)만 잡히는지.
3. 비순환 확인: `prepare.ts`가 `discovery.ts`를 import해도 순환이 안 생기는지(discovery가 prepare를 import하지 않음) typecheck로 검증.
4. `git status`로 범위 외 untracked(fixtures replay 등) 제외.
5. `phases/comment-interest-weighting/index.json`의 step 2를 갱신(성공 → completed + summary / 실패 → error).

## 금지사항

- retrospectivist/prepare.ts 수정 금지(단일 영상 — 가중 무의미, 회귀 위험).
- 유튜브 경쟁영상 랭킹(`competitorSignalScore` 등) 수정 금지.
- supabase 목킹 인프라를 새로 도입하지 마라. 이유: 기존에 없고, 순수부는 step 0에서 이미 테스트됨.
- 마이그레이션 추가 금지(컬럼 전부 존재). 새 의존성 추가 금지.
- 기존 테스트를 깨뜨리지 마라.
