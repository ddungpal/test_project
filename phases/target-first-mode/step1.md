# Step 1: target-first-prompt

step0에서 촉이 prepare까지 배선한 `targetPersona`를 **실제로 작동**시킨다: 촉이 프롬프트에 "이 타겟용 주제만 발굴" 지시를 주입하고, 모든 후보의 `target_persona`를 그 고정값으로 덮어쓴다. `levelSplit`의 `appendLevelDirective` 패턴을 미러한다.

## 읽어야 할 파일

- `docs/specs/2026-07-02-target-first-mode-design.md` — "촉이 프롬프트"·"고정 persona 보장" 절.
- `phases/target-first-mode/step0.md` + step0 산출물 — targetPersona가 `prepareTopicScout` opts까지 배선된 상태. 이 step이 소비한다.
- `src/agents/topic_scout/schema.ts` — **수정 대상.** `TOPIC_SCOUT_SYSTEM`, 기존 `appendLevelDirective(system, levelSplit)`(미러 대상), `target_persona` 정의(~L91-95: "누구+상황+막막함 한 줄"), `TOPIC_SCOUT_SCHEMA`.
- `src/agents/topic_scout/prepare.ts` (~L118 `appendLevelDirective` 적용 지점) — **수정 대상.** opts.targetPersona 있을 때 `appendPersonaDirective` 적용.
- `src/agents/topic_scout/stage.ts` (`toCandidates` ~L14-22, `payload: {title, audience_level, audience_need, target_persona}`) — **수정 대상.** targetPersona 있으면 후보 persona 덮어쓰기.

## 작업

### 1) `src/agents/topic_scout/schema.ts` — `appendPersonaDirective`

`appendLevelDirective` 미러로 신설:
```ts
export function appendPersonaDirective(system: string, targetPersona?: string): string;
```
- targetPersona 있으면 `TOPIC_SCOUT_SYSTEM` 뒤에 지시문 append: 타겟이 이 사람으로 **고정**됐고(값 인용), 그 타겟이 지금 검색·시청할 만한 주제만 발굴하며, 모든 후보의 `target_persona`를 이 값으로 고정하라는 취지.
- targetPersona 없으면 **system 그대로 반환**(바이트 동일). **`TOPIC_SCOUT_SYSTEM` 본문은 늘리지 마라 — 지시문은 이 함수가 조건부로만 append.**

### 2) `src/agents/topic_scout/prepare.ts`

- 기존 `appendLevelDirective(system, levelSplit)` 적용 지점에서, `appendPersonaDirective(system, opts?.targetPersona)`도 체이닝(있을 때만 append·순서는 재량이되 levelSplit과 공존). targetPersona 없으면 바이트 동일.

### 3) `src/agents/topic_scout/stage.ts` — 후보 persona 덮어쓰기

- `topicStageSpec` opts에 이미 있는 targetPersona를 `toCandidates`가 사용: targetPersona가 있으면 **각 후보 payload의 `target_persona`를 그 고정값으로 교체**(title·audience_level·audience_need 등 나머지 필드는 촉이 출력 그대로 보존). 없으면 촉이 출력 target_persona 그대로(현행 불변).
- 이유: LLM이 프롬프트 지시를 어겨도 다운스트림(구다리·짠펜·훅이·셜록)에 **일관된 고정 타겟**이 확실히 전파되도록.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 회귀 테스트 포함 전부 통과
npm run build
```

신규 `tests/targetFirstMode.test.ts`(또는 기존 topic_scout 테스트에 케이스):
- `appendPersonaDirective`: targetPersona 있으면 지시문 포함 + 값 인용 / 없으면 바이트 동일.
- `toCandidates`: targetPersona 있으면 모든 후보 payload.target_persona = 고정값(나머지 필드 보존) / 없으면 촉이 출력 그대로.

## 검증 절차

1. 위 AC 실행.
2. 체크리스트: targetPersona 없을 때 프롬프트·후보 payload 바이트 동일(promptHash 보존·기존 3모드 영향 0). `appendLevelDirective`와 공존. audience_level은 덮어쓰지 않음.
3. `phases/target-first-mode/index.json` step 1 갱신.

## 금지사항

- **`TOPIC_SCOUT_SYSTEM` 본문을 확장하지 마라. 이유: targetPersona 없는 런의 promptHash가 깨져 기존 발굴/키워드 골든 픽스처가 깨진다.** 지시문은 `appendPersonaDirective`가 조건부로만.
- **audience_level·audience_need·title을 덮어쓰지 마라. 이유: persona만 고정, 수준·욕구·제목은 촉이가 주제별로 추론.**
- **UI(`NewRunButton`)를 건드리지 마라(step2). seed 경로 무관.**
- **`TOPIC_SCOUT_SCHEMA`의 target_persona required를 풀지 마라. 이유: 촉이는 계속 값을 내되(프롬프트가 고정값으로 유도), 최종 보장은 stage.ts 덮어쓰기가 한다 — 스키마 변경 불필요.**
- 기존 테스트를 깨뜨리지 마라.
