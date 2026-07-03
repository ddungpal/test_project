# Step 0: answer-shuffle-and-difficulty (정답 위치 분산 + 난이도 강화)

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-question-quality-design.md` (설계 전문 — Step 0 절)
- `src/agents/onboarder/schema.ts` — `ArcQuestion`(prompt·choices·answerIdx·difficulty·hookMode·ahaReveal)·
  `normalizeArc`(문항 방어·정규화)·`ONBOARDER_SYSTEM`(생성 시스템 프롬프트).
- `src/lib/onboarding/playback.ts` — 재생/정오 판정이 `answerIdx`를 어떻게 쓰는지(셔플 후에도 일관해야 함).
- `.claude/rules/rules.md` — vitest `@/` alias 함정(순수 헬퍼는 컴포넌트 아닌 `src/lib/**`에)·JSON 크래시 주의.
- `CLAUDE.md`, `.claude/rules/` 전체, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경

쏙이 문항의 정답이 전부 같은 번호(2번)에 몰려 김짠부가 패턴을 학습해버린다. 프롬프트 지시만으로는
분산이 보장되지 않으므로 **결정적 셔플**로 위치를 분산한다(정답은 하나 그대로, 위치만 이동).
동시에 문항을 조금 더 어렵게(그럴듯한 오답) 프롬프트로 강화한다.

## 작업

### 1) 신규 순수 헬퍼 `src/lib/onboarding/shuffle.ts`

I/O·React 없음. `Math.random`·`Date.now` 사용 **금지**(replay 비결정성 유발).

```ts
import type { ArcQuestion } from "@/agents/onboarder/schema"; // (기존 src/lib/onboarding/*.ts의 schema import 방식과 동일하게 — 상대경로 vs alias 확인)

/**
 * choices를 결정적으로 재배열하고 answerIdx를 재매핑한다(정답 내용 불변·위치만 이동).
 *   - 시드 = 문항 내용(prompt + "" + choices.join(""))의 로컬 정수 해시(djb2).
 *   - Fisher-Yates(시드 PRNG=mulberry32 등 자체 4줄)로 인덱스 순열 생성 → answerIdx가 가리키던
 *     위치가 이동한 새 인덱스를 찾아 answerIdx로 세팅(값 검색이 아니라 위치 순열로 추적).
 *   - choices.length < 2면 그대로 반환(방어). unverifiedNumbers/cliffhanger 등 다른 필드 보존.
 */
export function shuffleChoices(q: ArcQuestion): ArcQuestion;
```

규칙:
- 같은 문항을 두 번 셔플하면 **반드시 동일 결과**(결정적). 서로 다른 문항은 서로 다른 순열 경향.
- 정답 하나만 존재(정답없음·복수정답 없음) — `choices[결과.answerIdx]`가 원래 `choices[q.answerIdx]`와
  같은 문자열이어야 한다(값이 아니라 위치로 추적하되, 검증은 값으로).
- 순수·throw 0·입력 비변형(새 객체 반환).

### 2) `normalizeArc`(schema.ts) 통합

각 문항이 최종 `ArcQuestion`으로 완성된 뒤(범위·enum 검증 통과 후) `shuffleChoices`를 적용해
questions에 담는다. → arc 저장 시 이미 섞인 인덱스. 재생·제출·recap 전 경로가 이 인덱스를 쓴다.
- `onboarderMoreStep`도 normalizeArc를 거치므로 추가 문항에 자동 적용(추가 배선 불필요).
- 순환 import 주의: `shuffle.ts`가 schema의 **타입만** import(`import type`)하고 schema가 shuffle의
  함수를 import → 값/타입 분리로 순환 안전한지 확인(안 되면 shuffle의 타입을 로컬 정의하거나 구조를 조정).

### 3) SYSTEM 프롬프트 난이도 강화 (`ONBOARDER_SYSTEM`, schema.ts)

기존 항목 톤을 유지하며 한 항목(또는 한 줄) 추가:
- 오답(choices)은 '얼핏 맞아 보이는데 틀린' 그럴듯한 것으로 구성. 뻔한 정답·명백한 오답 금지.
- 직관이 보기 좋게 틀리는 반전을 강화(프리테스트 프레이밍과 정렬).
- ★기존 문장을 재작성하지 말고 **덧붙이기**만(다른 규칙 훼손 금지). 시스템 프롬프트가 바뀌면
  promptHash가 바뀌어 기존 onboarder fixture는 replay 미스가 되는데, 이는 의도된 것(다음 라이브 생성 시 record).

## 테스트 `tests/onboardingShuffle.test.ts`

- **정답 보존**: 여러 문항에서 셔플 후 `choices[answerIdx]`가 원래 정답 문자열과 동일.
- **결정적**: 같은 문항 2회 셔플 → deepEqual.
- **위치 이동/분포**: 원 raw가 answerIdx 전부 동일(예: 다 0)인 문항 세트를 셔플하면 결과 answerIdx가
  한 값에 고정되지 않음(최소 2개 이상의 서로 다른 인덱스 등장 — 결정적이라 기대값을 고정 assert 가능).
- **방어**: choices 1개면 그대로 반환.
- **normalizeArc 통합**: 원 raw questions(answerIdx 다 같음)를 normalizeArc에 넣으면 정답 내용은
  보존되고 위치가 섞임을 검증.

순수 함수라 스텁 불필요. (함수 주입 스텁이 필요하면 `vi.fn` 아닌 impl+카운터 — rules.md.)

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드로 판별(rules.md).
2. 체크리스트: 셔플이 순수·결정적인가? `Math.random`/`Date.now` 없나? 정답 하나 보존되나?
   normalizeArc 한 곳만 바꿔 재생·제출·recap이 일관되나(중복 셔플 없나)? 프롬프트는 **덧붙이기**만 했나?
3. `git status`로 명세에 없는 신규 untracked(fixtures·docs 등)가 섞였는지 확인, 범위 외 제외(rules.md).
4. `phases/onboarding-question-quality/index.json` step0을 `completed`+`summary`로 갱신.

## 금지사항

- `Math.random`/`Date.now`로 셔플하지 마라(replay 비결정성).
- 재생/제출/recap 각각에서 따로 셔플하지 마라 — normalizeArc 한 곳(저장 전)만.
- 정답없음·복수정답 문항을 만들지 마라(설계 결정). 정답은 하나·위치만 이동.
- `ONBOARDER_SYSTEM` 기존 문장을 재작성하지 마라(덧붙이기만).
- `hookMode='term'`은 이 step 범위 아님(step1).
- 기존 테스트를 깨뜨리지 마라.
