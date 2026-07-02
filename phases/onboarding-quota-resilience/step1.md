# Step 1: onboarder-quota-retryable

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-quota-resilience-design.md`
- `src/agents/onboarder/prepare.ts` — `gatherReferences`(≈72), `prepareOnboarder`(≈138), throw 지점(≈148).
- `src/agents/topic_scout/externalSignals.ts` — **step0에서 추가된** `YouTubeQuotaError`와 `gatherExternalSignals`의 `throwOnYtQuota` 옵션.
- `src/pipeline/onboarding.ts` — `runOnboarding`(≈96에서 `prepareOnboarder` 호출).

step0이 만든 `YouTubeQuotaError`/옵션을 먼저 읽고 이해한 뒤 작업하라.

## 배경

step0으로 429가 `YouTubeQuotaError`로 구분되고 `gatherExternalSignals`가 `throwOnYtQuota:true`면 전파한다. 이 step은 **온보더가 그 신호를 받아 "재시도 가능"과 "영구 블록"을 구분**하게 한다.

## 작업

이 step은 **온보더 레이어**(`prepare.ts` + 필요시 `onboarding.ts`)만 다룬다. UI는 step2.

1. **`OnboardingRetryableError` 신규 클래스** — `export class OnboardingRetryableError extends Error`(prepare.ts 또는 onboarder 인접 모듈). `this.name = "OnboardingRetryableError"`. 메시지 예: `"유튜브 검색 한도 초과 — 잠시 후 다시 시도하세요"`.

2. **`gatherReferences` quota 전파** — `gatherExternalSignals` 호출에 `throwOnYtQuota: true` 추가. catch(≈84)에서:
   - `e instanceof YouTubeQuotaError` → **삼키지 말고 re-throw**(빈 `[]` 폴백 금지 — 그래야 상위가 quota를 안다).
   - 그 외 에러 → **현행 그대로 warn + `[]` 유지**(네트워크 등 일시 실패는 완화단계가 [] 위에서 도니 무해).
   - 완화 재검색 (c)(≈102-125)도 `throwOnYtQuota: true`로 호출하고, 그 try/catch에서 `YouTubeQuotaError`면 전파(그 외는 현행 warn 유지). 단 (c)는 이미 refs를 일부 모았을 수 있으니 **quota여도 이미 `refs.length>0`이면 전파 대신 가진 refs 반환**해도 된다(에이전트 재량 — 핵심은 "0개인데 quota 때문"일 때 신호가 살아있는 것).

3. **`prepareOnboarder` 구분 throw** — `gatherReferences`가 `YouTubeQuotaError`를 던지면(0개 + quota) `OnboardingRetryableError`로 감싸 throw. `items.length === 0`인데 quota가 아니면(진짜 없음) **기존 `throw new Error("레퍼런스 영상을 찾지 못해 온보딩 불가")` 유지**.
   - 구현 힌트: `gatherReferences`를 try로 감싸 `YouTubeQuotaError` catch → `OnboardingRetryableError` throw. 정상 반환인데 `items.length===0`이면 기존 영구 throw.

4. **`runOnboarding`/`onboarding.ts`** — `prepareOnboarder`의 새 에러 타입이 그대로 위로 전파되게 둔다(삼키지 말 것). 별도 처리 불필요하면 무변경.

## 테스트

`tests/onboarderQuotaRetryable.test.ts` 신설:
- `gatherReferences`가 quota 상황(gatherExternalSignals가 `YouTubeQuotaError` throw)에서 `YouTubeQuotaError`를 전파(빈 [] 폴백 안 함).
- `prepareOnboarder`: quota → `OnboardingRetryableError`, 진짜 0개(비-quota, 정상 반환 빈 배열) → 기존 `"...온보딩 불가"` Error(각각 instanceof/message로 구분).
- **주의**: catch-swallow 검사는 impl 스텁+카운터로(rules.md 함정). `gatherExternalSignals`/`getSelectedStagePayload`는 주입 가능하게 스텁.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0).
2. 체크리스트: quota(0개+429)와 진짜-0개가 서로 다른 에러 타입인가? 비-quota 네트워크 실패는 여전히 완화단계로 무해하게 흘러가는가?
3. index.json step1 갱신(completed+summary).

## 금지사항

- 진짜 레퍼런스 0개(비-quota)일 때 A의 영구 블록을 없애지 마라. 이유: A 설계(레퍼런스 필수·topic 폴백 금지) 유지가 이 phase의 불변식. 재시도 에러는 **quota/rate-limit에만**.
- `throwOnYtQuota` 없이 gatherReferences가 quota를 삼키게 두지 마라(원래 버그).
- UI(page.tsx/OnboardingQuiz)·onboardingStage는 이 step에서 건드리지 마라(step2).
- 기존 테스트를 깨뜨리지 마라.
