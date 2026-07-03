# Step 0: youtube-key-manager

## 읽어야 할 파일

- `docs/specs/2026-07-03-youtube-key-pool-design.md` (설계 전문)
- `src/agents/topic_scout/externalSignals.ts` — `YouTubeQuotaError`(≈9·255) 정의, `searchYouTube`(≈263)가 현재 `process.env.YOUTUBE_API_KEY`를 읽는 방식(≈264).
- `src/agents/topic_scout/youtubeFixture.ts` — fixture 게이트가 `YOUTUBE_API_KEY`를 보는 방식(참고).
- `.env.example` — `YOUTUBE_API_KEYS` 형식(이미 추가됨).
- 프로젝트 `.claude/rules/rules.md` — 특히 vitest catch-swallow 함정 규칙.

## 배경

YouTube `search.list`는 100 units/call·하루 10k라 조금만 테스트해도 소진. 계정/프로젝트별 키를 여러 개 두고 **429(`YouTubeQuotaError`) 시 다음 키로 자동 rotation**하면 하루 N×10k. 이 step은 **순수 키 매니저 모듈만** 만든다(배선은 step1).

## 작업

**신규 파일 `src/agents/topic_scout/youtubeKeys.ts`** 하나만. 외부 I/O 없음(env 읽기만).

```ts
/** 키 파싱: YOUTUBE_API_KEYS(쉼표 구분) 우선 → 없으면 [YOUTUBE_API_KEY] → 둘 다 없으면 [].
 *  각 키 trim, 빈 문자열 제거, 순서 유지 dedup. */
export function getYouTubeKeys(): string[];

/** 소진 안 된 키로 fn을 시도. YouTubeQuotaError(429)면 그 키를 이 프로세스 동안 '소진'으로
 *  마킹하고 다음 키로. 성공하면 그 값 반환. 남은 키가 없으면 마지막 YouTubeQuotaError를 throw.
 *  비-quota 에러는 rotation 없이 즉시 throw. 키 풀이 비면 즉시 YouTubeQuotaError 또는 콜러 계약대로. */
export async function withRotatingYouTubeKey<T>(fn: (key: string) => Promise<T>): Promise<T>;
```

핵심 규칙:
- **소진 마킹**은 모듈 레벨 `Set<string>`(키 문자열 자체). **인메모리·세션 스코프**(재기동/PT자정에 자연 리셋 — 파일 영속화 금지·YAGNI).
- **비-quota 에러는 절대 rotation하지 마라** — `e instanceof YouTubeQuotaError`일 때만 다음 키로. 그 외는 즉시 rethrow(무한 rotation·에러 오진 방지).
- `getYouTubeKeys`가 폴백까지 처리 → 단일 `YOUTUBE_API_KEY`만 설정된 기존 환경은 `[단일키]` 반환(하위호환).
- **키 값을 로그·에러 메시지에 절대 찍지 마라**(보안). rotation 로그가 필요하면 인덱스/개수만.
- 테스트 격리를 위해 소진 상태를 초기화하는 내부 훅(예 `__resetExhaustedForTest()`)을 하나 export해도 된다(에이전트 재량).

`YouTubeQuotaError`는 `externalSignals.ts`에서 import(순환참조 주의 — youtubeKeys가 externalSignals를 import해도 searchYouTube를 안 부르면 순환 아님. 필요하면 에러 타입을 별도 파일로 분리해도 되나 YAGNI 우선·import만으로 되면 그대로).

## 테스트

`tests/youtubeKeys.test.ts` 신설:
- `getYouTubeKeys`: `YOUTUBE_API_KEYS="a,b,c"` → [a,b,c]; 공백/빈값(`"a, ,b,"`)→[a,b]; 중복(`"a,a,b"`)→[a,b]; 풀 미설정+단일만→[단일]; 둘 다 없으면 []. (env는 테스트 내에서 set/restore.)
- `withRotatingYouTubeKey`: 키1이 `YouTubeQuotaError`→키2 성공이면 키2 값 반환(fn 2회 호출); 전부 429면 `YouTubeQuotaError` throw; **비-quota Error면 fn 1회만 호출하고 즉시 throw**(rotation 0); 소진 마킹이 같은 세션 다음 호출에서 그 키를 건너뛰는지.
- **catch-swallow 함정**: rejected promise 삼킴/재시도 검증은 `vi.fn` 대신 교체 가능한 impl 함수 + 호출 카운터로 스텁(rules.md — vitest가 vi.fn의 rejected promise를 unhandled로 승격해 정상 코드도 실패시킴).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0).
2. 체크리스트: 비-quota 에러에 rotation 안 하는가? 단일 키 폴백이 기존과 동일한가? 키 값이 로그에 안 새는가?
3. `phases/youtube-key-pool/index.json`의 step0을 `completed`+`summary`로 갱신.

## 금지사항

- `searchYouTube`나 `externalSignals.ts`를 이 step에서 배선하지 마라(step1 범위). 이 step은 순수 모듈+테스트만.
- 소진 상태를 파일/DB로 영속화하지 마라. 이유: 인메모리로 충분(dev 재기동 잦음·quota는 PT자정 리셋) — 영속화는 stale 소진 마킹으로 멀쩡한 키를 죽인다.
- 키 문자열을 로그·에러·fixture에 노출하지 마라(보안).
- 기존 테스트를 깨뜨리지 마라.
