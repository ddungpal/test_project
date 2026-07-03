# 쏙이 온보딩 문항 품질 개선 (onboarding-question-quality)

작성일: 2026-07-03

## 배경 / 문제

유저테스트에서 쏙이 궁금증 아크 문항의 세 가지 개선점이 나왔다.

1. **정답이 전부 같은 번호(2번)에 몰림** — 생성 프롬프트가 `answerIdx` 분산을 지시하지 않아
   claude-p가 정답을 한 위치에 고정한다. 김짠부가 "답은 늘 2번"으로 패턴을 학습해버려
   프리테스트(호기심 체크) 효과가 죽는다.
2. **문항이 너무 쉬움** — 오답(distractor)이 뻔해서 직관이 틀리는 반전 효과가 약하다.
3. **처음 듣는 용어의 정의를 묻는 문제가 없음** — 개념 이해를 확인하는 축이 빠져 있다.

추가로, 온보딩 근거 영상에 **조회수·구독자수**가 안 보인다는 리포트가 있었으나,
이는 코드 문제가 아니라 **직전 변경 이전에 생성된 아크**를 보고 있어서다(아래 참조).

## 결정 (재litigate 금지)

- 정답 위치는 **결정적 셔플로 분산**한다(프롬프트 지시만으로는 보장 불가). **정답없음·복수정답은
  만들지 않는다** — 정답은 항상 하나, 위치만 다양하게.
- 난이도는 **프롬프트로만** 강화한다(그럴듯한 오답·뻔한 정답 금지). 위치 분산은 셔플이 보장하므로
  프롬프트는 난이도에 집중.
- 용어 정의 문제는 **`hookMode` enum에 `"term"`을 추가**해 별도 종류로 표기한다(정답=정확한 정의,
  오답=그럴듯하지만 틀린 정의).
- 조회수·구독자수는 **이미 반영됨**(직전 작업). 새 아크 생성 시 자동 표시 — 이 스펙에 코드 스텝 없음.

## 설계

### Step 0 — 정답 위치 분산 + 난이도 강화

**신규 순수 헬퍼 `src/lib/onboarding/shuffle.ts`** (I/O·React 없음·throw 0):

```ts
import type { ArcQuestion } from "../../agents/onboarder/schema.js"; // (경로는 기존 관례 따를 것)

/**
 * 문항의 choices를 결정적으로 재배열하고 answerIdx를 재매핑한다.
 *   - 정답은 하나 그대로 — 가리키는 choice의 새 위치를 찾아 answerIdx만 갱신(정답 내용 불변).
 *   - 시드 = 문항 내용(prompt + choices 조인)의 로컬 정수 해시(djb2). 같은 문항 → 항상 같은 순열.
 *     ⇒ fixture replay·테스트가 안정적(Math.random 금지 — replay 비결정성 유발).
 *   - choices < 2면 그대로 반환(방어).
 */
export function shuffleChoices(q: ArcQuestion): ArcQuestion;
```

구현 노트:
- 시드 PRNG는 자체 구현(mulberry32 등 4줄) — 의존성 0. `Math.random`·`Date.now` 사용 금지.
- Fisher-Yates로 인덱스 순열을 만들고, `q.choices[q.answerIdx]`가 이동한 새 인덱스를 `answerIdx`로.
  (동일 문자열 choice가 있으면 인덱스 추적으로 정확히 매핑 — 값 검색이 아니라 위치 순열로 계산.)

**`normalizeArc`(schema.ts) 통합**: 각 문항을 push하기 직전(혹은 완성된 arc 반환 직전)에
`shuffleChoices`를 적용한다. arc가 저장될 때 이미 섞인 인덱스가 되므로 재생·제출·recap이
모두 같은 인덱스를 쓴다(한 곳만 바꿔 전 경로 일관 — "전부 2번"이 코드상 불가능해짐).
- `onboarderMoreStep`도 `normalizeArc`를 거치므로 추가 문항에도 자동 적용된다.
- 이미 저장된 기존 아크는 재정규화하지 않으므로 이중 셔플 없음.

