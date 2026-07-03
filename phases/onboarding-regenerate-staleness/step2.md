# Step 2: regenerate-button-and-stale-banner-ui (재생성 버튼 + stale 경고 배너)

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-regenerate-staleness-design.md` (설계 전문)
- `src/components/RequestOnboardingButton.tsx` — 미러 정본(requestOnboarding→LiveRefresh 폴링·POLL_LIMIT_MS·submitted/timedOut/error).
- `src/app/actions/topicRun.ts` — step1에서 추가한 `regenerateOnboarding(runId)`.
- `src/lib/onboarding/…` — step1의 `isOnboardingArcStale`.
- `src/app/runs/[id]/page.tsx` — `OnboardingSection`(≈387·`{ runId, arc, gold, mode, retryableFailure }`)·`getSelectedStagePayload`.
- `src/components/OnboardingQuiz.tsx` — `answersKey`(localStorage 키 `onboarding:answers:${runId}`).
- `src/components/SegmentStaleBanner.tsx`(있으면) — 경고 배너 톤 미러.
- `.claude/rules/rules.md`, `CLAUDE.md`, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경

step1에서 만든 재생성 액션·stale 헬퍼를 UI로 노출한다: (A) "온보딩 다시 만들기" 버튼, (B) 주제 변경 stale 경고 배너.
전제: step0(쿼리)·step1(백엔드) 머지됨.

## 작업

### A-2. 신규 `RegenerateOnboardingButton` (클라 컴포넌트)

`RequestOnboardingButton`을 미러하되 `regenerateOnboarding` 호출:
- `regenerateOnboarding(runId)` → `setSubmitted(true)` → `router.refresh()` + LiveRefresh 폴링 + POLL 상한 + error(정본과 동일).
- 라벨: "온보딩 다시 만들기"(진행 중 "다시 만드는 중…"). TRUS 3색·기존 버튼 톤.
- ★ **재생성 직전 localStorage 풀이이력 초기화**: `window.localStorage.removeItem(\`onboarding:answers:${runId}\`)`
  (새 문항이 오므로 옛 answers가 잘못 매핑되는 것 방지·typeof window 가드). answersKey 문자열은 OnboardingQuiz와 동일 규칙.

### B-3. stale 배너 + 배선 (page.tsx `OnboardingSection`)

- `OnboardingSection` props에 `topicTitle: string | null` 추가.
- `page.tsx`에서 `OnboardingSection` 렌더 시 현재 선택 주제 제목 전달:
  `getSelectedStagePayload(supa, runId, "topic")`의 `.title`(prepareOnboarder 미러·없으면 null).
- `OnboardingSection` 안에서 `const stale = arc && isOnboardingArcStale(arc.sourceTopicTitle, topicTitle);`
- `arc`가 있을 때(OnboardingQuiz 렌더 분기) **그 위에**:
  - `stale`이면 경고 배너(차단 아님·TRUS 노랑 좌측보더 `border-l-2 border-l-trus-yellow`):
    "⚠️ 주제가 바뀌었어요 — 이 온보딩은 이전 주제로 만들어졌어요. 아래 ‘온보딩 다시 만들기’로 갱신하세요."
    (가능하면 `arc.sourceTopicTitle`을 작게 병기: "이전: …")
  - `<RegenerateOnboardingButton runId={runId} />` (stale 여부와 무관하게 **항상** 노출 — 아크가 틀리면 언제든 재생성).

## 테스트

- step1의 `isOnboardingArcStale` 테스트로 로직 커버. UI 렌더 테스트는 없음(vitest @/ 함정·RequestOnboardingButton 미러라 회귀위험 낮음).
- 기존 테스트가 `OnboardingSection` 시그니처 변경(topicTitle 추가)으로 깨지면 정정.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드(rules.md).
2. 체크리스트: 재생성 버튼이 아크 존재 시 항상 뜨나? stale일 때만 경고 배너? 배너는 경고만(차단 없음)?
   재생성 직전 localStorage answers 제거하나? topicTitle 배선이 prepareOnboarder와 같은 읽기 경로인가?
   RequestOnboardingButton 폴링 패턴 미러했나?
3. `git status`로 범위 외 신규 파일(fixtures 등) 확인·제외(rules.md).
4. `phases/onboarding-regenerate-staleness/index.json` step2를 `completed`+`summary`로 갱신하고 phase status도 `completed`로.

## 금지사항

- 자동 재생성을 넣지 마라(버튼=수동만·배너=경고만·차단 금지).
- `OnboardingQuiz`의 재생·제출·localStorage 저장 로직을 바꾸지 마라(answers 제거는 재생성 버튼에서만).
- 상태 전이를 만들지 마라.
- `RequestOnboardingButton`(아크 없을 때 진입 버튼)을 바꾸지 마라 — 별도 컴포넌트 신설.
- 기존 테스트를 깨뜨린 채 두지 마라.
