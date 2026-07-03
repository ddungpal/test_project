# 쏙이 완료화면 — 풀이 복습 + 레퍼런스 영상 (onboarding-review-recap)

_2026-07-03 · 사용자 라이브 발견: 완료 화면에서 (a) 내가 푼 문제/답/해설을 다시 볼 수 없음, (b) 근거 레퍼런스 영상을 온보딩 단계에서 확인할 수 없음(스크립트 단계 패널에만 있음)._

## 목표

쏙이 온보딩 **완료(done) 화면**에 세 가지를 추가:
1. **정답 요약** — "N문항 중 M개 정답".
2. **내 풀이 다시 보기** — 접이식(`<details>`·기본 닫힘), 문항별 질문·보기(내 선택+정답+맞음/틀림)·해설(ahaReveal).
3. **레퍼런스 영상** — 이 온보딩의 근거 영상 목록(완료 화면에도 표시).

## 핵심 사실 (데이터 위치·불변식)

- **모두 클라이언트에 이미 있음 — 백엔드/마이그/의존성 0.**
  - `OnboardingQuiz`의 `state`(PlaybackState)에 `answers: ArcAnswer[]`(`{questionIdx, chosenIdx}`) = 내가 고른 답.
  - `arc.questions`(`ArcQuestion`): `prompt`·`choices[]`·`answerIdx`(정답)·`ahaReveal`(해설)·`difficulty`·`hookMode`.
  - `arc.references`(`ArcReference[]` = `{title,url,videoId}`): `loadOnboardingArc`가 payload로 실어옴 → `arc` prop에 존재.
  - 정오 판정 순수함수 `isCorrect(state, chosenIdx)` 이미 있음(playback.ts) — 재사용 또는 미러.
- **문항↔영상 개별 매핑은 없다**(문항이 여러 레퍼를 교차 근거해 생성). → 레퍼런스는 **"이 온보딩의 근거 영상"** 으로 묶어서 표기(문항별 출처 아님).
- **추가 문제까지 포함**: `state.answers`·`arc.questions`는 "더 풀어보기"로 늘어난 것까지 누적 → 복습에 전부 표시(자연).
- **읽기 전용**: 복습은 재응답 아님(재생·제출 로직 무변경).
- **하위호환**: `arc.references` 없거나 빈 배열이면 레퍼런스 섹션 생략(#A 이전 아크). 답이 없는 문항(방어)은 "미응답" 표기 또는 스킵.

## 설계

### 순수 헬퍼 `src/lib/onboarding/recap.ts` (테스트 대상)

vitest `@/` alias 함정 회피(rules.md) — 컴포넌트가 아니라 여기 둔다.

```ts
export type RecapRow = {
  question: ArcQuestion;
  chosenIdx: number | null;   // 미응답 방어 시 null
  correct: boolean;
};
// arc.questions + answers를 조인해 문항 순서대로 복습 행 생성. answers는 questionIdx로 매칭.
export function buildRecap(arc: OnboardingArc, answers: ArcAnswer[]): RecapRow[];
// 요약: {correct, total}. total = arc.questions.length(또는 응답 수 — 하나로 정하고 명시).
export function recapScore(rows: RecapRow[]): { correct: number; total: number };
```

- `answerIdx` 범위·`chosenIdx` 매칭은 방어적으로(스키마는 normalizeArc가 이미 검증하나, 미응답/누락 대비).

### UI `OnboardingQuiz.tsx` (done 분기)

기존 done 분기(금맥 블록 + "이해 완료" + "더 풀어보기") **아래에** 추가. Esther 담당·TRUS 3색·격동고딕2·그라데이션/그림자 금지·기존 border 패턴 미러.

1. **요약 줄** — `recapScore` → "N문항 중 M개 정답"(가벼운 한 줄·yellow 강조).
2. **내 풀이 다시 보기** — 네이티브 `<details>`(기본 닫힘·summary "내 풀이 다시 보기"). 열면 `buildRecap` 행마다:
   - 질문(prompt) + (선택) difficulty 배지.
   - 보기 목록: 각 choice에 **내 선택** 표시 + **정답** 표시. 맞음=✅/yellow, 틀림=✗(내 오답 + 정답 둘 다 식별되게). 미응답이면 정답만 표기.
   - **해설(ahaReveal)** — 보기 아래.
3. **레퍼런스 영상** — `arc.references?.length`면 표시. **기존 `MustWatchReferences` 재사용**(props `{refs}`) 또는 그 내부 썸네일/링크 로직 재사용. 헤더는 "이 온보딩의 근거 영상"류(스크립트단계 "필수 시청"과 문구 구분). 0개면 섹션 생략.

### page.tsx

- 배선 변경 **불필요**할 가능성 높음(`arc.references`가 이미 `arc` prop에 있음). 만약 `loadOnboardingArc`가 references를 안 싣는 게 확인되면(테스트로), page.tsx가 이미 로드하는 `mustWatchRefs`(loadOnboardingReferences)를 OnboardingSection→OnboardingQuiz로 내려 재사용(신규 쿼리 금지).

## AC

```bash
npm run typecheck && npm test && npm run build
```

## 테스트 `tests/onboardingRecap.test.ts`

- `buildRecap`: 정답/오답/미응답 매칭, 추가 문제(questionIdx 늘어난 경우) 순서 유지.
- `recapScore`: 정답 수 집계, total 정의 일관.
- 순수 함수만 테스트(UI 컴포넌트 렌더 테스트 신규 금지 — 기존 관례).

## 금지사항

- 문항별 "출처 영상" 매핑을 지어내지 마라(데이터에 없음). 레퍼런스는 온보딩 단위 목록으로만.
- 재생/제출/금맥 추출 로직을 바꾸지 마라(복습은 읽기 전용·기존 state 소비만).
- 새 백엔드/쿼리/마이그 추가 금지(전부 클라 데이터).
- 순수 헬퍼를 컴포넌트 파일에 두지 마라(vitest @/ alias 함정 — `src/lib/onboarding/`에).

## Step 분해

- **step0 `recap-helper`**: 순수 `src/lib/onboarding/recap.ts`(buildRecap·recapScore) + `tests/onboardingRecap.test.ts`. UI 없음.
- **step1 `recap-ui`**: `OnboardingQuiz.tsx` done 분기에 요약·복습 `<details>`·레퍼런스 영상(MustWatchReferences 재사용). 필요 시 page.tsx refs 배선. (Esther)
