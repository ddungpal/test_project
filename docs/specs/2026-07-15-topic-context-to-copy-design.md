# 주제 근거를 제목·썸네일에 연결 (topic-context-to-copy)

_2026-07-15 · 설계(brainstorming 확정)_

## 문제

촉이(주제 발굴)는 주제마다 **풍부한 맥락**을 생성한다 (`src/agents/topic_scout/schema.ts` `TopicCandidateOut`):
- `title` — 주제 한 줄
- `reason` — 왜 이 주제인가 (각도·근거. 촉이 프롬프트가 "어떤 경쟁영상이 이 각도를 뒷받침하는지"를 여기 서술하게 함 → **evidence 내러티브 포함**)
- `audience_need` — 그 시청자가 지금 뭘 원하는지 (한 줄)
- `audience_level` — 입문/초급/중급/고급
- `target_persona` — 대상 사람 한 줄
- `evidence_ids` — 뒷받침 신호 id

그런데 **제목(훅이)·썸네일(썸네일메이커)은 주제 payload에서 `title` + `target_persona`만 읽는다**:
- `src/agents/hook_maker/prepare.ts:22-23` — `topicPayload as { title?, target_persona? }`, `topic = topicPayload.title`
- `src/agents/thumbnail_maker/prepare.ts:26-27` — 동일

→ `reason`·`audience_need`·`audience_level`·`evidence`가 **전부 버려진다**. 제목·썸네일이 "주제 한 줄 문자열"을 김짠부 시그니처로 재작성하는 것에 가깝고, 촉이가 찾은 **"왜 이 각도인지·시청자가 뭘 답답해하는지"** 와 논리적으로 이어지지 않는다.

## 목표

주제의 `reason`·`audience_need`·`audience_level`을 **제목·썸네일 생성에 연결**해, 카피가 시청자 니즈를 조준하고 주제의 각도를 계승하게 한다. 단 **김짠부 말투·시그니처는 최우선 유지**.

## 설계

### 주입 데이터 — "주제 맥락 번들"

훅이·썸네일 prepare가 주제 payload에서 **추가로 읽어** input에 조건부로 싣는다(데이터는 이미 존재 → 새 생성 0):
- `reason`, `audience_need`, `audience_level` (셋 다 payload의 문자열)
- **evidence 처리**: raw `evidence_ids`는 신호 id일 뿐이고 원신호(경쟁영상 제목·댓글 키워드)는 런 단위로 영속화돼 있지 않아 title 단계에서 텍스트로 되짚을 수 없다. 대신 **`reason`이 evidence 내러티브를 담고** 있고, 제목·썸네일이 이미 받는 **`reference_titles_external`(고조회 유튜브 제목)**이 트렌드를 커버한다. 따라서 evidence는 "reason 서술 + 외부 고조회 제목을 이 각도의 근거로 명시 연결"로 실현한다(raw 신호 영속화·해석은 비목표).

### 훅이 (hook_maker)

- `prepare.ts`: `topicPayload`에서 `reason`·`audience_need`·`audience_level`을 읽어 `HookMakerInput`에 옵셔널 필드로 추가. **있을 때만** 싣는다.
- `HOOK_MAKER_SYSTEM`에 지시 추가(강한 권고):
  - 제목은 `audience_need`(시청자가 지금 답답해하는 것)를 **정면으로 조준**한다(강한 권고).
  - `reason`의 각도를 살린다(촉이가 이 주제를 고른 이유가 제목에 드러나게).
  - `audience_level`에 어휘·구체성을 맞춘다(입문=쉬운 개념, 고급=구체 전략).
  - `reference_titles_external`은 이 각도를 뒷받침하는 **근거로만** 참고(표현 모방 금지 — 기존 규칙 유지).
  - ★ **역할 분담 명시**: 김짠부 **말투·시그니처는 여전히 최우선**이다. 주제 근거는 "무엇을 말할지(내용·각도)"를 조준하고, 시그니처는 "어떻게 말할지(어투)"를 지배한다. 충돌 시 **말투·시그니처가 이긴다**.

### 썸네일 (thumbnail_maker)

- `prepare.ts`: 동일하게 `reason`·`audience_need`·`audience_level`을 `ThumbnailMakerInput`에 옵셔널 추가.
- `THUMBNAIL_MAKER_SYSTEM`에 동일 맥락 지시(강한 권고) + "메인문구·박스는 `audience_need`의 답답함을 건드린다". 시그니처·상하단 골격 등 기존 최우선 규칙은 그대로 유지.

### 불변식

- 주제 맥락 필드가 없으면(옛 런·필드 부재) **주입하지 않는다** → `input`·`system` 바이트 불변 → **promptHash·fixture 보존**(기존 persona 조건부 주입 패턴 그대로).
- 데이터는 payload에 이미 있음 → **마이그레이션 0·새 생성 0**.
- 스키마·후처리 로직 무변경. 프롬프트 지시 + prepare 몇 줄만. 주제 맥락이 있는 런은 promptHash 변경 → 훅이·썸네일 fixture 재기록(정상·의도된 것).
- **강제 거부 없음** — 프롬프트 강한 권고만. `titleSignature` 등 기존 사후 안전망은 그대로.

### 스코프

- 제목(훅이) + 썸네일(썸네일메이커) 둘 다.
- 회귀 가드 테스트: (1) 주제 맥락 있으면 input·system에 주입 (2) 없으면 바이트 불변 (3) 프롬프트에 "audience_need 조준·시그니처 최우선" 문구 존재.

## 비목표 (YAGNI)

- raw `evidence_id` → 신호 텍스트 해석/영속화 (reason·외부 refs와 중복·범위 과함).
- 강제 거부/재생성 로직 (강한 권고만).
- 온보딩 금맥 주입 (훅이가 온보딩 단계보다 앞서 돌아 정방향 불가 — 별건).
- 앵글 종류 확장, titleSignature 강제화 등 (이번 범위 밖).

## 구현 단서

- 기존 조건부 주입 패턴 미러: `hook_maker/prepare.ts`의 `target_persona`·`learned_insights`·`style_profile` 주입 방식(있을 때만 input 키 추가)을 그대로 따른다.
- 프롬프트 지시는 별도 상수(예: `HOOK_TOPIC_CONTEXT_DIRECTIVE`)로 두거나 `HOOK_MAKER_SYSTEM` 본문에 추가 — 단 "없으면 바이트 불변" 불변식과 충돌하지 않게 **input 주입은 조건부**(system 본문 지시는 항상 있어도 되나, 그러면 promptHash가 전 런에서 바뀜). → **지시문도 주제 맥락 있을 때만 append**하는 게 fixture 보존에 안전(persona 패턴처럼).
