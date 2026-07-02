# "타겟 먼저" 모드 (target-first-mode) — 설계

_2026-07-02 · 대화로 확정(brainstorming) · Phase B (target-persona 설계 (A)안 실현)_

## 목적

현재 촉이(topic_scout)는 주제를 발굴하고 **후보마다 다른** 타겟 페르소나(`target_persona`)를 생성한다. "타겟 먼저" 모드는 이를 뒤집어 — 김짠부가 **하나의 타겟을 먼저 고정**하고, 촉이가 **그 타겟용 주제만** 발굴한다. Phase A(다운스트림 컨텍스트 주입)로 이제 구다리·짠펜·훅이·셜록 전부 persona를 받으므로, 고정 타겟이 파이프라인 전체를 관통한다.

## UX

홈(`NewRunButton`)에 4번째 탭 **"타겟 먼저"** 추가. 한 줄 타겟 자유입력(placeholder 예시 제공) → "발굴 시작" → 촉이가 그 타겟용 주제만 발굴. 키워드 탭 패턴 미러(단순).

## 데이터 흐름 (levelSplit 패턴 재사용 · 마이그레이션 0)

`NewRunButton` → `startTopicRun(topic=undefined, levelSplit, targetPersona)` → `run/topic.requested` 이벤트 페이로드에 `targetPersona` → `topicStageFn` → `topicStageSpec(runId, {levelSplit, targetPersona})` → `prepareTopicScout(supa, runId, {levelSplit, targetPersona})` → 프롬프트 주입.

levelSplit과 동일하게 **이벤트 페이로드로만 전달**(durable 재시도 보존·DB 컬럼/마이그 불필요).

## 촉이 프롬프트

`schema.ts`에 `appendPersonaDirective(system, persona)` 신설(`appendLevelDirective` 미러). targetPersona 있을 때만 `TOPIC_SCOUT_SYSTEM` 뒤에 append: "타겟이 이 사람으로 고정됐다: <persona>. 이 타겟이 지금 검색·시청할 만한 주제만 발굴하라. 모든 후보의 target_persona는 이 값으로 고정한다." **없으면 바이트 동일 → promptHash 보존**(기존 발굴/키워드 런 영향 0).

## 고정 persona 보장

`stage.ts`의 `toCandidates`에서 targetPersona가 있으면 **모든 후보 payload의 `target_persona`를 그 고정값으로 덮어쓴다**(LLM 드리프트 방지). → 다운스트림(구다리·짠펜·훅이·셜록) 전부 일관된 타겟 주입.

## 결정 (기본값)

1. **levelSplit 토글은 "타겟 먼저" 탭에서 숨김** — 고정 persona가 대상을 이미 정의. (target-first에선 levelSplit 미전달.)
2. **audience_level은 촉이가 후보별로 계속 추론** — persona는 고정, 전문성 수준은 주제마다 다를 수 있음(덮어쓰지 않음).
3. **discovery 경로 재사용** — target-first는 keyword 없는 discovery 흐름에 persona 제약만 얹은 것(외부 신호·댓글 집계 등 동일).

## Step 분해 (하네스)

- **step0 `target-first-plumbing`**: `startTopicRun`에 optional `targetPersona` 인자 추가 + `client.ts` `StageData`에 필드 + `topicStage.ts`가 페이로드→spec opts 전달 + `stage.ts` `topicStageSpec` opts 확장 → `prepareTopicScout` opts까지 **값 배선만**(동작 없음).
- **step1 `target-first-prompt`**: `prepare.ts`가 opts.targetPersona를 프롬프트에 주입 + `schema.ts` `appendPersonaDirective` 신설 + `stage.ts` `toCandidates` 후보 persona 덮어쓰기.
- **step2 `target-first-ui`**: `NewRunButton.tsx` 4번째 탭 "타겟 먼저"(자유입력·levelSplit 숨김·`startTopicRun` 호출).

## 불변식

- targetPersona 없으면 프롬프트·후보 payload **바이트 동일**(기존 3모드 영향 0·promptHash 보존).
- 마이그레이션 0(이벤트 페이로드 전달). 의존성 0. 기존 discovery/keyword/seed 모드 동작 불변.

## 비스코프

- 과거 persona 재사용(C안·persona 이력 저장) — YAGNI, 후속.
- Phase A(다운스트림 주입)는 이미 완료 — 이 phase는 그 위에서 "고정 타겟"을 공급.
