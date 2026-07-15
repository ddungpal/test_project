# Step 1: thumbnail-topic-context

## 배경 (자기완결)

전체 설계: `docs/specs/2026-07-15-topic-context-to-copy-design.md`.

step 0에서 훅이(제목)에 주제 맥락(`reason`·`audience_need`·`audience_level`)을 연결했다. 이 step은 **썸네일(썸네일메이커)**에 **동일하게** 연결한다(같은 갭·같은 메커니즘). 썸네일은 지금 주제 payload에서 `title`+`target_persona`만 읽고 나머지를 버린다(`thumbnail_maker/prepare.ts:26-27`).

## 읽어야 할 파일

- `docs/specs/2026-07-15-topic-context-to-copy-design.md` — 설계 정본.
- `phases/topic-context-to-copy/step0.md` + **step 0이 만든 `src/agents/hook_maker/{schema,prepare}.ts` 변경** — 이 step은 그걸 **미러**한다(같은 필드·같은 불변식·같은 조건부 주입).
- `src/agents/thumbnail_maker/prepare.ts` — 수정 대상. 기존 조건부 주입 패턴(`target_persona`·`learned_insights`·`style_profile`·`winning_refs`)과 system 합성 순서(learned→style→winning→owner→persona)를 정독.
- `src/agents/thumbnail_maker/schema.ts` — `ThumbnailMakerInput` + `THUMBNAIL_MAKER_SYSTEM` + 조건부 상수(`THUMBNAIL_PERSONA_DIRECTIVE` 등) 패턴.
- `tests/`의 썸네일 관련 테스트(예: `thumbnailPersona.test.ts`) — 회귀 가드 패턴.

## 작업

훅이(step 0)와 **동일 구조**로 썸네일에 배선한다:

### 1) `schema.ts`
`ThumbnailMakerInput`에 옵셔널 `topic_reason?`/`audience_need?`/`audience_level?` 추가. 신규 상수 `THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE`:
- 썸네일 **메인문구·박스**는 `audience_need`(시청자가 답답해하는 것)를 **정면으로 건드린다** — 강한 권고.
- `topic_reason`의 각도를 살리고, `audience_level`에 맞춘다.
- ★ **역할 분담**: 김짠부 썸네일 **시그니처·상하단 골격·어미 규칙 등 기존 최우선 규칙이 여전히 우선**. 주제 근거는 '무엇을 담을지(내용)'를 조준하고, 시그니처·골격은 '어떻게 쓸지'를 지배한다. **충돌 시 시그니처·골격이 이긴다.**

### 2) `prepare.ts`
- `topicPayload`를 확장해 `reason`·`audience_need`·`audience_level`을 읽어 `input`에 조건부로 싣는다(있을 때만).
- 주제 맥락 중 하나라도 있으면 `THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE`를 system에 append(위치는 base 직후·기존 learned/style/winning/owner 체인보다 안쪽 — 시그니처·골격·owner가 우선순위상 위에 남게). 하나도 없으면 **input·system 바이트 불변**.

**핵심 규칙(불변식):**
- 주제 맥락 없으면 `input`·`system` **바이트 불변** → promptHash·fixture 보존.
- 강제 거부 없음(강한 권고만). 썸네일 시그니처·골격·어미 등 기존 규칙 훼손 금지.
- `THUMBNAIL_MAKER_SYSTEM` 본문·스키마·기존 상수 무변경(신규 별도 상수).
- 마이그·새 데이터 생성 금지(payload에 이미 있음).
- `selected_title` 등 기존 입력·winning refs 체인은 그대로 둔다.

### 3) 회귀 테스트
`tests/thumbnailTopicContext.test.ts`(또는 기존 확장):
- 주제 맥락 있으면 input·system 주입 / 없으면 바이트 불변.
- `THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE`에 "audience_need 건드림·시그니처/골격 최우선" 문구 존재.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.

## 검증 절차

1. AC 실행.
2. 불변식 확인(주제 맥락 없으면 바이트 불변). git diff가 `thumbnail_maker/schema.ts`·`prepare.ts`·테스트만 잡히는지. hook_maker(step 0)는 이 step에서 미변경.
3. `git status`로 범위 외 untracked 제외.
4. `phases/topic-context-to-copy/index.json` step 1 갱신(완료 → completed + summary / 실패 → error).

## 금지사항

- hook_maker(step 0 산출물)를 이 step에서 바꾸지 마라(미러만·별개 모듈).
- "없으면 바이트 불변" 불변식·시그니처/골격 최우선 훼손 금지.
- `THUMBNAIL_MAKER_SYSTEM` 본문·스키마·`selected_title`/winning refs 로직 무변경.
- 강제 거부·마이그·의존성 금지. 기존 테스트 깨뜨리지 마라.
