# 설계: 타겟 페르소나 (target_persona) — 주제별 시청 대상 명시 → 구성·스크립트 구체화

_작성: 2026-07-01 · 상태: 설계 승인(구현 대기)_

## 문제

콘텐츠에 **명확한 시청 타겟이 없다.** "이 영상은 2030 사회초년생을 위한 것" /
"자녀계좌를 공부하는 부모를 위한 것"처럼 **누구에게 말하는지**가 정해져야 같은 주제라도
전달 내용·예시·어휘가 달라지고 스크립트가 구체화되는데, 그 축이 비어 있다.

현황(확인 완료):
- 촉이(topic_scout)는 후보마다 `audience_level`(입문/초급/중급/고급 = **전문성 수준**)과
  `audience_need`(그 수준의 욕구 한 줄)를 생성한다. 그러나 이는 **"얼마나 아는가"**일 뿐,
  **"누구/어떤 상황인가"**(페르소나)가 아니다.
- 게다가 그 audience 신호조차 **구성(구다리)·스크립트(짠펜)로 전달되지 않는다.**
  촉이가 만들어 UI(`CandidateBody`)에 표시만 하고, 주제 선택 시점에 사라진다.
  (`structurer/prepare.ts`·`scriptCell.ts` 어디에도 audience 참조 없음.)

→ 타겟이 스크립트를 구체화하지 못한다.

## 결정 (사용자 확정)

- **(B) 주제 먼저, 타겟은 따라옴**: 타겟을 먼저 정해 주제를 끌어내는 게 아니라, 촉이가 신호로
  주제 후보를 내되 **각 후보에 "이건 누구를 위한 것"(페르소나)을 함께 제안**. 김짠부는 주제+타겟을
  같이 보고 선택하고, 필요하면 타겟을 손질한다. ("김짠부는 선택만" 원칙·현 흐름과 일치.)
- **(가) 한 줄 페르소나 (자유 텍스트)**: 구조체가 아니라 한 문장. 예: `"2030 사회초년생, 첫 월급
  목돈 굴리기 막막한 사람"`. 김짠부가 읽고 고치기 쉽다.
- **(ㄱ) 기존 수준과 병존**: `audience_level`(전문성 축)은 그대로 두고, 페르소나(사람 축)를
  옆에 **추가**한다. 서로 다른 축이라 흡수하지 않는다.
- **전파 = 구성 + 스크립트 2곳만**: 리서치·제목/썸네일은 보류(YAGNI — 효과 보고 fast-follow).
- **인라인 편집 v1 포함**: 김짠부가 선택한 주제의 페르소나를 손질할 수 있다(촉이의 추정이
  빗나가면 고친다).

## 설계 상세

### 데이터 모델

`target_persona: string`(한 줄)를 **주제 후보 payload 안에** 둔다. **새 컬럼·테이블 없음** —
기존 `stage_proposals.candidates`(JSON)·`stage_selections`에 그대로 실린다. 마이그레이션 0.

전파는 기존 배선을 그대로 탄다:
- `getSelectedStagePayload(supa, runId, "topic")`이 선택된 주제 payload를 반환하며,
  **`edited_payload`가 있으면 그것을 우선** 반환한다(사람 수정본 우선 — `context.ts` 확인).
  → 편집한 페르소나가 자동으로 다운스트림에 흐른다(추가 배선 0).

### A. 생성 — 촉이 (topic_scout)

- `src/agents/topic_scout/schema.ts`:
  - `TopicCandidate` 타입에 `target_persona: string` 추가.
  - JSON 스키마 candidate의 `required`에 `"target_persona"` 추가 + `properties.target_persona =
    { type: "string", minLength: 1 }`. (기존 `audience_need`와 동일 등급 — required string은
    forced tool_use에서 안전; 배열 아님이라 "빈 배열 required 금지" 함정 비해당.)
- `TOPIC_SCOUT_SYSTEM`: 후보마다 **누구 + 상황 + 막막함/욕구**를 한 줄 페르소나로 쓰라고 지시.
  - 예시 2개 주입: `"2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람"` /
    `"자녀계좌 만들려는 30·40대 부모, 증여세·절차 헷갈리는 사람"`.
  - `audience_need`(욕구 한 줄)와 **차이 명시**: persona=대상 사람의 정의, need=그 사람의 욕구.
- **`src/agents/topic_scout/stage.ts`의 `toCandidates`(핵심 배선)**: 현재
  `payload: { title, audience_level, audience_need }`로 매핑한다 →
  **`target_persona: c.target_persona`를 payload에 추가**해야 선택 시 저장되고 다운스트림이 읽는다.
  (이 줄을 빼면 LLM이 생성해도 payload에 안 실려 전파가 끊긴다 — audience_level/need가 이미 이
  방식으로 보존되고 있음.)
- 영향: topic_scout promptHash 변경 → 다음 라이브 런에서 픽스처 자동 재기록(claude-p $0).

### B. 전파 — 구다리 (structurer) · 짠펜 (scribe) · **조건부 주입**

