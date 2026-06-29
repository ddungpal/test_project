# Step 0: channel-learn-core

채널 제목 학습(현재 CLI 전용)의 핵심 로직을 **서버에서 호출 가능한 모듈**로 분리한다. step1의 `/copy-learn` 버튼(서버 액션)이 이 함수들을 호출한다. **파일(`corpus/titles/channel-recent.json`)을 거치지 않는** 메모리 경로를 만드는 게 목적 — Vercel 서버리스는 파일 쓰기가 안 되기 때문.

## 배경 (왜 이게 필요한가)

현재 두 CLI 스크립트는 **파일을 중간 다리**로 쓴다: `ingest-channel-titles.ts`가 채널 제목을 `corpus/titles/channel-recent.json`에 쓰고 → `extract-title-style.ts`가 그 파일을 읽어 학습한다. 서버 액션은 (a) CLI 스크립트를 실행할 수 없고 (b) 서버리스에서 파일 쓰기가 안 되므로, **핵심 로직(채널 fetch · 학습)을 순수/서버 호출 가능한 함수로 빼내** 메모리로 바로 흘려야 한다.

## 읽어야 할 파일

- `scripts/ingest-channel-titles.ts` — `main()` 안의 **네트워크 로직**(channels.list→uploads playlist→playlistItems 50→parseRecentTitles)을 빼낼 대상. `YT_API` 상수·`YOUTUBE_API_KEY`·`URLSearchParams` 사용법.
- `src/ingest/channelTitles.ts` — 순수 파서(`parseUploadsPlaylistId`·`parseRecentTitles`·`resolveChannelQuery`·`ChannelTitle`). 여기에 fetch 함수를 추가한다.
- `scripts/extract-title-style.ts` — `main()` 안의 **학습 로직**(`buildTitleStyleInput`→`callLLM`(roleId:`title_extractor`·`TITLE_STYLE_SYSTEM`·`STYLE_EXTRACTION_SCHEMA`)→`normalizePatterns(foldStrayPatternFields(out.data))`→`style_profiles(title)` draft insert, version=title 스코프 max+1)을 빼낼 대상. `buildTitleStyleInput`은 이미 export됨. import 출처(TITLE_STYLE_SYSTEM·STYLE_EXTRACTION_SCHEMA·normalizePatterns·foldStrayPatternFields)를 확인해 그대로 재사용.
- `src/app/actions/copyLearn.ts` `requestCopyRelearn` — step1이 미러링할 동기 await 패턴(참고용, 이 step에선 안 건드림).
- `src/pipeline/runState.ts`(`Supa` 타입) · `src/llm/config.ts`(`LlmConfig`).

## 작업

### 1) 채널 fetch — `src/ingest/channelTitles.ts`에 추가
```ts
// 채널 핸들/URL → 최근 50개 제목(네트워크). 파일 쓰기 없음. statistics(조회수) 안 부름.
export async function fetchChannelTitles(channelInput: string, apiKey: string): Promise<ChannelTitle[]>;
//   resolveChannelQuery → channels.list(part=contentDetails) → parseUploadsPlaylistId
//   → playlistItems.list(part=snippet, maxResults=50) → parseRecentTitles → slice(0,50).
//   YT_API 상수는 여기로 옮기거나 공유(ingest-youtube/ingest-channel-titles와 단일 출처 유지).
```

