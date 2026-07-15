# Step 0: hook-topic-context

## 배경 (자기완결 — 이 phase의 목적)

전체 설계: `docs/specs/2026-07-15-topic-context-to-copy-design.md` (읽어라).

촉이(주제)는 주제마다 풍부한 맥락을 만든다(`reason`=왜/각도, `audience_need`=시청자 니즈, `audience_level`=수준, `target_persona`, `evidence_ids`). 그런데 **훅이(제목)는 주제 payload에서 `title`+`target_persona`만 읽고** `reason`·`audience_need`·`audience_level`을 버린다 → 제목이 "주제 한 줄"에서 재작성될 뿐 시청자 니즈·각도와 안 이어진다.

이 step은 **훅이(제목)**에 주제 맥락(`reason`·`audience_need`·`audience_level`)을 연결한다. 썸네일은 step 1(미러).

## 읽어야 할 파일

- `docs/specs/2026-07-15-topic-context-to-copy-design.md` — 설계 정본(불변식·역할분담·비목표).
- `src/agents/hook_maker/prepare.ts` — 수정 대상. **조건부 주입 패턴**(`target_persona`·`learned_insights`·`style_profile`을 있을 때만 input에 싣고, system을 append 체인으로 합성하는 방식)을 그대로 미러할 것. system 합성 순서(learned→style→owner→persona)와 "없으면 바이트 불변" 주석을 정독.
- `src/agents/hook_maker/schema.ts` — `HookMakerInput` 인터페이스 + `HOOK_MAKER_SYSTEM`. 조건부 append 상수(`HOOK_PERSONA_DIRECTIVE` 등) 패턴 참고.
- `src/agents/topic_scout/schema.ts` — `TopicCandidateOut`(주제 payload가 담는 `reason`·`audience_need`·`audience_level` 타입 확인).
- `tests/`의 훅이 관련 테스트(예: `hookPersonaWiring.test.ts`) — 조건부 주입·바이트 불변 회귀 가드 패턴.

## 작업

### 1) `schema.ts` — 입력 필드 + 지시 상수

`HookMakerInput`에 옵셔널 필드 추가(있을 때만 실림 → 없으면 바이트 불변):
```ts
topic_reason?: string;         // 주제의 reason(왜/각도·evidence 내러티브 포함)
audience_need?: string;        // 시청자가 지금 뭘 원하는지
audience_level?: string;       // 입문/초급/중급/고급
```
신규 상수 `HOOK_TOPIC_CONTEXT_DIRECTIVE`(별도 export·`HOOK_PERSONA_DIRECTIVE` 패턴):
- 제목은 `audience_need`(시청자가 지금 답답해하는 것)를 **정면으로 조준**한다 — **강한 권고**(강제 아님).
- `topic_reason`의 각도를 살린다(촉이가 이 주제를 고른 이유가 제목에 드러나게).
- `audience_level`에 어휘·구체성을 맞춘다(입문=쉬운 개념, 고급=구체 전략).
- `reference_titles_external`(외부 고조회 제목)은 이 각도를 뒷받침하는 근거로만 참고(표현 모방 금지 — 기존 규칙 유지).
- ★ **역할 분담(필수 명시)**: 김짠부 **말투·시그니처가 여전히 최우선**이다. 주제 근거는 '무엇을 말할지(내용·각도)'를 조준하고, 시그니처는 '어떻게 말할지(어투)'를 지배한다. **충돌 시 말투·시그니처가 이긴다.**

### 2) `prepare.ts` — 조건부 배선

- `topicPayload`를 `{ title?, target_persona?, reason?, audience_need?, audience_level? }`로 확장해 읽는다(같은 payload·별도 조회 없음).
- `reason`·`audience_need`·`audience_level`이 있으면 `input.topic_reason`/`input.audience_need`/`input.audience_level`에 싣는다. **하나도 없으면 input에 키를 추가하지 않는다**(바이트 불변).
- system 합성: **주제 맥락 중 하나라도 있으면** `HOOK_TOPIC_CONTEXT_DIRECTIVE`를 append한다. 위치는 **base(`HOOK_MAKER_SYSTEM`) 직후·기존 learned/style/owner 체인보다 안쪽**(= 시그니처·스타일·owner 규칙이 우선순위상 뒤=위에 남게). 주제 맥락이 하나도 없으면 지시문도 **append하지 않는다**(system 바이트 불변 → promptHash·fixture 보존).

**핵심 규칙(불변식):**
- 주제 맥락 필드가 하나도 없으면 `input`·`system` **바이트 불변** → 기존 promptHash·fixture 보존(persona 패턴과 동일). 이게 깨지면 안 된다.
- 강제 거부/재생성 로직 만들지 마라 — **프롬프트 강한 권고만**.
- `HOOK_MAKER_SYSTEM` 본문·`HOOK_MAKER_SCHEMA`·기존 상수를 바꾸지 마라(주제 맥락 지시는 신규 별도 상수).
- 마이그레이션·새 데이터 생성 금지(데이터는 payload에 이미 있음).

### 3) 회귀 테스트

`tests/hookTopicContext.test.ts`(또는 기존 훅이 wiring 테스트 확장):
- 주제 맥락 있으면 `input`에 필드 실리고 `system`에 지시문 포함.
- 주제 맥락 없으면 `input`·`system` 바이트 불변(기존과 동일).
- `HOOK_TOPIC_CONTEXT_DIRECTIVE`에 "audience_need 조준(강한 권고)"·"시그니처 최우선"·"충돌 시 시그니처" 문구 존재.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.
- 라이브 제목 품질은 AC 아님(머지 후 실런) — 배선·불변식·문구는 위 테스트로.

## 검증 절차

1. AC 실행.
2. 불변식 확인: 주제 맥락 없는 경로가 바이트 불변인지(테스트). git diff가 `hook_maker/schema.ts`·`prepare.ts`·테스트만 잡히는지.
3. 썸네일(`thumbnail_maker`)은 이 step에서 **미변경**(step 1).
4. `git status`로 범위 외 untracked(fixtures 등) 제외.
5. `phases/topic-context-to-copy/index.json` step 0 갱신(완료 → completed + summary / 실패 → error).

## 금지사항

- `thumbnail_maker`를 이 step에서 건드리지 마라(step 1). 이유: 모듈별 scope 분리.
- "없으면 바이트 불변" 불변식을 깨지 마라(지시문·input 둘 다 조건부).
- 강제 거부·시그니처 최우선 원칙 훼손 금지(강한 권고만·시그니처 top 유지).
- `HOOK_MAKER_SYSTEM` 본문 수정 금지(신규 상수로). 마이그·의존성 금지. 기존 테스트 깨뜨리지 마라.