**불변식:** persona가 **있을 때만** input/system에 주입한다. 없으면(옛 주제/런) input·system
바이트 동일 → promptHash 보존 → 기존 구다리·짠펜 픽스처 안 깨짐. (메모리 함정 "픽스처 보존 =
조건부 주입" 준수.)

- **구다리** `src/agents/structurer/prepare.ts`:
  - 이미 `getSelectedStagePayload("topic")`로 주제를 읽는다 → 같은 payload에서
    `target_persona`도 꺼낸다(타입은 `{ title?: string; target_persona?: string }`).
  - `StructurerInput`에 `target_persona?: string`(옵셔널) 추가, persona 있을 때만 세팅.
  - `STRUCTURER_SYSTEM`에 지시 추가: 페르소나가 주어지면 **목차를 그 대상에 맞춰** 구성
    (예: 사회초년생→기초·통장 쪼개기부터 / 부모→증여세·절차부터). 억지 금지.
- **짠펜** `src/pipeline/scriptCell.ts` + `src/agents/scribe/{schema,step}.ts`:
  - `scriptCell.ts`는 현재 topic payload를 안 읽는다 → `getSelectedStagePayload("topic")`
    호출 한 줄 추가해 `target_persona`를 꺼내 `scribeStep(..., { ..., target_persona })`로 전달.
  - `ScribeInput`에 `target_persona?: string` 추가(step.ts에서 전달받아 SCRIBE 입력에 포함).
  - `SCRIBE_SYSTEM`에 지시 추가: 페르소나가 주어지면 **그 대상에게 직접 말 걸기**·예시·어휘를
    맞춘다(2030이면 첫 월급/사회초년 맥락, 부모면 자녀·증여 맥락). 말투(tone) 규칙은 불변.

### C. UI — 표시 + 인라인 편집

- **표시**: `src/lib/dashboard/proposalTypes.ts`의 topic 후보 타입에 `target_persona?` 추가 →
  `src/components/CandidateBody.tsx`(주제 단계 후보 카드)에 **"🎯 타겟: …"** 한 줄 표시.
  TRUS 3색·이모지 1개만(타겟 마커). 김짠부가 주제 고를 때 각 후보의 타겟을 보고 선택.
- **인라인 편집**(제목 손편집 패턴 미러 — 상태 전이 없음):
  - `src/pipeline/gate.ts`: `editSelectedTopic(supa, runId, payload, editedBy)` 헬퍼 신규
    (= `editSelectedTitle` 미러: 확정 후에만, topic selection의 `edited_payload`에 저장).
  - `src/app/actions/topicRun.ts`: `editTopicPersona(runId, persona)` 액션 — requireOwner →
    현재 선택된 주제 payload를 읽어 **`target_persona`만 교체·병합**(title 등 다른 필드 보존) →
    `editSelectedTopic` → audit `stage_edited`(detail: stage=topic).
  - `src/components/PostConfirmTopicPersonaEdit.tsx`: `PostConfirmTitleEdit` 미러 — 주제 확정
    요약(`page.tsx` StageSection의 `sv.selection` 분기, topic stage)에 "🎯 타겟" 표시 +
    편집 인풋 + 저장 버튼. 저장 후 `router.refresh()`.
  - `page.tsx`: topic stage 확정 요약에 `PostConfirmTopicPersonaEdit` 렌더(title_thumb의
    `PostConfirmTitleEdit` 위치와 대칭).
- **편집값 전파**: `edited_payload` 우선 반환(§데이터 모델) 덕에 편집한 페르소나가 구다리·짠펜에
  자동 반영 — 다운스트림 추가 작업 0.

### 하위호환 · 픽스처 · 테스트

- **마이그레이션 0**(persona는 JSON payload 안 — 새 컬럼 없음).
- **옛 런/주제**: persona 없음 → 구다리·짠펜 조건부 주입 스킵 → 무회귀. UI는 없으면 "🎯" 줄 미표시.
- **픽스처**: topic_scout만 promptHash 변경(다음 라이브 런 자동 재기록·$0). 구다리·짠펜은
  조건부 주입이라 persona 없는 기존 픽스처 보존.
- **테스트**:
  - 촉이 schema에 `target_persona` required 잠금(스키마 검증).
  - 구다리·짠펜 prepare: persona 있을 때 input/system에 주입 + **없을 때 바이트 불변**(픽스처
    해시 보존 회귀 가드).
  - `editTopicPersona`: persona만 교체·다른 필드 보존, `edited_payload` 우선 반환으로
    다운스트림이 편집값을 읽음(fake supa 라운드트립).

## 안 깨지는 것 (불변식)

- 기존 `audience_level`/`audience_need` 생성·표시 **불변**(병존).
- 말투(tone) 규칙·짠펜 검증·lineage·money-safety **불변**(persona는 표현 맥락만 추가).
- persona 없는 경로는 promptHash·픽스처 **불변**(조건부 주입).
- 마이그레이션 0·새 의존성 0·새 상태 전이 0.

## 작업 범위 (대략 harness phase 1개 · 3~4 step)

| step | 영역 | 변경 |
|---|---|---|
| 0 | 생성 | 촉이 schema `target_persona` required + SYSTEM 지시·예시 |
| 1 | 전파 | 구다리 prepare/SYSTEM + 짠펜 scriptCell/step/SYSTEM (조건부 주입) |
| 2 | UI 표시 | proposalTypes + CandidateBody "🎯 타겟" 표시 |
| 3 | UI 편집 | gate `editSelectedTopic` + 액션 `editTopicPersona` + `PostConfirmTopicPersonaEdit` |

(1을 구다리/짠펜 2 step으로 쪼갤 수 있음 — step 설계 시 결정.)

## 보류 (후속 — 효과 보고 결정)

- 리서치(셜록)에 persona 주입(그 대상에 중요한 사실·비교 위주).
- 제목·썸네일(훅이)에 persona 주입(타겟 후킹) — promptHash 변경·픽스처 재기록 동반.
- "타겟 먼저" 모드(A) — 김짠부가 타겟을 먼저 고정해 그 타겟용 주제만 발굴.
