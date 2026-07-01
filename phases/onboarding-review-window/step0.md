# Step 0: visibility-predicate

쏙이(온보딩 튜터)의 노출 창을 넓히는 기능의 **도메인 술어**만 만든다. 현재 쏙이 섹션은 `run.state === "thumbnails_selected"` 한 상태에서만 뜬다. 이걸 **`thumbnails_selected`부터 `published`까지 파이프라인 전 구간**으로 넓히기 위한 순수 술어를 도메인 레이어에 추가한다. 이 step은 UI를 건드리지 않는다 — 술어 + 단위 테스트만.

## 배경 (왜 넓히나)

쏙이는 구다리(구성) 진입 *직전*(`thumbnails_selected`)에 "궁금증 아크" 퀴즈로 김짠부를 주제에 올려놓고, 그 부산물(금맥)을 구다리 프롬프트에 주입한다. 사용자 요구: **구성 이후에도 복습용으로 쏙이를 다시 열 수 있게** 하고, 아크가 아직 없는 옛 런은 뒤늦게 생성도 허용(혼합). 그 첫 벽돌이 "어느 상태에서 섹션을 보일지"를 판정하는 순수 술어다. live/review 모드 분기와 카피는 step 1(UI)에서 한다.

## 읽어야 할 파일

먼저 아래를 읽고 아키텍처·설계 의도·컨벤션을 파악하라:

- `src/domain/enums.ts` — **이 step의 유일한 수정 대상.** `RUN_STATES` 배열(파이프라인 상태 순서 + 트레일링 비파이프라인 상태 `paused_soft_cap`·`aborted`)과 `ALLOWED_TRANSITIONS`를 확인하라. 상태 순서의 단일 출처다.
- `tests/onboardingArc.test.ts` — 온보딩 순수 헬퍼 테스트 스타일(참고).
- `ARCHITECTURE.md` — 디렉토리 계층 지도.

## 작업

`src/domain/enums.ts`에 순수 술어 하나를 추가한다:

```ts
// 쏙이 온보딩 섹션 노출 창: thumbnails_selected(구성 직전) ~ published(파이프라인 끝) 전 구간.
// thumbnails_selected = live(금맥 주입), 그 이후 = review(복습/뒤늦은 재생성). 카피 분기는 UI(step 1).
export function isOnboardingVisible(state: RunState): boolean;
```

규칙:

- 판정 기준 = **`RUN_STATES` 배열에서 `thumbnails_selected`의 인덱스 이상, `published`의 인덱스 이하**인 상태만 `true`.
- 트레일링 비파이프라인 상태 `paused_soft_cap`·`aborted`는 배열 끝(published 뒤)에 있으므로 **인덱스 구간 밖 → 자연히 false**가 되어야 한다. 인덱스 비교로 구현하면 별도 예외 처리 없이 걸러진다. **`RUN_STATES` 순서에 의존하되, 하드코딩된 상태 이름 나열로 구간을 표현하지 마라. 이유: 파이프라인에 상태가 추가되면 나열 목록이 stale해진다 — `indexOf('thumbnails_selected')`~`indexOf('published')` 인덱스 구간으로 표현해 배열이 단일 출처가 되게 하라.**
- 순수 함수. throw 0. 알 수 없는 문자열이 와도(타입상 불가하지만) false로 안전.

## Acceptance Criteria

```bash
npm run typecheck   # 컴파일 에러 없음
npm test            # 신규 tests/onboardingVisibility.test.ts 포함 전부 통과
npm run build       # 빌드 성공
```

신규 `tests/onboardingVisibility.test.ts` 작성:

- `true`여야 하는 상태: `thumbnails_selected`, `structure_proposed`, `structure_selected`, `research_review`, `scripting`, `script_review`, `approved`, `published`.
- `false`여야 하는 상태: `created`, `topic_proposed`, `titles_selected`, `thumbnails_proposed`(구성 직전 상태 *이전*), `aborted`, `paused_soft_cap`.
- 경계값을 명시적으로 검사하라: `thumbnails_proposed`=false(경계 바로 아래), `thumbnails_selected`=true(하단 경계), `published`=true(상단 경계).

## 검증 절차

1. 위 AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 순수 도메인 술어가 `src/domain/enums.ts`에 있는가(다른 파일 신설 안 함).
   - 새 의존성·마이그레이션 추가 안 했는가(이 step은 순수 코드만).
   - CLAUDE.md 보안 규칙 위반 없는가.
3. 결과에 따라 `phases/onboarding-review-window/index.json`의 step 0을 갱신:
   - 성공 → `"completed"` + `"summary"`(추가한 술어 시그니처·경계 규칙·테스트 수).
   - 3회 시도 실패 → `"error"` + `"error_message"`.

## 금지사항

- **UI·page.tsx·컴포넌트를 건드리지 마라. 이유: 이 step은 도메인 술어만.** 게이트 교체·mode·카피 분기는 step 1.
- **구간을 상태 이름 나열(예: `["thumbnails_selected","structure_proposed",...]`)로 하드코딩하지 마라. 이유: `RUN_STATES`에 상태가 추가되면 stale해진다 — 인덱스 구간으로 표현하라.**
- **`ALLOWED_TRANSITIONS`나 `RUN_STATES` 배열 자체를 수정하지 마라. 이유: 노출 창은 상태 *판정*이지 상태 머신 변경이 아니다 — 배열은 읽기만.**
- 기존 테스트를 깨뜨리지 마라.
