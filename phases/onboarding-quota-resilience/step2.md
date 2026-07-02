# Step 2: onboarding-retry-ui (UI)

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-quota-resilience-design.md`
- `src/agents/onboarder/prepare.ts` — **step1의** `OnboardingRetryableError`.
- `src/inngest/functions/onboardingStage.ts` — `onboardingStageFn`(생성/추가 분기·`captureStageFailure("onboarding")`).
- `src/inngest/functions/onFailure.js`(captureStageFailure) + `src/lib/observability/captureError.*` — 실패가 지금 어디로 가는지(errors.jsonl·클라 미관측).
- `src/components/RequestOnboardingButton.tsx` — 초기 아크 트리거·폴링·180s 타임아웃("오래 걸립니다"). **여기가 quota 실패가 표면화돼야 할 곳**.
- `src/app/runs/[id]/page.tsx` — 온보딩 섹션 로드(`loadOnboardingArc`/`loadOnboardingReferences`/`loadOnboardingGold` 근처). 아크 없을 때 RequestOnboardingButton 렌더 지점.
- `src/pipeline/onboarding.ts` — 아크/실패 저장 위치(stage_proposals stage='onboarding').

step1의 에러 타입을 이해한 뒤 작업하라.

## 배경 (현재의 불투명함)

초기 아크 생성이 quota로 실패하면 `OnboardingRetryableError` → inngest retries(2) 소진 → `captureStageFailure`가 `errors.jsonl`에만 기록. 클라(`RequestOnboardingButton`)는 실패를 **모른 채** "쏙이가 만드는 중…"을 180초간 보이다 "오래 걸립니다"로 끝난다. 사용자는 "한도 초과라 잠시 후 다시"라는 걸 못 본다.

## 작업

이 step은 **UI + 실패 관측 배선**만 다룬다(에러 타입/전파는 step0·1에서 끝남). Esther가 카피·레이아웃 담당.

**목표**: 초기 아크가 quota로 실패하면, 클라가 그것을 관측해 **"유튜브 검색 한도가 초과됐어요 — 잠시 후 다시 시도하세요" + [다시 시도] 버튼**을 보여준다(영구 실패/타임아웃과 카피 구분).

1. **실패를 클라 관측 가능하게** — 가장 얇은, 기존 패턴 미러하는 방법으로:
   - `onboardingStageFn`(또는 `runOnboarding`)에서 `OnboardingRetryableError`를 잡아, 아크가 로드되는 것과 **같은 경로로 읽을 수 있는 경량 실패 마커**를 저장한다(예: stage_proposals stage='onboarding'에 `payload.retryable_failure` 같은 경량 필드, 또는 이미 있는 실패 조회 경로 재사용). 새 테이블·마이그 추가 금지 — **마이그0 유지**.
   - page.tsx가 아크 로드 지점에서 이 마커도 읽어(예: `loadOnboardingArc` 미러한 `loadOnboardingFailure`) RequestOnboardingButton에 prop으로 내린다.
   - **주의**: `OnboardingRetryableError`만 이 마커를 남긴다. 진짜 0개(영구 "온보딩 불가")나 기타 예외는 기존 경로(errors.jsonl·재시도 안내 없음) 유지.
   - inngest onFailure는 retries 소진 후 1회다. retryable을 **retries 없이 즉시 마커 저장**할지(재시도해도 같은 날 quota는 안 풀리므로 즉시가 자연스러움) 아니면 onFailure에서 저장할지는 에이전트 재량 — 단 사용자가 몇 분 안에 보게 하라(180s 타임아웃 전에).

2. **RequestOnboardingButton 카피 분기** — `retryableFailure` prop(또는 유사)이 있으면:
   - "쏙이가 만드는 중…" 대신 **"⚠ 유튜브 검색 한도 초과 — 잠시 후 다시 시도하세요"**(TRUS yellow) + `onClick` 재실행하는 **[다시 시도]** 버튼.
   - `submitted` 폴링 상태를 리셋해 사용자가 다시 누를 수 있게.
   - 기존 timeout("오래 걸립니다")·generic error 카피는 유지(retryable이 아닐 때).

3. **TRUS Create 3색만**(Black/Yellow/White)·격동고딕2·그라데이션/그림자 금지. 기존 border 패턴 미러.

## 테스트

- 순수 로직(마커 저장/읽기 술어·카피 분기 조건)은 `src/lib/**`에 두고 테스트(vitest @/ alias 함정 회피 — rules.md). UI 컴포넌트 자체 렌더 테스트는 신규로 만들지 말 것(기존 관례: UI step은 유닛 테스트 없이 기존 전부 통과).
- 마커 저장이 `OnboardingRetryableError`에만 발동하고 영구 실패엔 안 하는 것을 술어 테스트로 커버.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0).
2. 체크리스트: 마이그0인가? retryable만 재시도 UI를 띄우고 영구 실패는 기존 카피인가? TRUS 3색인가?
3. index.json step2 갱신(completed+summary).

## 금지사항

- 새 테이블/마이그레이션을 추가하지 마라. 이유: 이 phase 불변식은 마이그0 — 경량 마커는 기존 stage_proposals payload(jsonb)나 기존 조회 경로 재사용으로 해결한다.
- 영구 실패("레퍼런스 영상을 찾지 못해 온보딩 불가")에까지 "다시 시도" 카피를 붙이지 마라. 이유: 그건 quota가 아니라 진짜 없음 — 재시도해도 안 됨(사용자 오도).
- 백엔드 에러 타입/전파(step0·1)를 다시 건드리지 마라.
- 기존 테스트를 깨뜨리지 마라.
