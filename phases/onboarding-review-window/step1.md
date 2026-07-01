# Step 1: review-mode-ui

쏙이 온보딩 섹션을 **구성 이후에도 노출**하고, 상태에 따라 **live/review 두 모드**로 카피를 분기한다. step 0에서 만든 순수 술어 `isOnboardingVisible`를 UI 게이트에 배선하고, `OnboardingSection` → `OnboardingQuiz`로 `mode`를 내려 완료 화면 문구를 정직하게 바꾼다. **백엔드·생성 액션·구다리 금맥 주입 로직은 무변경** — 순수 노출 창 + 카피뿐이다.

## 읽어야 할 파일

먼저 아래를 읽고 설계 의도·현재 배선을 파악하라:

- `phases/onboarding-review-window/step0.md` 및 step 0 산출물 — `src/domain/enums.ts`의 신규 `isOnboardingVisible(state)` 술어. 이 step이 소비한다.
- `src/app/runs/[id]/page.tsx` — **핵심 수정 대상.** 특히:
  - line ~430-438: 상태별 조건부 데이터 fetch(`onboardingArc`는 `run.state === "thumbnails_selected"`일 때만 `loadOnboardingArc` 호출).
  - line ~385-404: `OnboardingSection` 컴포넌트 정의(현재 props `{ runId, arc }`). 아크 있으면 `<OnboardingQuiz>`, 없으면 `<RequestOnboardingButton>` + 안내문.
  - line ~499-500: 섹션 렌더 게이트(`{run.state === "thumbnails_selected" && <OnboardingSection ... />}`).
- `src/components/OnboardingQuiz.tsx` — 완료 화면 문구가 line ~59-68에 하드코딩("이해 완료" / "여기서 나온 헷갈린 지점·아하·핵심 갈림길이 구성(구다리)으로 넘어갔어요."). props는 현재 `{ runId, arc }`.
- `src/components/RequestOnboardingButton.tsx` — "먼저 이해하기" 생성 버튼(props `{ runId }`). **이 파일은 수정 불필요**(review에서도 그대로 재사용) — 참고만.
- `ARCHITECTURE.md`, `DESIGN.md`(TRUS Create 3색 규칙).

## 작업

### 1) `src/app/runs/[id]/page.tsx` — 게이트 넓히기 + mode 산출·전달

- **아크 fetch 게이트 교체**: `run.state === "thumbnails_selected"` 조건을 `isOnboardingVisible(run.state)`로 바꿔, review 상태에서도 기존 아크를 불러온다(복습 재생용). `isOnboardingVisible`를 `@/domain/enums`에서 import.
- **섹션 렌더 게이트 교체**: 동일하게 `{isOnboardingVisible(run.state) && <OnboardingSection ... mode={onbMode} />}`.
- **mode 산출**: `const onbMode = run.state === "thumbnails_selected" ? "live" : "review";` (렌더 직전, 컴포넌트 밖 서버 스코프).

### 2) `OnboardingSection`(page.tsx 내) — 카피 분기

시그니처를 `{ runId, arc, mode }: { runId: string; arc: OnboardingArc | null; mode: "live" | "review" }`로 확장. 카피를 mode로 분기:

- **헤더**: live = "먼저 이해하기 (쏙이)" (현행) / review = "다시 훑어보기 (쏙이)".
- **부제**: live = 현행("구성 전에 이 주제를 한 번 훑어보세요. 찍고 틀려도 좋아요 — 오히려 더 잘 남습니다. (건너뛰고 바로 구성해도 됩니다.)") / review = "구성은 이미 만들어졌어요. 복습으로 다시 풀어봐도 좋아요. (새로 풀어도 이미 만든 구성엔 자동 반영되진 않아요 — 반영하려면 구성을 다시 생성하세요.)".
- **아크 없을 때 안내문**(현재 "누르면 쏙이가 궁금증 아크를 만듭니다 — 잠시 후 새로고침하세요."): live는 현행. review는 위 부제가 이미 맥락을 주므로 그대로 두거나 간결히 유지(재량).
- `<OnboardingQuiz>`에 `mode`를 그대로 전달한다.
- TRUS 3색(Black/Yellow/White)·기존 border 스타일 유지. 새 색·그라데이션·그림자 금지.

