# Step 2: additional-questions-ui

완료 화면에 **"추가 문제"** 버튼 + 난이도 선택을 붙여, step1의 추가 생성을 발동하고 이어서 풀 수 있게 한다(UI).

## 읽어야 할 파일

- `docs/specs/2026-07-02-onboarding-learning-ux-design.md` — "step2".
- `phases/onboarding-learning-ux/step0.md`·`step1.md` + 산출물 — 완료 화면 금맥 표시(step0)·`more:{difficulty}` 추가 생성 경로(step1).
- `src/components/OnboardingQuiz.tsx` — **수정 대상.** 완료(`done`) 분기(step0에서 금맥 표시 확장됨)·`submit`/playback 흐름·`mode`.
- `src/components/RequestOnboardingButton.tsx` — 발행+폴링(LiveRefresh 180s) 패턴 미러.
- `src/app/actions/topicRun.ts` — `requestOnboarding`(step1에서 `more` 인자 받도록 확장됐을 것) 또는 신규 액션.
- `src/lib/onboarding/playback.ts` — 재생(initPlayback·chooseAnswer·next·collectAnswers)·확장 arc 처리 확인.

## 작업

- 완료 화면(금맥 표시 아래)에 **"추가 문제 풀기"** 섹션: 난이도 3버튼(입문 basic·중급 mid·심화 deep) → 선택 시 `requestOnboarding(runId, { more: { difficulty } })`류 발행 → `submitted` 폴링(RequestOnboardingButton 패턴·"쏙이가 문제 만드는 중… 잠시 후 새로고침").
- 생성 완료(아크 확장) → 새로고침되면 `OnboardingQuiz`가 확장된 arc를 받아 **이어붙은 문항부터 재생**(playback가 전체/증분 처리). 재제출 시 step1의 `submitOnboarding`이 금맥 갱신.
- (재생 재개 지점: 이미 푼 문항 다시 안 풀게 — playback가 collectAnswers/진행 인덱스로 처리하는지 확인. 간단히는 확장 아크 전체를 다시 풀되 중복 응답은 마지막이 이김이어도 무방·재량.)
- live/review mode 모두 노출(추가 학습은 언제든). TRUS 3색.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 기존 테스트 전부 통과
npm run build
```

- UI라 단위 테스트 필수 아님. playback에 순수 로직 추가 시 `src/lib/onboarding/`에 두고 테스트. 기존 테스트 불변.

## 검증 절차
1. AC 실행.
2. 체크리스트: 난이도 3버튼→`more:{difficulty}` 발행. 폴링 패턴 재사용. 확장 아크 재생·재제출로 금맥 갱신. TRUS 3색.
3. `phases/onboarding-learning-ux/index.json` step 2 갱신(**브라우저 수동검증 필요** 명시 — 생성·재생·금맥갱신은 라이브).

## 금지사항
- **백엔드 생성/금맥 로직을 UI에서 중복 구현하지 마라 — step1 경로 호출만.**
- **난이도 없이 추가 생성 발동하지 마라 — 반드시 basic/mid/deep 중 선택.**
- 새 색·그라데이션·그림자 금지(TRUS 3색).
- 기존 테스트를 깨뜨리지 마라.
