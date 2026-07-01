# Step 5: onboarding-quiz-ui

쏙이의 인터랙티브 퀴즈 UI + 구다리 입구의 **눈에 띄는 "먼저 이해하기" 진입**. 찍기→즉시 아하 공개→다음 클리프행어로 "풀면서 관심이 계속 가는" 경험. 순수 재생 로직은 컴포넌트 밖 `src/lib/onboarding/`에 둔다. (UI step — Esther 투입.)

## 읽어야 할 파일

- `docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md` — 설계 단일 출처. 특히 "E. UI"와 결정(온디맨드·눈에 띄게·미검증 표식).
- `design/design-system/trus-create/trus-create-design-system.md` 및 `DESIGN.md` — **TRUS Create 3색(Black #121212 / Yellow #F8F082 / White)·격동고딕2·강렬 직설·그라데이션/그림자 금지.**
- `src/components/ScriptReview.tsx` — 인라인 검수 UI·미검증 "⚠️확인 필요" 표식·좌측보더 패턴(미검증 수치 표식 미러 대상).
- `src/components/PostConfirmTitleEdit.tsx`(또는 target-persona의 `PostConfirmTopicPersonaEdit.tsx`) — 확정 요약 자리에 액션 버튼을 붙이는 패턴.
- `src/app/runs/[id]/page.tsx`(또는 실제 run 상세 페이지) — 스테이지별 렌더 분기. **썸네일 확정 후(구다리 진입 전) 상태**에서 진입 버튼을 붙일 자리.
- `src/agents/onboarder/schema.ts`(step 0)·`src/lib/onboarding/arc.ts`(step 0)·`submitOnboarding` 액션(step 3).

## 작업

### 1) 순수 재생 로직 → `src/lib/onboarding/` (컴포넌트 밖)

- 현재 문항 인덱스·공개 여부·정오 판정·응답 누적 등 **순수 로직**은 `src/lib/onboarding/`에 함수로 두고 컴포넌트는 호출·re-export만.
- 이유(반드시 준수): vitest에 `@/` alias가 없어 컴포넌트를 테스트가 import하면 내부 `@/...`까지 끌려와 스위트 전체가 로드 실패한다(실전 함정). 단위 테스트할 순수 헬퍼는 컴포넌트 파일에 두지 마라.

### 2) `src/components/OnboardingQuiz.tsx` (Esther)

- props: `{ runId, arc: OnboardingArc }`.
- **인터랙티브 재생**: 한 문항씩 — 보기 선택 → **즉시 `ahaReveal` 공개**(맞음/틀림 둘 다 아하가 배움) → `cliffhanger` 한 줄로 다음 문항 당김 → 진행.
- `hookMode` 시각 구분은 **라벨/톤으로**(반전 vs 실용템) — 색 남발 금지(TRUS 3색). VisualBlock 배지 스타일 참고.
- **미검증 수치(`unverifiedNumbers`)는 "⚠️확인 필요"로 표식**(ScriptReview 패턴 미러) — 김짠부가 "이건 셜록이 나중에 검증"임을 알게.
- 마지막 문항 후 `coreAngle`을 "이 영상의 핵심 갈림길"로 보여주고, **응답 전체를 `submitOnboarding(runId, answers)`로 제출**(step 3 액션) → 성공 시 `router.refresh()`.

### 3) 구다리 입구 진입 (온디맨드·눈에 띄게)

- run 상세 페이지의 **썸네일 확정 후 상태**(구다리 진입 전)에 **눈에 띄는 "먼저 이해하기 (쏙이)" 버튼/카드**.
  - 아크가 아직 없으면 → 버튼이 `run/onboarding.requested` 발행(액션/트리거) 후 대기 표시.
  - 아크가 있으면 → `OnboardingQuiz` 재생.
  - **건너뛰기 가능**(강제 아님) — 구다리 시작 버튼은 그대로 노출.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 tests/onboardingPlayback.test.ts (순수 로직) 포함
npm run build
```

신규 `tests/onboardingPlayback.test.ts`(순수 로직만·컴포넌트 import 금지):
- 문항 진행·공개·정오 판정·응답 누적이 의도대로.
- 마지막 문항 후 제출용 answers가 `ArcAnswer[]` 형태로 모임.

## 검증 절차

1. AC 실행.
2. 아키텍처 체크리스트:
   - TRUS 3색·격동고딕2 준수, 그라데이션/그림자 없음, 이모지 남발 없음.
   - 순수 로직이 `src/lib/onboarding/`에 있고 컴포넌트는 re-export/호출만(vitest alias 함정 회피).
   - 미검증 수치 표식(⚠️확인 필요)이 있는가.
   - 구다리 시작 버튼이 여전히 노출되어 온보딩을 **건너뛸 수 있는가**(강제 게이트 아님).
3. `phases/onboarding-tutor/index.json` step 5 갱신(summary: 신규 컴포넌트·진입 자리·순수로직 위치·⚠️브라우저 수동검증 필요 여부).

## 금지사항

- **순수 재생 로직을 `OnboardingQuiz.tsx` 안에 두고 거기서 테스트하지 마라.** 이유: vitest `@/` alias 부재로 스위트 전체 로드 실패(실전 함정). `src/lib/onboarding/`에 분리.
- **온보딩을 강제 게이트로 만들지 마라**(구다리 시작 버튼을 가리거나 막지 마라). 이유: 온디맨드·건너뛰기 가능이 설계 결정.
- **TRUS 밖 색·그라데이션·그림자·이모지 남발 금지.** 이유: 디자인 시스템 규칙.
- **백엔드 전이 로직을 UI에서 중복 구현하지 마라.** 이유: 상태·저장은 step 3 액션/이벤트 소관(UI는 호출만) — ScriptReview가 서버 전이 UI 중복 0을 지킨 선례.
- 기존 테스트를 깨뜨리지 마라. 인터랙티브 드래그/재생 UX는 브라우저 수동검증 대상임을 summary에 남겨라(curl 불가).
