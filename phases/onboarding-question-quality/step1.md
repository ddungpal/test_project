# Step 1: term-definition-questions (처음 듣는 용어 정의 문제)

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-question-quality-design.md` (설계 전문 — Step 1 절)
- `src/agents/onboarder/schema.ts` — `ArcHookMode`(≈8)·`HOOK_MODES`(≈51)·`isHookMode`·`ONBOARDER_SYSTEM`.
- `src/components/OnboardingQuiz.tsx` — `HOOK_LABEL` 맵(hookMode → 사람이 읽는 라벨).
- `.claude/rules/rules.md`, `CLAUDE.md`, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경

쏙이 아크에 '개념 이해' 축이 없다. 레퍼런스에 나온 **처음 들으면 헷갈릴 용어**의 정의를 묻는
문항 종류를 추가한다(정답=정확한 정의, 오답=그럴듯하지만 틀린 정의). 기존 듀얼훅(reversal/practical)과
나란히 서는 세 번째 hookMode `"term"`으로 표기한다.

전제: step0(정답 셔플·난이도)이 이미 머지됨. 이 step은 그 위에 용어 종류만 얹는다.

## 작업

### 1) `hookMode` enum 확장 (schema.ts)

- `ArcHookMode = "reversal" | "practical" | "term"`.
- `HOOK_MODES` 배열에 `"term"` 추가. → `isHookMode`가 자동으로 흡수하므로 `normalizeArc`는 **수정 불필요**
  (그래도 term 문항이 드랍되지 않는지 테스트로 확인).

### 2) 라벨 추가 (`OnboardingQuiz.tsx`)

- `HOOK_LABEL` 맵에 `term: "용어"` 추가. `Record<ArcHookMode, string>` 타입이면 term 키가 없을 때
  타입 에러가 나므로, enum 확장과 함께 반드시 채운다(타입이 누락을 잡아줌).

### 3) SYSTEM 프롬프트 지시 (`ONBOARDER_SYSTEM`, schema.ts)

기존 항목 톤 유지·**덧붙이기만**. 한 항목 추가:
- 레퍼런스(transcript·videoFacts)에 나온 '처음 들으면 헷갈릴 용어' 1개 이상을 정의 문제로 낸다.
- 정답 = 정확한 정의, 오답 = 그럴듯하지만 틀린 정의. 그 문항의 `hookMode='term'`로 표기.
- money-safety 유지: 근거(자막·사실)에 없는 용어를 지어내지 말고, 소재가 없으면 굳이 넣지 마라.
- ★ hookMode 설명(현재 reversal/practical만 서술된 ① 항목)에 term 케이스를 한 줄 추가해
  세 값을 모두 설명하도록 정합을 맞춘다.

## 테스트

`tests/onboardingTermMode.test.ts`(신규) 또는 기존 `tests/onboardingArc.test.ts` 확장:
- `hookMode='term'`인 raw 문항이 `normalizeArc`를 통과한다(드랍되지 않음·hookMode 보존).
- `isHookMode('term')`가 true, 잘못된 값은 false.
- (라벨은 순수 로직 아님 — 별도 렌더 테스트 불필요. HOOK_LABEL의 term 키 존재는 타입으로 보장.)

## 조회수·구독자수(#3) 육안 확인 — 코드 변경 없음

이미 배선됨(직전 작업). 이 step에서 코드로 손대지 않는다. 검증 절차의 라이브 확인 항목만 수행:
새 온보딩을 생성했을 때 '이 온보딩의 근거 영상'에 `조회수 …회 · 구독자 …명`이 뜨는지 육안 확인
(뜨지 않으면 그 아크가 직전 변경 이전 것 — 새로 생성해야 함).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드로 판별(rules.md).
2. 체크리스트: enum·HOOK_MODES·HOOK_LABEL 세 곳이 term으로 정합한가? 프롬프트는 **덧붙이기**만 했나?
   term 문항이 normalizeArc를 통과하나?
3. `git status`로 범위 외 신규 파일 확인·제외(rules.md).
4. `phases/onboarding-question-quality/index.json` step1을 `completed`+`summary`로 갱신하고,
   phase 전체 status도 `completed`로.

## 금지사항

- `ONBOARDER_SYSTEM` 기존 문장 재작성 금지(덧붙이기만).
- 조회수·구독자수 코드를 다시 손대지 마라(이미 완료·범위 밖).
- hookMode를 term 하나 넘어 임의 확장하지 마라(reversal/practical/term 3개만).
- 기존 테스트를 깨뜨리지 마라.
