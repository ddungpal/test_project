# Step 1: channel-learn-button

`/copy-learn`에 **"채널 제목 학습" 버튼**을 추가한다. 클릭 한 번으로 김짠부 채널(@zzanboo 고정) 최근 50개 제목을 가져와 학습해서 **제목 스타일 draft**를 만든다. 활성화는 기존처럼 별도(사람 게이트). step0의 서버 호출 가능한 코어를 소비한다.

## 읽어야 할 파일

- `src/performance/titleStyleLearn.ts`(step0) — `extractTitleStylePatterns`·`saveTitleStyleDraft`. **이걸 호출**하고 학습 로직을 새로 짜지 마라.
- `src/ingest/channelTitles.ts`(step0) — `fetchChannelTitles(channelInput, apiKey)`.
- `src/app/actions/copyLearn.ts` — **`requestCopyRelearn`를 그대로 미러링**한다(동기 await·requireOwner·createAdminClient·auditLog best-effort·`// ponytail` 동기실행 주석). 여기에 새 액션을 추가한다.
- `src/components/CopyLearningForm.tsx` — **기존 "재학습 실행" 버튼 UX를 복제**(useTransition·진행표시·끝나면 `router.refresh`·owner 전용·결과 메시지). 여기에 "채널 제목 학습" 버튼을 추가한다. "최신 초안 활성화"(제목) 버튼은 이미 있으니 그대로 — 새 draft가 그 버튼으로 활성화된다.

## 작업

### 1) 서버 액션 — `src/app/actions/copyLearn.ts`에 추가
```ts
// 채널 제목 학습(사람 게이트). requireOwner 후 채널 fetch→학습→title draft 까지(activate 는 별도).
//   @zzanboo 고정. 파일 안 거침(서버리스 호환). requestCopyRelearn 동기 await 패턴 미러.
export async function requestChannelTitleRelearn(): Promise<{
  created: boolean;
  version: number | null;
  titlesCount: number;
}>;
```
- 채널 핸들 **상수 `"@zzanboo"` 고정**(입력 인자 없음). `process.env.YOUTUBE_API_KEY` 사용(미설정 시 명확한 에러).
- 흐름: `requireOwner()` → `fetchChannelTitles("@zzanboo", apiKey)` → `extractTitleStylePatterns(titles, loadConfig())` → (null 아니면) `saveTitleStyleDraft(supa, patterns)` → `auditLog`(best-effort, action 예: `channel_title_relearn_requested`) → 반환.
- 제목 0개거나 추출 null이면 `created:false`(과금/INSERT 0). draft만 만들고 **활성화 안 함**.
- `// ponytail` 주석으로 "동기 await — dev($0·수십초) 적합. 운영서 LLM 길어 타임아웃이면 Inngest 비동기+폴링으로 이전" (requestCopyRelearn과 동일 문구 결).

### 2) UI — `src/components/CopyLearningForm.tsx`
- "재학습 실행"(또는 스타일 학습) 영역에 **"채널 제목 학습"** 버튼 추가. 기존 재학습 버튼과 같은 useTransition/pending 패턴:
  - 클릭 → `requestChannelTitleRelearn()` 동기 await → pending 동안 **"채널 제목 학습 중…"** 표시(스피너·중복클릭 방지).
  - 완료 시 `router.refresh()` → 제목 칸에 새 draft 떠서 "최신 초안 활성화" 가능.
  - 결과 메시지: `created`면 "제목 v{version} 초안 생성 ({titlesCount}개 학습)", 아니면 "변경 없음".
  - owner 전용(기존 폼이 owner 게이트면 그 안에 둠).
- **TRUS 3색**(Black/Yellow/White)·기존 버튼 스타일 일관. 새 색·그림자·그라데이션 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 클릭(YouTube fetch+LLM)은 사람이 dev에서 검증 — 버튼 클릭 → 제목 draft 생성 → 활성화. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 버튼이 step0 코어(`fetchChannelTitles`·`extractTitleStylePatterns`·`saveTitleStyleDraft`)를 호출하는가(로직 재구현 아님).
   - 파일을 일절 안 거치는가(서버리스 호환).
   - 채널이 `"@zzanboo"` 고정인가(입력칸 없음).
   - draft만 만들고 활성화는 안 하는가(기존 "최신 초안 활성화"로 사람이).
   - `requestCopyRelearn` 동기 await 패턴·`// ponytail` 운영 caveat 주석을 따랐는가.
   - UI가 기존 재학습 버튼 UX(진행표시·router.refresh·owner)와 TRUS 3색을 따르는가.
3. `phases/channel-title-learn-button/index.json`의 step 1 갱신(completed+summary / error / blocked). **index.json은 반드시 유효한 JSON으로 저장하라.**

## 금지사항

- 학습/추출/fetch 로직을 새로 구현하지 마라. 이유: step0 코어가 단일 출처 — 호출만.
- 버튼 경로에서 파일을 읽거나 쓰지 마라. 이유: 서버리스 FS 비호환(메모리로).
- 자동 활성화 금지(draft만). 이유: 사람 게이트 — 활성화는 기존 "최신 초안 활성화" 버튼.
- 채널 핸들을 입력칸/인자로 받지 마라. 이유: 사용자 결정=@zzanboo 고정.
- 새 색·그림자·그라데이션·다른 폰트 금지. 이유: TRUS Create 3색·격동고딕2 디자인 시스템.
- 백엔드 학습 정합성(version 스코프·draft·provenance 없음)을 step0와 다르게 바꾸지 마라.
- 기존 테스트를 깨뜨리지 마라.
