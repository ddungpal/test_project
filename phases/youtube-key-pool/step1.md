# Step 1: searchyoutube-rotation

## 읽어야 할 파일

- `docs/specs/2026-07-03-youtube-key-pool-design.md`
- `src/agents/topic_scout/youtubeKeys.ts` — **step0에서 만든** `getYouTubeKeys`·`withRotatingYouTubeKey`.
- `src/agents/topic_scout/externalSignals.ts` — `searchYouTube`(≈263): 현재 `const key = process.env.YOUTUBE_API_KEY; if (!key) return [];` → 2패스 allSettled + `fetchVideoStats`/`fetchChannelSubs`(모두 key 인자). `YouTubeQuotaError`(≈255).
- `src/agents/topic_scout/youtubeFixture.ts` — `useFixture` 게이트(≈`Boolean(process.env.YOUTUBE_API_KEY)`).

step0 모듈을 먼저 읽고 이해한 뒤 배선하라.

## 배경

step0이 키 풀 + rotation을 만들었다. 이 step은 `searchYouTube`가 그걸 쓰게 배선한다. **fixture(`searchYouTubeCached`)가 `searchYouTube` 위에 있으므로**, rotation은 캐시 미스(진짜 새 라이브 쿼리)에만 발동한다 — 반복 쿼리는 여전히 fixture로 $0.

## 작업

1. **`searchYouTube` 배선** (externalSignals.ts):
   - 현재 `const key = process.env.YOUTUBE_API_KEY; if (!key) return [];` 를:
     ```ts
     const keys = getYouTubeKeys();
     if (keys.length === 0) return [];   // 기존 "키 없으면 []" 유지
     return withRotatingYouTubeKey(async (key) => {
       // 기존 본문(2패스 allSettled + stats + subs)을 그대로, key만 이 스코프에서 주입
     });
     ```
   - **본문 로직은 바꾸지 마라** — 2패스 실패 시 `firstRej.reason` throw(그게 YouTubeQuotaError면 rotation이 받음), 한 패스 성공 시 진행, stats/subs best-effort 전부 현행 유지. 오직 key 출처와 래핑만 변경.

2. **fixture 게이트 보강** (youtubeFixture.ts·1줄):
   - `const useFixture = Boolean(process.env.YOUTUBE_API_KEY) && fixtures !== "off";` 를
     `const useFixture = getYouTubeKeys().length > 0 && fixtures !== "off";` 로.
   - 이유: 사용자가 `YOUTUBE_API_KEYS`만 채우고 단일을 비워도 fixture가 켜지도록. 단일만 있으면 getYouTubeKeys가 [단일] 반환 → 동작 동일.

## 불변식 (반드시 지켜라)

- **단일 키 하위호환**: `YOUTUBE_API_KEYS` 미설정 + `YOUTUBE_API_KEY` 단일만 있을 때, rotation이 발동 안 하는 정상 경로는 **기존과 동작 동일**(키 1개 풀 → 첫 키로 실행, 429 안 나면 그대로). 회귀 테스트로 잠가라.
- **fixture 우선**: rotation은 `searchYouTube` 내부에만. `searchYouTubeCached`(캐시 히트)는 `searchYouTube`를 안 부르니 키·rotation 무관 — 이 관계 깨지 마라.
- 키 값 로그 노출 금지.

## 테스트

`tests/searchYoutubeRotation.test.ts`(또는 기존 youtube 테스트 확장):
- 키 2개, 첫 키 searchPass가 `YouTubeQuotaError` 2패스 전부 → 둘째 키로 재시도해 성공 결과 반환(라이브 fetch를 주입 스텁으로).
- 단일 키만 있을 때 기존 경로와 동일(rotation 미발동).
- fixture 게이트: `YOUTUBE_API_KEYS`만 있고 단일 없어도 `useFixture`가 켜짐(캐시 히트는 라이브 0회).
- **catch-swallow 함정**: impl+카운터 스텁(rules.md).

`searchPass`/`fetch`가 딥의존이면, `searchYouTube`를 직접 테스트하기 위해 fetch를 교체 가능한 형태로 스텁하거나(전역 fetch 스텁), rotation 검증은 step0의 `withRotatingYouTubeKey` 단위 테스트로 이미 커버됨을 근거로 배선 회귀(단일키 동일·fixture 게이트)에 집중해도 된다(에이전트 재량·과도한 mocking 지양).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0).
2. 체크리스트: 단일 키 경로 바이트 동일(회귀)? fixture가 rotation 위에 유지(캐시 히트 시 키 안 씀)? 429에만 rotation?
3. `phases/youtube-key-pool/index.json` step1 갱신(completed+summary) + phase 전체 completed.

## 금지사항

- `searchYouTube` 본문 로직(2패스·stats·subs·롱폼 필터)을 바꾸지 마라. 이유: 결과가 달라지면 사용자가 검증하는 "실데이터"가 흔들린다 — 이 step은 key 출처·rotation 래핑만.
- rotation을 fixture 위(캐시 히트 경로)에 넣지 마라. 이유: 캐시 히트는 quota를 안 쓰는데 거기서 키를 소진 판정하면 무의미.
- 비-quota 에러에 rotation 걸지 마라(step0 계약 유지).
- 기존 테스트를 깨뜨리지 마라.
