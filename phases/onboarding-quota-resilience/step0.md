# Step 0: youtube-quota-error

## 읽어야 할 파일

먼저 아래를 읽고 설계 의도를 파악하라:

- `docs/specs/2026-07-03-onboarding-quota-resilience-design.md` (이 phase의 설계 전문·근본원인)
- `src/agents/topic_scout/externalSignals.ts` — 특히 `searchPass`(≈237), `searchYouTube`(≈248), `gatherExternalSignals`(≈307). yt catch가 429를 삼키는 지점(≈354).
- `src/search/search.ts` (참고: 유사 어댑터 패턴)

## 배경 (근본원인)

YouTube Data API 일일 quota 소진 시 `searchPass`가 `429 Quota exceeded`로 throw → `searchYouTube` 2패스 전부 실패 → `gatherExternalSignals`의 yt catch(≈354)가 **조용히 삼켜 0건 반환**. 콜러(온보더)가 "레퍼런스 없음"과 "API 한도 초과"를 구분 못 함. 이 step은 **429를 타입으로 구분하고, 온보더 경로에서만 전파**되게 한다.

## 작업

이 step은 **`src/agents/topic_scout/externalSignals.ts` 한 파일 레이어만** 다룬다(온보더·UI는 다음 step).

1. **`YouTubeQuotaError` 신규 클래스** — `export class YouTubeQuotaError extends Error`. 이 파일 상단(또는 인접)에서 export. constructor에서 `this.name = "YouTubeQuotaError"`.

2. **`searchPass` 429 감지** — 현재:
   ```ts
   if (!res.ok) throw new Error(`youtube search.list(${order}) ${res.status}: ${(await res.text()).slice(0, 200)}`);
   ```
   `res.status === 429`이면 `YouTubeQuotaError`를 throw하도록 분기(그 외 상태는 기존 generic Error 유지). 메시지는 기존 형식 유지 가능.

3. **`gatherExternalSignals` 신규 옵션** — opts에 `throwOnYtQuota?: boolean | undefined` 추가(기본 미지정=false). yt catch(≈354)에서:
   - `e instanceof YouTubeQuotaError && opts.throwOnYtQuota === true` → **re-throw**(삼키지 말 것).
   - 그 외(옵션 false거나 non-quota 에러) → **현행 그대로 warn + 삼킴**.
   - **불변식**: `throwOnYtQuota`를 안 넘기면 촉이(topic_scout) 등 기존 호출은 **동작 바이트 동일**이어야 한다. 웹검색 catch(≈330)는 건드리지 마라.

4. **`searchYouTube` 전파 확인** — 2패스 전부 reject일 때 `firstRej.reason`을 throw하는 현행 로직(≈264-266)이 `YouTubeQuotaError`를 그대로 전파하는지 확인(한 패스만 quota여도 나머지 성공 시 진행하는 현행 정책 유지). 필요한 최소 변경만.

## 테스트

`tests/youtubeQuotaError.test.ts` 신설(vitest). `gatherExternalSignals`/`searchPass`를 직접 테스트하기 어려우면(fetch 의존) 순수 판정 위주로:
- `YouTubeQuotaError`가 `Error`의 인스턴스이고 `name`이 맞다.
- `gatherExternalSignals`의 throwOnYtQuota 분기: `searchYouTube`를 스텁 주입 가능하게 만들거나(딥의존이면 최소 리팩터), 최소한 옵션 타입/기본값 회귀 가드.
- **주의**: fetch를 스텁할 때 rejected promise 삼킴 검사는 `vi.fn` 대신 교체 가능한 impl 함수 + 카운터로(프로젝트 rules.md: vitest catch-swallow 함정).

기존 `gatherExternalSignals`를 쓰는 테스트가 있으면 촉이 경로 회귀(옵션 없이 호출 시 삼킴 유지)를 반드시 커버.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트: `throwOnYtQuota` 미지정 시 촉이 경로 바이트 동일(웹 catch·기존 삼킴 무변경)인가? 429만 `YouTubeQuotaError`이고 다른 상태는 generic인가?
3. `phases/onboarding-quota-resilience/index.json`의 step0을 `completed`+`summary`로 갱신.

## 금지사항

- 웹검색 catch(≈330)나 촉이 동작을 바꾸지 마라. 이유: 촉이는 429 삼킴이 정상(웹 신호로 충분) — 여기서 바꾸면 주제 발굴이 quota에 하드의존하게 된다.
- `throwOnYtQuota` 기본값을 true로 두지 마라. 이유: 모든 기존 호출(촉이)의 promptHash/동작이 바뀐다.
- 온보더(prepare.ts)나 UI를 이 step에서 건드리지 마라(step1·2 범위).
- 기존 테스트를 깨뜨리지 마라.
