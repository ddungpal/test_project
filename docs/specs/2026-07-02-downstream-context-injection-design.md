# 다운스트림 컨텍스트 주입 (downstream-context-injection) — 설계

_2026-07-02 · 대화로 확정(brainstorming)_

## 목적

타겟 페르소나(`target_persona`)와 온보딩 금맥(`OnboardingGold`)을 **더 많은 다운스트림 에이전트**에 조건부 주입해, 제목·썸네일·리서치가 "누구에게 · 무슨 혼란을 · 어느 각도로"에 맞춰지게 한다. `topic-target-persona`·`onboarding-tutor` 후속.

현재 주입 현황:
- `target_persona`: 구다리(input) + 짠펜(system+input)에만.
- 금맥: 구다리(input)에만.

## 스코프 결정 (Phase A / Phase B)

원래 후보 3개(1 persona→리서치·제목/썸네일, 2 금맥→훅이·셜록, 3 "타겟 먼저" 모드)를 2 phase로 재편:

- **Phase A (이 문서) — 다운스트림 컨텍스트 주입.**
- **Phase B (별도) — "타겟 먼저" 모드.** 새 토픽 발굴 흐름이라 분리.

**⚠️ 파이프라인 순서 제약:** `주제 → 제목/썸네일(훅이) → [썸네일 확정 → 금맥 생성] → 구성(구다리) → 리서치(셜록) → 스크립트`. 훅이(제목·썸네일)는 **금맥 생성 전**에 돌기 때문에 "금맥 → 훅이"는 정방향 불가 → **제외**(재생성 엣지는 YAGNI). 금맥 → 셜록은 리서치가 금맥 뒤라 유효.

## 주입 맵

| 대상 | 주입 | 방식 | 근거 |
|---|---|---|---|
| 훅이(제목·`hook_maker`) | `target_persona` | **B**: input 키 + `HOOK_PERSONA_DIRECTIVE` system append | 후킹은 "이 사람의 막막함을 정확히 찔러라"가 명시돼야 효과 |
| 썸네일(`thumbnail_maker`) | `target_persona` | **B**: input 키 + `THUMBNAIL_PERSONA_DIRECTIVE` | 동일 |
| 셜록(리서치 scope) | `target_persona` + 금맥 | **A**: input 키만(소프트) | 리서치는 목차 기반으로 이미 범위 잡힘 → 소프트 힌트면 충분·과조향 방지 |

**금맥 → 셜록 필드**: 구다리와 동일 4필드 shape(`confusionPoints`·`ahaPoints`·`coreAngle`·`calibratedLevel`) 재사용. confusionPoints=풀 혼란·ahaPoints=사실로 뒷받침할 주장·coreAngle=서빙할 각도·calibratedLevel=깊이.

## 불변식 (모든 주입 공통 · 기존 패턴 미러)

- 값이 **있을 때만** input에 키 추가 + (B는) system에 **전용 상수** append.
- 값이 없으면 input·system 둘 다 **바이트 동일** → `promptHash` 보존 → 기존 골든 픽스처 안 깨짐.
- 참조 패턴: 짠펜 `SCRIBE_PERSONA_DIRECTIVE`(scribe/schema.ts, scribe/step.ts 조건부 append), 구다리 persona(structurer/prepare.ts 조건부 input), 구다리 금맥(structurer/prepare.ts `loadOnboardingGold` 조건부 input).
- 조회: persona = `getSelectedStagePayload(supa, runId, "topic")`의 `target_persona`(edited_payload 우선). 금맥 = `loadOnboardingGold(supa, runId)`(구다리 경로 재사용·없으면 null).

## Step 분해 (하네스 · 모듈 1개씩)

- **step0 `hook-persona`**: `src/agents/hook_maker/{prepare.ts,schema.ts}` — `HookMakerInput.target_persona?` + prepare에서 topic payload persona 조건부 주입 + `HOOK_PERSONA_DIRECTIVE` 조건부 append.
- **step1 `thumbnail-persona`**: `src/agents/thumbnail_maker/{prepare.ts,schema.ts}` — 동일 패턴(`THUMBNAIL_PERSONA_DIRECTIVE`).
- **step2 `research-context`**: `src/pipeline/researchScope.ts`(runResearchScope+regenerateResearchScope) + `src/agents/sherlock_lead/{step.ts,schema.ts}` scope input 타입 — persona+금맥 **소프트 input 주입**(system 무변경).

## 테스트

각 step에 회귀 가드 유닛 테스트(짠펜 persona 테스트 스타일 미러):
- B(훅이·썸네일): persona 있으면 system에 지시문 포함·input 키 존재 / 없으면 system·input 바이트 동일.
- A(셜록): persona/금맥 있으면 scope input에 키 존재 / 없으면 바이트 동일.

## 비스코프 (하지 않는 것)

- 금맥 → 훅이(정방향 불가·제외).
- "타겟 먼저" 모드(Phase B).
- 새 UI·마이그레이션·의존성. 백엔드 전이/검증 로직 무변경 — 프롬프트 입력·시스템 문자열만.
