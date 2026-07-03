# Step 1: recap-ui (UI)

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-review-recap-design.md`
- `src/lib/onboarding/recap.ts` — **step0의** `buildRecap`·`recapScore`·`RecapRow`.
- `src/components/OnboardingQuiz.tsx` — done 분기(≈113~·금맥 블록 + "이해 완료" + "더 풀어보기"). `state`(PlaybackState·`answers` 보유)·`arc`(references 포함)·`mode`.
- `src/lib/onboarding/playback.ts` — `PlaybackState`·`ArcAnswer`.
- `src/components/MustWatchReferences.tsx` — 레퍼런스 영상 렌더 컴포넌트(props `{refs}`·썸네일·safeHref·0개면 null). done 화면에서 재사용.
- `src/agents/onboarder/schema.ts` — `ArcReference`.
- (배선 확인용) `src/app/runs/[id]/page.tsx` — `loadOnboardingArc`(arc.references 포함)·`loadOnboardingReferences`(mustWatchRefs)·`OnboardingSection`→`OnboardingQuiz`.

## 배경

step0의 순수 헬퍼로 완료 화면에 (1)요약 (2)복습 (3)레퍼런스 영상을 붙인다. **데이터는 이미 컴포넌트에 있음**: `state.answers` + `arc.questions` + `arc.references`. Esther가 카피·레이아웃.

## 작업

`OnboardingQuiz.tsx` **done 분기에만** 추가(기존 금맥·"이해 완료"·"더 풀어보기" 블록은 유지). TRUS 3색(Black/Yellow/White)·격동고딕2·그라데이션/그림자 금지·기존 border 패턴 미러.

1. **정답 요약** — `const rows = buildRecap(state.arc, state.answers); const { correct, total } = recapScore(rows);` → "**{total}문항 중 {correct}개 정답**" 한 줄(yellow 강조·가벼운 톤).

2. **내 풀이 다시 보기** — 네이티브 `<details>`(기본 닫힘). `<summary>` "내 풀이 다시 보기". 열면 `rows`마다:
   - 질문(prompt) + (선택) difficulty 배지.
   - 보기 목록(question.choices): 각 choice에
     - `i === question.answerIdx` → **정답** 표식(yellow/✓).
     - `i === chosenIdx && i !== answerIdx` → **내 오답** 표식(✗·구분되게).
     - `i === chosenIdx === answerIdx` → 맞음(✅).
     - 미응답(chosenIdx null)이면 정답만 표기.
   - **해설**: `question.ahaReveal`을 보기 아래.
   - 접근성: details/summary 기본 시맨틱 사용. 색만으로 정오 구분 금지(✓/✗ 기호 병기).

3. **레퍼런스 영상** — `arc.references`(있으면). **`MustWatchReferences` 재사용**(`<MustWatchReferences refs={arc.references} />`). 단 그 컴포넌트 헤더 문구가 "필수 시청"으로 고정이면, done 화면엔 "이 온보딩의 근거 영상"류가 맞다 — 헤더를 prop으로 뺄 수 있으면 빼서 문구 구분, 아니면 얇은 인라인 렌더로 대체(썸네일 URL 빌더 `ytThumbUrl`·safeHref 재사용). **0개면 섹션 생략.**
   - `arc.references`가 실제로 `arc` prop에 실려오는지 확인: 안 실려오면(빈 값), page.tsx가 이미 로드하는 `mustWatchRefs`(loadOnboardingReferences)를 `OnboardingSection`→`OnboardingQuiz`에 prop으로 내려 재사용(**신규 쿼리 추가 금지**).

## 불변식

- 재생/제출/금맥 로직 무변경(복습은 읽기 전용·기존 state 소비만).
- live/review 두 mode 모두 노출(복습·레퍼런스는 mode 무관).
- 백엔드/쿼리/마이그 0. 순수 표시 로직은 step0 헬퍼에 위임(컴포넌트엔 조인 로직 중복 금지).

## 테스트

- UI 컴포넌트 렌더 테스트는 신규로 만들지 마라(기존 관례: UI step은 순수 헬퍼만 테스트·컴포넌트는 기존 전부 통과 확인).
- step0 헬퍼가 조인/집계를 이미 커버. 이 step은 그걸 소비만.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0).
2. 체크리스트: 마이그0·신규쿼리0인가? 재생/제출 로직 무변경인가? 레퍼런스 0개면 섹션 생략인가? 정오를 기호(✓/✗)로도 구분하나(색만 아님)? TRUS 3색인가?
3. index.json step1 갱신(completed+summary) + phase 전체 completed.

## 금지사항

- 재생/제출/금맥 추출 로직을 바꾸지 마라. 이유: 복습은 읽기 전용 — 여기 손대면 학습 흐름/금맥이 흔들린다.
- 조인/정오 로직을 컴포넌트에 다시 쓰지 마라(step0 `buildRecap` 사용).
- 문항별 출처 영상을 지어내지 마라(레퍼런스는 온보딩 단위 목록).
- 신규 DB 쿼리/마이그 추가 금지(전부 클라 데이터·필요시 기존 mustWatchRefs 재사용).
- 기존 테스트를 깨뜨리지 마라.