### 3) `src/components/OnboardingQuiz.tsx` — 완료 문구 분기

- props를 `{ runId, arc, mode }: { runId: string; arc: OnboardingArc; mode: "live" | "review" }`로 확장(`mode` optional 기본 "live"로 둬도 됨 — 호출측이 항상 넘기지만 안전값).
- 완료(`done`) 화면(line ~60-68) 문구 분기:
  - live = 현행("이해 완료" / "여기서 나온 헷갈린 지점·아하·핵심 갈림길이 구성(구다리)으로 넘어갔어요.").
  - review = "복습 완료" / "이번 풀이는 이미 만든 구성엔 자동 반영되지 않아요 — 반영하려면 구성을 다시 생성하세요.".
- **퀴즈 진행·정오·제출 로직(`src/lib/onboarding/playback.ts` 호출부)은 무변경.** 완료 후 제출 액션도 그대로(review에서 금맥이 edited_payload에 써져도 이미 생성된 구성엔 미반영 — 이는 정직 카피로 사용자에게 고지하는 것으로 충분, 백엔드 차단 불필요).

## Acceptance Criteria

```bash
npm run typecheck   # 컴파일 에러 없음 (mode prop 타입 포함)
npm test            # 기존 테스트 전부 통과 (회귀 0)
npm run build       # 빌드 성공
```

- 이 step은 서버 컴포넌트 조건·클라 컴포넌트 카피 분기라 단위 테스트 추가는 필수 아님(로직 아닌 표현). 단, **기존 테스트를 깨지 않아야** 한다. `OnboardingQuiz`/`OnboardingSection`의 순수 헬퍼를 새로 만들지 않는다(카피 분기는 인라인 삼항으로 충분).

## 검증 절차

1. 위 AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 게이트 2곳(fetch·렌더)이 모두 `isOnboardingVisible`로 교체됐는가(둘 중 하나만 바꾸면 review에서 아크가 안 불려 재생 불가).
   - `mode`가 page.tsx → OnboardingSection → OnboardingQuiz까지 일관되게 전달되는가.
   - TRUS 3색 규칙 위반(새 색·그라데이션·그림자) 없는가.
   - 백엔드/액션/구다리 주입 로직 무변경인가(git diff에 `src/app/actions/`·`src/inngest/`·`src/agents/onboarder/` 변경이 없어야 정상).
3. 결과에 따라 `phases/onboarding-review-window/index.json`의 step 1을 갱신:
   - 성공 → `"completed"` + `"summary"`(수정 파일·mode 분기 요지).
   - 3회 시도 실패 → `"error"` + `"error_message"`.

## 금지사항

- **게이트를 한 곳만 바꾸지 마라. 이유: fetch(loadOnboardingArc)와 렌더 둘 다 `thumbnails_selected` 하드코딩이라, 렌더만 넓히면 review 상태에서 `arc`가 항상 null로 와 기존 아크를 복습할 수 없다.** 반드시 두 곳 다 `isOnboardingVisible`로.
- **백엔드·생성 액션·requestOnboarding·구다리 금맥 주입·`playback.ts`를 수정하지 마라. 이유: 이 기능은 노출 창 + 카피만. 주입 로직을 건드리면 검증된 live 동작이 회귀할 수 있다.**
- **완료 화면에서 review인데 "구다리로 넘어갔어요"라고 단정하지 마라. 이유: 구성이 이미 생성된 뒤라 거짓이다 — review는 "자동 반영 안 됨 · 재생성 필요"로 정직하게.**
- **새 색·그라데이션·그림자를 쓰지 마라. 이유: TRUS Create는 Black/Yellow/White 3색만.**
- 기존 테스트를 깨뜨리지 마라.