### 2) 학습 코어 — 신규 `src/performance/titleStyleLearn.ts`
파일 I/O 없이 순수하게 LLM 추출 + DB 저장을 분리한다(버튼은 둘 다, CLI dry-run은 추출만 필요).
```ts
import type { Supa } from "../pipeline/runState.js";
import type { LlmConfig } from "../llm/config.js";
import type { ChannelTitle } from "../ingest/channelTitles.js";

// 제목들 → LLM 1회로 제목 스타일 patterns 추출(DB 미접근). buildTitleStyleInput·TITLE_STYLE_SYSTEM·
//   STYLE_EXTRACTION_SCHEMA·normalizePatterns·foldStrayPatternFields 재사용(재구현 금지).
export async function extractTitleStylePatterns(
  titles: ChannelTitle[],
  config: LlmConfig,
): Promise<{ patterns: unknown; evidence_summary: string } | null>; // 유효 제목 0이면 null

// patterns → style_profiles(component_type='title', version=title스코프 max+1, status='draft') INSERT.
//   ★ version 은 반드시 component_type='title' 필터로 조회(다른 타입과 섞지 마라). 활성화 안 함(draft).
export async function saveTitleStyleDraft(
  supa: Supa,
  patterns: unknown,
): Promise<{ id: string; version: number }>;
```

### 3) CLI 두 스크립트를 공유 함수로 리팩터 (로직 중복 금지·단일 출처)
- `ingest-channel-titles.ts`: `main()`의 fetch 블록을 `fetchChannelTitles` 호출로 교체. 파일 쓰기·dry-run은 CLI에 유지.
- `extract-title-style.ts`: `main()`의 callLLM+정규화를 `extractTitleStylePatterns`로, commit 분기의 insert를 `saveTitleStyleDraft`로 교체. 검수 산출물 파일 쓰기·dry-run은 CLI에 유지.
- **CLI 동작(출력·dry-run/--commit·파일 산출물)은 그대로**여야 한다 — 코어만 공유 함수로 위임.

### 4) 테스트
- `fetchChannelTitles`: 파서는 step 이전 테스트가 커버. fetch 자체는 네트워크라 AC에서 호출 안 함(파서 경계만 유지).
- `titleStyleLearn`: `extractTitleStylePatterns`를 fixtures 리플레이로(기존 extract-title-style 테스트 패턴 미러). `saveTitleStyleDraft`는 version=max+1·draft·component_type 스코프 계약을 최소 검증(가능하면 순수 분리).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 YouTube fetch·callLLM·DB INSERT는 AC에서 호출하지 않는다. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - `fetchChannelTitles`·`extractTitleStylePatterns`·`saveTitleStyleDraft`가 **파일 I/O 없이** 동작하는가(서버리스 호환).
   - CLI 두 스크립트가 공유 함수를 쓰도록 리팩터됐고 **기존 CLI 동작(dry-run/--commit·파일 산출물·출력)이 보존**되는가.
   - `saveTitleStyleDraft`가 version을 `component_type='title'` 스코프 max+1로 잡고 `status='draft'`인가(활성화 안 함, 타입 안 섞임).
   - TITLE_STYLE_SYSTEM·스키마·normalize·fold를 **재사용**했는가(새로 발명 아님).
   - 서버액션·UI(copyLearn.ts·CopyLearningForm.tsx)는 아직 안 건드렸는가(step1 몫).
3. `phases/channel-title-learn-button/index.json`의 step 0 갱신(completed+summary / error / blocked). **index.json은 반드시 유효한 JSON으로 저장하라.**

## 금지사항

- 버튼 경로(서버 호출용 함수)에서 파일 읽기/쓰기를 쓰지 마라. 이유: Vercel 서버리스는 FS 쓰기가 안 됨 — 메모리로 흘려야 한다.
- CLI 스크립트의 기존 동작(dry-run/--commit·파일 산출물·콘솔 출력)을 바꾸지 마라. 이유: CLI는 여전히 단독으로 쓰인다 — 코어만 공유로 위임.
- `style_profiles` version을 `component_type='title'` 필터 없이 조회하지 마라. 이유: thumbnail_copy/structure 버전과 섞여 잘못된 max+1이 나온다.
- 자동 활성화(`status='active'`) 금지 — draft만. 이유: 사람 게이트.
- `requestCopyRelearn`·`CopyLearningForm.tsx`를 수정하지 마라. 이유: step1 몫.
- 기존 테스트를 깨뜨리지 마라.
