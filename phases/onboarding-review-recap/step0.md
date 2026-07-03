# Step 0: recap-helper

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-review-recap-design.md` (설계 전문)
- `src/agents/onboarder/schema.ts` — `ArcQuestion`(prompt·choices·answerIdx·ahaReveal·difficulty·hookMode)·`OnboardingArc`(questions·coreAngle·references?)·`ArcReference`.
- `src/lib/onboarding/arc.ts` — `ArcAnswer`(`{questionIdx, chosenIdx}`) 타입.
- `src/lib/onboarding/playback.ts` — `isCorrect(state, chosenIdx)`(≈49) 정오 판정 패턴(재사용/미러 참고).
- `.claude/rules/rules.md` — vitest `@/` alias 함정(순수 헬퍼는 컴포넌트 아닌 `src/lib/**`에).

## 배경

쏙이 완료 화면에 (1)정답 요약 (2)내 풀이 복습을 추가한다. 이 step은 그 **순수 조인/집계 헬퍼만** 만든다(UI는 step1). 데이터는 전부 클라이언트에 있음(`arc.questions` + `state.answers`) — 백엔드 무관.

## 작업

**신규 파일 `src/lib/onboarding/recap.ts`**. 순수 함수만(I/O·React 없음).

```ts
import type { OnboardingArc, ArcQuestion } from "@/agents/onboarder/schema"; // (경로는 프로젝트 관례 따를 것)
import type { ArcAnswer } from "./arc";

export type RecapRow = {
  question: ArcQuestion;
  chosenIdx: number | null;   // 미응답이면 null(방어)
  correct: boolean;           // chosenIdx === question.answerIdx
};

/** arc.questions를 순서대로 순회하며 answers(questionIdx로 매칭)를 조인. 미응답 문항은 chosenIdx=null·correct=false. */
export function buildRecap(arc: OnboardingArc, answers: ArcAnswer[]): RecapRow[];

/** 요약 집계. total = arc.questions.length(전체 문항 기준). correct = correct===true 행 수. */
export function recapScore(rows: RecapRow[]): { correct: number; total: number };
```

규칙:
- `answers`는 `questionIdx`로 매칭(같은 idx 여러 개면 마지막 것 — 재생 로직상 1문항 1응답이지만 방어). 순서는 `arc.questions` 인덱스 순.
- `correct` = `chosenIdx != null && chosenIdx === question.answerIdx`.
- `total`은 **전체 문항 수**(`arc.questions.length`)로 정의(미응답 포함). 요약 문구는 step1이 "N문항 중 M개 정답"으로 쓴다 — 여기선 숫자만.
- 방어: `answerIdx`/`chosenIdx`가 choices 범위 밖이어도 throw 금지(normalizeArc가 이미 검증하나 안전하게).

`OnboardingArc`/`ArcQuestion`/`ArcReference` import 경로는 기존 `src/lib/onboarding/*.ts`가 schema를 import하는 방식과 동일하게 맞춰라(상대경로 vs alias — 기존 파일 확인).

## 테스트 `tests/onboardingRecap.test.ts`

- `buildRecap`: 정답 문항(correct true)·오답 문항(false·chosenIdx 보존)·미응답(chosenIdx null·false)·문항 순서 유지·추가 문제로 questionIdx가 늘어난 케이스(0..7 등).
- `recapScore`: 섞인 행에서 correct/total 정확.
- 순수 함수라 스텁 불필요. (혹시 함수 주입 스텁이 필요하면 vi.fn 아닌 impl+카운터 — rules.md.)

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0).
2. 체크리스트: 순수 함수인가(React/I/O 없음)? `src/lib/onboarding/`에 있나(컴포넌트 아님)? 미응답/범위밖 방어되나?
3. `phases/onboarding-review-recap/index.json` step0을 `completed`+`summary`로 갱신.

## 금지사항

- UI(`OnboardingQuiz.tsx`)를 건드리지 마라(step1 범위).
- 문항별 출처 영상 매핑을 만들지 마라(데이터에 없음).
- 헬퍼를 컴포넌트 파일에 두지 마라(vitest @/ alias 함정).
- 기존 테스트를 깨뜨리지 마라.
