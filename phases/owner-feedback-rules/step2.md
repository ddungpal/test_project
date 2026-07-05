# Step 2: owner-rules-injection

활성 owner 규칙셋을 훅이(제목)·썸네일 카피 system에 **최우선(맨 마지막 = 마지막 말이 이김)** 으로
주입해 학습 루프를 종결한다. `analogy-learning` step3(analogyStyle 주입)을 미러.

## 읽어야 할 파일

- `docs/specs/2026-07-05-owner-feedback-rules-design.md` — 전체 설계·불변식·주입 순서.
- `phases/owner-feedback-rules/index.json` — step 0·1 summary(`component_type` `title_owner_rules`/`thumbnail_owner_rules`·patterns `{rules, sources}` 구조).
- `src/agents/shared/styleProfile.ts` — `loadActiveTitleStyle`/`appendTitleStyle`·`loadActiveThumbnailStyle`/`appendThumbnailStyle`·`hasUsablePatterns`(export됨)·`ActiveThumbnailStyle`. **미러 대상**.
- `src/agents/shared/analogyStyle.ts` — `loadActiveAnalogyStyle`/`appendAnalogyStyle`(null·빈객체·깨진입력 → 원본 바이트 동일 반환 패턴). **미러 대상**.
- `src/agents/hook_maker/prepare.ts` — system 합성 라인(현재 `appendTitleStyle(appendLearnedInsights(HOOK_MAKER_SYSTEM, learned), titleStyle)` 뒤 persona directive).
- `src/agents/thumbnail_maker/prepare.ts` — system 합성 라인(현재 `appendWinningThumbnailRefs(appendThumbnailStyle(appendLearnedInsights(THUMBNAIL_MAKER_SYSTEM, learned), style), winningRefs)` 뒤 persona directive).
- `tests/analogyStyleInjection.test.ts` — 주입 회귀 테스트 패턴(null→원본·정상→섹션 포함·input 불변). **미러 대상**.

## 작업

### 1. 로더 + append 함수 (styleProfile.ts)
`appendAnalogyStyle`/`appendTitleStyle`를 미러해 추가:

- `loadActiveTitleOwnerRules(supa)` / `loadActiveThumbnailOwnerRules(supa)` — 각 `component_type='title_owner_rules'|'thumbnail_owner_rules'`·`status='active'`·version desc 1행(`loadActiveTitleStyle` 미러·없으면 `null`). 반환에 `rules: string[]`를 담는다(`patterns.rules` 파싱, 방어적).
- `appendTitleOwnerRules(system, ownerRules)` / `appendThumbnailOwnerRules(system, ownerRules)` — 순수함수.
  - `ownerRules`가 `null`이거나 `rules`가 빈 배열/비배열이면 **`system` 원본 그대로 반환**(바이트 동일 → promptHash 불변). `appendAnalogyStyle`의 방어 패턴 그대로.
  - 규칙이 있으면 아래 블록을 `system` **끝에** 덧붙인다:
    ```
    ━━ ⚠️ 김짠부 최우선 지시 (다른 학습 규칙과 충돌하면 무조건 이걸 따른다) ━━
    - {rule1}
    - {rule2}
    ...
    ```
  - evidence용 `style:<id>` 표기가 필요하면 analogyStyle 방식 따르되, 없어도 됨(v1).

### 2. prepare 배선 (hook_maker/prepare.ts)
- `loadActiveTitleOwnerRules(supa)`를 prepare에서 1회 로드.
- system 합성을 **맨 마지막 학습 래퍼**로 감싼다:
  ```ts
  let system = appendTitleOwnerRules(
    appendTitleStyle(appendLearnedInsights(HOOK_MAKER_SYSTEM, learned), titleStyle),
    ownerRules,
  );
  if (targetPersona) system += "\n" + HOOK_PERSONA_DIRECTIVE;
  ```
  즉 owner rules는 insights·title style **뒤**, persona directive **앞**. (persona는 타겟 지시라 그대로 맨 끝 유지.)
- `input`에는 owner rules를 싣지 마라 — **system에만**. 이유: input 오염 시 없을 때 바이트 동일이 깨져 fixture/promptHash가 흔들린다.

### 3. prepare 배선 (thumbnail_maker/prepare.ts)
동일 패턴:
```ts
let system = appendThumbnailOwnerRules(
  appendWinningThumbnailRefs(appendThumbnailStyle(appendLearnedInsights(THUMBNAIL_MAKER_SYSTEM, learned), style), winningRefs),
  ownerRules,
);
if (targetPersona) system += "\n" + THUMBNAIL_PERSONA_DIRECTIVE;
```

### 4. 불변식 (반드시 준수)
- 활성 owner rules 없으면(현재 상태) 훅이·썸네일 `system`/`input` **바이트 동일** → 기존 promptHash·골든 fixture 그대로. 활성화한 뒤에만 변동.
- 로드 실패(조회 error)는 `null`로 처리해 파이프라인을 막지 마라(best-effort — 없으면 base 프롬프트).

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 주입 회귀 테스트 포함
npm run build
```

신규 테스트(`analogyStyleInjection.test.ts` 미러, 최소):
- `appendTitleOwnerRules`/`appendThumbnailOwnerRules`: `null`·빈 rules·깨진 입력 → 원본 **바이트 동일**. 정상 규칙 → "김짠부 최우선 지시" 헤더 + 각 규칙 포함, 그리고 규칙 블록이 title/thumbnail style 블록 **뒤**에 위치.
- prepare 회귀: active owner rules 없을 때(fake supa `null`) `system === (기존 합성 결과)`·`input` 불변. 있을 때 헤더 포함·input 불변.
- 기존 hook_maker/thumbnail_maker fixture·promptHash 회귀가 깨지지 않음(`npm test` 전체 초록).

## 검증 절차

1. 위 AC 실행. 특히 `git status`로 `fixtures/`가 무변경인지 확인(active 프로필 없으므로 promptHash 불변이어야 함).
2. 체크리스트: owner rules가 insights·style **뒤**, persona **앞**에 오는가? input에 안 실렸는가? null 방어로 없을 때 바이트 동일인가?
3. `phases/owner-feedback-rules/index.json`의 step 2 갱신(completed+summary / error / blocked).

## 금지사항

- owner rules를 `input`에 싣지 마라. 이유: 없을 때 바이트 동일이 깨져 fixture/promptHash가 흔들린다.
- owner rules를 insights·style **앞**에 두지 마라. 이유: "최우선(마지막 말이 이김)" 설계가 무너진다. 반드시 학습 래퍼 중 가장 바깥(persona 직전).
- 로드 실패를 throw로 파이프라인을 막지 마라. 이유: 없으면 base로 돌아야 한다(best-effort).
- 훅이/썸네일 SCHEMA·후처리 가드·persona directive 내용을 바꾸지 마라. 이유: 이 step은 주입 배선만.
- fixture를 손으로 재기록하지 마라(active 프로필 0이면 변할 리 없음). `fixtures/`가 바뀌면 배선이 불변식을 어긴 것 — 원인부터 고쳐라.
- 기존 테스트를 깨뜨리지 마라.
