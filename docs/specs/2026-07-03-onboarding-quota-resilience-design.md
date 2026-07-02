# 쏙이 온보딩 — YouTube quota 회복탄력성 (onboarding-quota-resilience)

_2026-07-03 · 근본원인 디버깅에서 도출._

## 문제 (라이브 발견)

쏙이가 문제(아크)를 만들 때 `Error: 레퍼런스 영상을 찾지 못해 온보딩 불가`(`prepare.ts:148`)로 실패.
근본원인 = **YouTube Data API 일일 quota 소진** → `searchPass`가 `429 Quota exceeded` → 모든 검색 실패 → 레퍼런스 0개
→ Phase A(`onboarding-references`)의 하드블록(`throw`, topic 폴백 금지)이 발동.

**실질 결함**: `gatherExternalSignals`가 429(일시적 인프라 실패)를 조용히 삼켜 **0건으로 반환**한다 →
콜러가 *"검색은 됐는데 영상이 없다"* 와 *"API 한도 초과"* 를 구분 못 해, 둘 다 영구 블록으로 처리.
일시적 rate-limit을 콘텐츠 판정("레퍼런스 없음")으로 오인하는 게 버그.

## 결정 (사용자: #1+#2 조합)

- **#1 — 구분**: 429/rate-limit을 **재시도 가능**으로 표면화(영구 "온보딩 불가"와 분리). A 설계 유지(레퍼런스는 여전히 필수).
- **#2 — dev fixture**: `search.ts`(Tavily) 패턴을 미러해 YouTube 검색을 dev에서 record/replay($0·quota 무소모).

## 불변식

- **촉이(topic_scout) 무영향**: `gatherExternalSignals`의 429 삼킴은 촉이에겐 정상(웹 신호로 충분). 신규 옵션 `throwOnYtQuota`
  **기본 false → 촉이 호출은 바이트 동일**. 온보더만 `true`로 quota 신호를 받는다.
- **A 하드블록 유지**: 레퍼런스가 *진짜로* 0개면(429 아님) 여전히 영구 블록. 재시도 에러는 quota/네트워크 실패에만.
- **fixture 게이팅**: `search.ts` 미러 — `YOUTUBE_API_KEY` 있고 `YOUTUBE_FIXTURES!==off`일 때만 캐시. 키 없으면 현행대로 `[]`.
- 마이그 0 · 의존성 0.

## 설계

### #1 — quota 에러 구분 (step0·step1·step2)

- 신규 `class YouTubeQuotaError extends Error` (externalSignals.ts 또는 인접 모듈 export).
- `searchPass`: `res.status === 429`면 `YouTubeQuotaError` throw(그 외 상태는 기존 generic Error 유지).
- `searchYouTube`: 2패스 전부 reject일 때 firstRej가 `YouTubeQuotaError`면 그대로 전파(현행 로직이 firstRej.reason throw라 자연 전파).
- `gatherExternalSignals(opts)`: 신규 opt `throwOnYtQuota?: boolean`(기본 false). yt catch에서 `e instanceof YouTubeQuotaError && opts.throwOnYtQuota`면 **re-throw**(그 외는 현행대로 warn+삼킴).
- `gatherReferences`(prepare.ts): `throwOnYtQuota: true`로 호출. catch(line 84)에서 `YouTubeQuotaError`면 **삼키지 말고 re-throw**(빈 []로 폴백 금지). 완화 재검색(c)도 동일하게 quota면 전파.
- `prepareOnboarder`: quota 에러가 올라오면 신규 `class OnboardingRetryableError extends Error`("유튜브 검색 한도 초과 — 잠시 후 다시 시도")를 throw. 진짜 0개(비-quota)는 기존 "레퍼런스 영상을 찾지 못해 온보딩 불가" 유지.
- `onboardingStage.ts`/UI: `OnboardingRetryableError`(또는 그 message 마커)를 **재시도 안내**로 표면화(영구 블록과 카피 구분). UI는 "다시 시도" 힌트.

### #2 — YouTube fixture 레이어 (step3)

`src/search/search.ts`를 미러:
- 신규 얇은 래퍼(예 `src/agents/topic_scout/youtubeFixture.ts` 또는 externalSignals 내부): `searchYouTube(query, max)` 결과(`Omit<ExternalItem,"id">[]`)를 캐시.
- env `YOUTUBE_FIXTURES=record(기본)|replay|off`.
- `fixtures/youtube/<hash>.json` (`hash = sha256({q,max}).slice(0,16)`).
- record: 캐시 있으면 반환, 없으면 라이브+원자적 저장(temp+rename). replay: 캐시만(미스면 throw). off: 항상 라이브.
- 게이팅: `YOUTUBE_API_KEY` 있고 `YOUTUBE_FIXTURES!==off`일 때만. (TTL은 필요시 search.ts 미러, 아니면 단순 존재 기반.)
- `.env.example`에 `YOUTUBE_FIXTURES` 추가.

## AC (매 step)

```bash
npm run typecheck && npm test && npm run build
```

## 테스트

- step0: `searchPass` 429→`YouTubeQuotaError`, `gatherExternalSignals` throwOnYtQuota=true 전파·false 삼킴(촉이 회귀 가드).
- step1: `gatherReferences` quota 전파, `prepareOnboarder` retryable vs 영구 구분.
- step3: fixture record 저장·replay 읽기·replay 미스 throw·off 라이브.