**SYSTEM 프롬프트 난이도 강화**(`ONBOARDER_SYSTEM`, schema.ts): 항목 하나 추가.
- 오답(choices)은 '얼핏 맞아 보이는데 틀린' 그럴듯한 것으로. 뻔한 정답·명백한 오답 금지.
- 직관이 보기 좋게 틀리는 반전 강화(프리테스트 프레이밍과 정렬).
- (위치 분산은 코드가 보장하니 "정답 번호를 섞어라" 같은 지시는 넣지 않아도 되나, 2차 방어로 한 줄 가능.)

**테스트 `tests/onboardingShuffle.test.ts`**:
- 정답 보존: 셔플 후 `choices[answerIdx]` === 원래 정답 choice.
- 결정적: 같은 문항 두 번 셔플 → 동일 결과.
- 위치 이동: 서로 다른 내용의 여러 문항에서 answerIdx가 한 값에 고정되지 않음(분포).
- 방어: choices 2개 미만이면 그대로.
- normalizeArc 통합: 원 raw에서 answerIdx가 전부 같아도 정규화 후 정답 내용이 보존되고 위치가 섞임.

### Step 1 — 처음 듣는 용어 정의 문제

**`hookMode` enum 확장**(schema.ts):
- `ArcHookMode = "reversal" | "practical" | "term"`.
- `HOOK_MODES` 배열에 `"term"` 추가 → `isHookMode`가 자동 흡수(normalizeArc 변경 불필요).

**라벨**: `OnboardingQuiz.tsx`의 `HOOK_LABEL`에 `term: "용어"` 추가.

**SYSTEM 프롬프트 지시**(`ONBOARDER_SYSTEM`, schema.ts): 항목 추가.
- 레퍼런스(자막·videoFacts)에 나온 '처음 들으면 헷갈릴 용어' 1개 이상을 정의 문제로 낸다.
- 정답 = 정확한 정의, 오답 = 그럴듯하지만 틀린 정의. 그 문항의 `hookMode='term'`.
- money-safety 유지(근거 없는 용어·날조 금지).

**테스트 `tests/onboardingTermMode.test.ts`**(또는 기존 onboardingArc.test 확장):
- `hookMode='term'` 문항이 `normalizeArc`를 통과한다(드랍되지 않음).
- (라벨은 순수 로직 아님 — 스냅샷 불필요. HOOK_LABEL에 term 키 존재만 타입으로 보장.)

### 조회수·구독자수 (#3) — 코드 스텝 없음

직전 작업으로 `viewCount`·`subscriberCount`가 `ExternalItem → OnboarderReference →
ArcReference → MustWatchReferences`까지 배선되어 있다(YouTube search가 `videos.list`로 조회수,
`channels.list`로 구독자수를 이미 가져옴). "안 보인다"는 것은 **직전 변경 이전에 생성된 아크**를
보고 있어서다 — 그 아크의 저장된 references엔 카운트가 없다. **새 온보딩을 생성하면** 자동 표시된다.
Step 1 검증 절차에 육안 확인 항목만 둔다.

## 불변식 / 하위호환

- 셔플은 정답 **내용**을 바꾸지 않는다(위치만). 오답/정답의 텍스트·개수 불변.
- 기존 저장된 아크는 재정규화하지 않으므로 영향 0(하위호환).
- `ONBOARDER_SYSTEM` 변경 → `promptHash` 변경 → 기존 onboarder fixture는 replay 미스.
  다음 라이브 생성 시 record로 새로 녹화된다(기존 fixture 워크플로우와 정렬). 유닛 테스트는
  순수 함수 대상이라 영향 없음.
- 마이그레이션 0·의존성 0.

## 범위 밖 (Out of scope)

- 문항↔영상 개별 매핑(데이터에 없음).
- 정답없음/복수정답 문항.
- 조회수·구독자수 백필(기존 아크 소급 적용) — YAGNI, 재생성이면 충분.
- 셔플의 전역 균등 분배(라운드로빈) — 위치가 예측 가능해져 오히려 나쁨. 문항별 독립 결정 셔플로 충분.

## AC

```bash
npm run typecheck
npm test
npm run build
```

각 step 완료 시 `phases/onboarding-question-quality/index.json`의 해당 step을
`completed` + `summary`로 갱신.
