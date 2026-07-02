# 쏙이 학습 내용 표시 + 추가 학습 (onboarding-learning-ux) — 설계

_2026-07-02 · 대화로 확정(brainstorming) · Phase B (쏙이 개선 2/3)_

## 목적 (item 3 + 4)

① 완료 화면이 "복습 완료"만 뜨는 걸 → **실제 학습 내용(금맥) 표시**로. ② **추가 문제**를 난이도별로 더 풀 수 있게.

## 결정 (확정)

- **item 3**: 완료 화면에 금맥 4필드(헷갈린 지점·아하·핵심 갈림길·추론 수준) 표시.
- **item 4**: "추가 문제" → 난이도(basic/mid/deep) 1개 선택 → 그 난이도 문항 추가 생성 → **기존 아크에 이어붙임**(Q1=A). **저장된 3 refs 재사용**(Q2). 재제출 시 **금맥 갱신**(Q3·`extractGold` 재실행). 구성 이미 생성됐으면 자동 반영 안 됨(기존 제약 동일).

## Step 분해

### step0 `gold-display` (프론트)
- `loadOnboardingGold`를 `page.tsx` OnboardingSection 로드에 배선(arc와 함께). `OnboardingSection`/`OnboardingQuiz` 완료(`done`) 분기에서 금맥 표시: `confusionPoints`(헷갈린 지점)·`ahaPoints`(아하)·`coreAngle`(핵심 갈림길)·`calibratedLevel`(추론 수준). 금맥 없으면(미제출) 기존 카피. TRUS 3색.

### step1 `onboarder-difficulty-more` (백엔드)
- 난이도 타겟 추가 생성: `runOnboarding`에 `{more: {difficulty: ArcDifficulty}}` 경로(또는 신규 `appendOnboardingQuestions`) — 저장된 refs 재사용(재검색 X), `ONBOARDER_SYSTEM`에 "난이도 X 문항 N개 추가·기존 아크 흐름 이어서·클리프행어 유지" 지시. 생성 문항을 **기존 arc.questions에 append**해 proposal payload 갱신(jsonb·마이그0).
- 이벤트: `run/onboarding.requested` data에 `{more, difficulty}` 추가(force와 별개). onboardingStageFn 분기.
- 재제출: `submitOnboarding`이 확장된 아크 전체로 `extractGold` → `saveOnboardingGold`(금맥 갱신).

### step2 `additional-questions-ui` (프론트)
- 완료 화면에 **"추가 문제"** 버튼 + 난이도 선택(basic/mid/deep 3버튼). 선택 → `requestOnboarding`류로 `{more, difficulty}` 발행 → 폴링(RequestOnboardingButton 패턴) → 이어붙은 문항 재생(playback가 확장 arc 처리) → 재제출로 금맥 갱신.

## 불변식
- 마이그레이션 0(arc payload jsonb append·금맥 edited_payload 재사용). 의존성 0.
- 추가 생성 없으면 기존 아크·금맥 바이트 동일.
- 금맥→구다리 주입은 기존과 동일(구성 생성 시점에만 읽힘 — 이후 갱신은 재생성해야 반영).

## 비스코프
- 난이도 자동 상승(적응형). 추가 문제 무한 반복 상한(초기엔 사람이 판단).
