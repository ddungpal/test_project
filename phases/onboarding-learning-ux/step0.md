# Step 0: gold-display

완료 화면이 "복습 완료"만 뜨는 걸 → **실제 학습 내용(금맥) 표시**로 바꾼다(UI). 백엔드는 이미 `loadOnboardingGold`가 있음 — 배선 + 렌더만.

## 읽어야 할 파일

- `docs/specs/2026-07-02-onboarding-learning-ux-design.md` — "step0 gold-display".
- `src/pipeline/onboarding.ts` — `loadOnboardingGold(supa, runId): Promise<OnboardingGold | null>`(`:45-58`·기존·재사용).
- `src/agents/onboarder/schema.ts` — `OnboardingGold = { confusionPoints[], ahaPoints[], coreAngle, calibratedLevel }`(`:30-35`).
- `src/app/runs/[id]/page.tsx` — **수정 대상.** `OnboardingSection({runId, arc, mode})`(`:386-410`)·arc 로드 지점(`:442-444`·`loadOnboardingArc`). 여기에 `loadOnboardingGold`도 병렬 로드해 내려준다.
- `src/components/OnboardingQuiz.tsx` — **수정 대상.** 완료(`done`) 분기(`:60-68`·현재 정적 카피). live/review mode 분기 유지.
- `src/lib/dashboard/labels.ts` — audience_level 라벨(있으면 calibratedLevel 표시에 재사용).

## 작업

- `page.tsx`: `isOnboardingVisible`면 `loadOnboardingArc`와 함께 `loadOnboardingGold(createAdminClient(), run.id)`도 병렬 로드 → `OnboardingSection`에 `gold` prop 추가 → `OnboardingQuiz`에 전달.
- `OnboardingQuiz` 완료(`done`) 화면: `gold`가 있으면 **금맥 내용 표시**:
  - `confusionPoints` → "헷갈렸던 지점"(리스트)
  - `ahaPoints` → "아하 포인트"(리스트)
  - `coreAngle` → "핵심 갈림길"(한 줄)
  - `calibratedLevel` → "추론된 수준"(라벨)
  - live mode면 기존 "구다리로 넘어갔어요", review면 "자동 반영 안 됨" 카피는 유지하되 그 위에 금맥을 보여준다.
- `gold` 없으면(미제출·구버전) 기존 카피만(하위호환). 각 리스트 빈배열이면 그 항목 생략. TRUS 3색.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 기존 테스트 전부 통과
npm run build
```

- UI 렌더 분기라 단위 테스트 필수 아님(순수 로직 없음). 기존 테스트 불변. 순수 헬퍼 필요 시 `src/lib/**`.

## 검증 절차
1. AC 실행.
2. 체크리스트: `loadOnboardingGold` 재사용(신규 백엔드 X). gold 없으면 기존 카피(하위호환). live/review 카피 분기 유지. TRUS 3색.
3. `phases/onboarding-learning-ux/index.json` step 0 갱신(브라우저 검증 필요 명시).

## 금지사항
- **금맥 조회/추출 로직을 새로 만들지 마라 — `loadOnboardingGold` 재사용.**
- **온보더 생성·추가문제(step1/2)를 건드리지 마라.**
- gold 없는 경우(미제출) 에러/빈칸 내지 마라 — 기존 카피 폴백.
- 새 색·그라데이션·그림자 금지(TRUS 3색).
- 기존 테스트를 깨뜨리지 마라.
