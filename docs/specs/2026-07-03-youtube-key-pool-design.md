# YouTube 키 풀 + 429 자동 rotation (youtube-key-pool)

_2026-07-03 · quota 헤드룸 확장. 사용자 결정: 실데이터 매번 필요 → mock 제외, 실데이터 보존하며 천장 올리기._

## 문제

YouTube `search.list`는 호출당 100 units, 우리는 2패스(relevance+viewCount)=200 units/`searchYouTube`. 촉이(~600)+훅이(200~400)+쏙이(~400)로 **풀 런 ≈1,400 units → 하루 10k에 ~7런이면 소진**. "조금만 테스트해도 초과"의 원인.

## 이미 된 것 (재작업 금지)

**fixture 전 경로 커버는 #2(`onboarding-quota-resilience` step3)에서 완료됨.** `gatherExternalSignals`가 `searchYouTubeCached`(fixture 래퍼)를 호출하므로 촉이·훅이·쏙이 **모두** record/replay를 탄다. → **같은 쿼리 재사용은 이미 $0**(첫 호출만 quota·이후 실데이터 replay). 이 phase는 **fixture를 건드리지 않는다.**

## 결정 (사용자 승인)

- **키 풀 + 429 자동 rotation만** 신규 구현. 키 N개 = 하루 N×10,000. 현재 3개=30k.
- 실데이터 100% 보존(mock 아님). rotation은 fixture **아래**에서 동작 → 진짜 새 라이브 쿼리에만 발동.
- **증액 신청(Google audit 폼)은 후속 과제**(코드 무관·사용자가 별도 진행). 본 phase 범위 아님.

## 불변식

- **단일 키 하위호환**: `YOUTUBE_API_KEYS` 미설정이면 기존 `YOUTUBE_API_KEY` 단일로 폴백 → **기존 동작 바이트 동일**.
- **fixture 우선**: rotation은 `searchYouTube`(캐시 미스 라이브) 내부에만. 캐시 히트는 키 자체를 안 씀.
- **비-quota 에러는 rotation 안 함**: `YouTubeQuotaError`(429)에만 다음 키로. 그 외 에러는 즉시 전파(무한 rotation·오진 방지).
- **read-only·멱등**: search.list는 읽기 전용 → 키 바꿔 재시도 안전.
- **보안**: 키는 `.env`에만(gitignore). 로그·에러 메시지·fixture에 **키 값 노출 금지**.
- **⚠️ ToS**: 멀티 프로젝트 quota는 YouTube 개발자 정책 회색지대 — **dev 헤드룸용**(프로덕션 주력 아님). 코드 주석에 명시.
- 마이그 0 · 의존성 0.

## 설계

### 신규 모듈 `src/agents/topic_scout/youtubeKeys.ts`

```ts
// 키 파싱: YOUTUBE_API_KEYS(쉼표) 우선 → 없으면 [YOUTUBE_API_KEY] → 없으면 []. trim·빈값 제거·dedup.
export function getYouTubeKeys(): string[];

// 소진 키(429 본 키)를 이 프로세스 동안 스킵. 인메모리·세션 스코프(재기동/PT자정 리셋).
//   각 키로 fn 시도 → YouTubeQuotaError면 그 키 소진 마킹+다음 키 → 성공 반환.
//   전부 소진/실패면 마지막 YouTubeQuotaError throw. 비-quota 에러는 즉시 throw(rotation 안 함).
export async function withRotatingYouTubeKey<T>(fn: (key: string) => Promise<T>): Promise<T>;
```

- 소진 상태: 모듈 레벨 `Set<string>`(키 문자열). 테스트 격리 위해 `__resetForTest()` 같은 훅 하나 두어도 됨(에이전트 재량).
- 키 0개면 `withRotatingYouTubeKey`는 호출 전에 콜러가 판단(아래 searchYouTube가 `[]` 반환) — 또는 빈 풀이면 즉시 특정 신호. 콜러 계약은 "키 있으면 실행, 없으면 현행처럼 []".

### `searchYouTube`(externalSignals.ts) 배선

현재: `const key = process.env.YOUTUBE_API_KEY; if (!key) return []; ...2패스+stats+subs...`
변경:
```ts
const keys = getYouTubeKeys();
if (keys.length === 0) return [];              // 기존 "키 없으면 []" 유지
return withRotatingYouTubeKey(async (key) => {
  // 기존 본문 그대로(2패스 allSettled + stats + subs) — key만 주입
});
```
- 2패스 전부 실패 시 `firstRej.reason` throw 로직 유지 → 그게 `YouTubeQuotaError`면 `withRotatingYouTubeKey`가 잡아 다음 키로. 한 패스만 성공하면 현행처럼 진행(rotation 안 함).
- `fetchVideoStats`/`fetchChannelSubs`(1 unit·best-effort)는 같은 `key` 사용 — 실패해도 nulls 반환(현행) → rotation 불필요.

### fixture 게이트 보강 (youtubeFixture.ts·1줄)

현재 `useFixture = Boolean(process.env.YOUTUBE_API_KEY) && ...`. 풀만 설정하고 단일을 비우는 경우 대비:
```ts
const useFixture = getYouTubeKeys().length > 0 && fixtures !== "off";
```
(단일 키만 있어도 동일 동작 유지 — getYouTubeKeys가 [단일] 반환.)

### env (이미 준비됨)

`.env`·`.env.example`에 `YOUTUBE_API_KEYS` 추가 완료(이번 대화). 코드가 이걸 읽기만 하면 됨.

## Step 분해

- **step0 `youtube-key-manager`**: 순수 `youtubeKeys.ts`(getYouTubeKeys·withRotatingYouTubeKey·소진 상태) + `tests/youtubeKeys.test.ts`(파싱·폴백·dedup·rotation 전진·성공정지·전부소진 throw·비-quota 즉시 throw). 배선 없음.
- **step1 `searchyoutube-rotation`**: `searchYouTube`를 `withRotatingYouTubeKey`로 감싸기 + `youtubeFixture.ts` 게이트를 `getYouTubeKeys().length`로 보강 + 테스트(단일키 바이트동일·429 rotation·fixture 위 우선). 

## AC (매 step)

```bash
npm run typecheck && npm test && npm run build
```

## 테스트 (catch-swallow 함정 주의 — rules.md: vi.fn 아닌 impl+카운터)

- getYouTubeKeys: 풀 파싱·단일 폴백·빈값/공백/dedup.
- withRotatingYouTubeKey: 키1 429→키2 성공, 전부 429→throw(YouTubeQuotaError), 비-quota 에러 즉시 throw(rotation 0회), 소진 마킹 세션 유지.
- searchYouTube: 단일 키 경로 회귀(rotation 미발동시 기존과 동일), 429시 다음 키로.

## 후속 (범위 밖·기록만)

- **Google quota 증액 audit 폼** — 무료·수 주·공개클라이언트 전제라 내부도구엔 불확실. 코드 무관·사용자 별도 진행.
- 소진 마킹 파일 영속화(현재 인메모리로 충분·YAGNI).
