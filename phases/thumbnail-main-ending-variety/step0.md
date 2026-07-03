# Step 0: main-ending-contrast-rule-and-observability (두 메인문구 어미 대비 규칙 + 관측 로깅)

## 읽어야 할 파일

- `docs/specs/2026-07-03-thumbnail-main-ending-variety-design.md` (설계 전문)
- `src/agents/thumbnail_maker/schema.ts` — `thumbnail_main`(정확히 2개)·`THUMBNAIL_MAKER_SYSTEM`(★어투 규칙들이 있는 곳).
- `src/agents/thumbnail_maker/stage.ts` — `thumbnailToCandidates`(생성 후 파생 필드 `topic_missing`·`ref_similarity` 부착 지점 = 로깅 자리).
- `src/agents/thumbnail_maker/topicMissing.ts` — 순수 헬퍼 배치·테스트 패턴 미러(신규 헬퍼를 같은 위치·스타일로).
- `.claude/rules/rules.md`, `CLAUDE.md`, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경

김짠부는 썸네일 상·하단 메인문구 어미를 다르게 쓴다(하나가 `~요`면 다른 하나는 `~요` 안 씀). 현재 생성물은
`thumbnail_main` 2개가 둘 다 `~요`로 끝나 어색하다. **프롬프트 규칙(A)**으로 어미 대비를 지시하고,
**관측 로깅(B)**으로 위반 빈도를 지켜본다(강제 거부·재생성 없음 — 어미는 코드로 의미적 자동수정 불가).

★기존 "명령·권유는 존댓말 종결(~하세요/~됩니다)" 규칙과 충돌 금지 → 규칙은 "`~요` 전면 금지"가 아니라
"**둘 다 `~요`로 끝내지 마라**(하나는 체언·명사/감탄 종결로 대비)".

## 작업

### 1) 순수 헬퍼 `src/agents/thumbnail_maker/mainEndings.ts` (topicMissing.ts 미러)

```ts
/** 두 메인문구가 둘 다 '요'로 끝나는가(어미 단조 검출). 후행 공백·문장부호(?!.…~) 제거 후 판정.
 *   main이 2개 미만이거나 빈 문자열이면 false(방어). 순수·throw 0. */
export function bothMainEndWithYo(main: string[]): boolean;
```

- 정규화: 각 문구 `trimEnd()` 후 후행 문장부호/틸드/공백(`?!.…~` 및 공백류) 제거 → 마지막 글자가 `요`인지.
- 정확히 2개가 모두 `요` 종결일 때만 true. 하나만/둘 다 아님/2개 미만/빈칸 → false.

### 2) 관측 로깅 `stage.ts thumbnailToCandidates`

- 후보 매핑(`out.candidates.map`) 안, `topic_missing` 부착 근처에 한 줄:
  ```ts
  if (bothMainEndWithYo(c.thumbnail_main)) {
    console.warn(`[썸네일 어미] main 2개가 둘 다 '요' 종결(idx=${idx}): ${JSON.stringify(c.thumbnail_main)}`);
  }
  ```
- **강제 거부·재생성·payload 변경 없음** — 관측(로그)만. payload 스키마/타입/UI/계약 전부 불변.

### 3) 프롬프트 규칙 `schema.ts THUMBNAIL_MAKER_SYSTEM`

기존 ★어투 항목들 **바로 뒤에 한 줄 덧붙임**(기존 문장 재작성 금지):
- "★어미 대비: thumbnail_main 두 문구의 어미를 다르게 쓴다 — **둘 다 `~요`로 끝내지 마라**. 하나가
  존댓말 종결(`~하세요/~됩니다/~요`)이면 다른 하나는 체언·명사 종결(예: `정답/손해/필수 시청`)이나 감탄으로
  대비를 준다. 예 ✗ `['지금 사야 해요','손해 봐요']` → ✓ `['지금 사야 해요','결국 손해']`. (김짠부는 상·하단 어미를 다르게 쓴다.)"
- 기존 존댓말 종결·정중-탐문 종결 금지 규칙과 충돌하지 않게(하나는 여전히 존댓말 종결 가능).

## 테스트 `tests/thumbnailMainEndings.test.ts`

- 둘 다 `요` → true: `["지금 사야 해요","손해 봐요"]`.
- 하나만 `요` → false: `["지금 사야 해요","결국 손해"]`.
- 둘 다 아님 → false: `["통장에 돈 묵히면 손해","파킹통장이 정답"]`.
- 후행 문장부호 방어 → true: `["살까요?","팔까요?"]`.
- 2개 미만·빈 문자열 → false 방어.

순수 함수라 스텁 불필요.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드로 판별(rules.md).
2. 체크리스트: 헬퍼 순수·방어되나? 로깅이 **거부/재생성 없이** 로그만인가? payload/스키마 불변인가?
   프롬프트는 **덧붙이기만**(기존 문장 미변경)? 존댓말 종결 규칙과 모순 없나?
3. `git status`로 명세에 없는 신규 파일(fixtures 등) 섞였는지 확인·범위 외 제외(rules.md).
4. `phases/thumbnail-main-ending-variety/index.json` step0을 `completed`+`summary`로 갱신하고 phase status도 `completed`로.

## 금지사항

- 위반 후보를 거부·재생성하지 마라(B는 로깅까지만 — 설계 결정).
- 어미를 코드로 자동 재작성하지 마라(의미적 — 불가·범위 밖).
- `~요` 종결을 전면 금지하지 마라(존댓말 종결 규칙과 충돌 — "둘 다 ~요"만 대상).
- `THUMBNAIL_MAKER_SYSTEM` 기존 문장 재작성 금지(덧붙이기만).
- payload 스키마/타입/UI를 바꾸지 마라(표시 필드 추가 아님 — 로그만).
- `thumbnail_boxes`·로컬생성 스켈레톤 어미는 이번 범위 밖.
- 기존 테스트를 깨뜨리지 마라.
