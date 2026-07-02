# Step 0: target-first-plumbing

"타겟 먼저" 모드의 **배선(plumbing)**만 만든다 — 고정 타겟 페르소나(`targetPersona`) 문자열을 UI 액션에서 촉이 prepare까지 **전달만** 하고, 프롬프트/UI 동작은 다음 step에서. `levelSplit`가 이벤트 페이로드로 흐르는 기존 패턴을 그대로 미러한다(마이그레이션 0).

## 읽어야 할 파일

먼저 아래를 읽고 `levelSplit`가 어떻게 흐르는지 파악하라 — targetPersona도 **똑같이** 흘린다:

- `docs/specs/2026-07-02-target-first-mode-design.md` — 이 phase 전체 설계(단일 출처). "데이터 흐름" 절.
- `src/app/actions/topicRun.ts` (`startTopicRun(topic?, levelSplit?)` ~L28-51) — **수정 대상.** topic 유무로 discovery/keyword 구분, `run/topic.requested`에 levelSplit 실어 발행. targetPersona 인자를 여기 추가.
- `src/inngest/client.ts` (`StageData` 타입 ~L16) — **수정 대상.** 이벤트 페이로드 타입에 optional `targetPersona` 추가.
- `src/inngest/functions/topicStage.ts` (`topicStageFn` ~L8-16) — **수정 대상.** 페이로드에서 targetPersona 꺼내 `topicStageSpec`에 전달.
- `src/agents/topic_scout/stage.ts` (`topicStageSpec(runId, opts)` ~L14-22) — **수정 대상.** opts에 targetPersona 받아 `prepareTopicScout` opts로 넘김. (toCandidates 덮어쓰기는 **이 step에서 하지 마라** — step1.)
- `src/agents/topic_scout/prepare.ts` (`prepareTopicScout(supa, runId, opts?: {levelSplit?})` ~L33-120) — **수정 대상(시그니처만).** opts에 optional `targetPersona` 받도록 타입 확장. **프롬프트 주입은 step1** — 이 step은 값만 받아두고 미사용이어도 됨(또는 미사용 경고 피하려 다음 step 전까지 보관).

## 작업

targetPersona(optional string)를 아래 사슬로 **끝까지 전달**한다. 값은 있을 때만 실어 기존 흐름 바이트 영향 0:

1. `startTopicRun(topic?, levelSplit?, targetPersona?)` — 3번째 optional 인자 추가. `run/topic.requested` 이벤트 data에 `targetPersona`를 **있을 때만** 포함(levelSplit과 동일 조건부).
2. `StageData`(client.ts)에 optional `targetPersona?: string`.
3. `topicStageFn` — `event.data.targetPersona`를 `topicStageSpec(runId, { levelSplit, targetPersona })`로 전달.
4. `topicStageSpec` opts에 `targetPersona?` 추가 → `prepareTopicScout(supa, runId, { levelSplit, targetPersona })`로 전달.
5. `prepareTopicScout` opts 타입에 `targetPersona?: string` 추가(이 step에선 받기만·프롬프트 미주입).

**seed 모드(`startSeedRun`)는 건드리지 마라** — 촉이를 우회하므로 무관.

## Acceptance Criteria

```bash
npm run typecheck   # 컴파일 에러 없음 (targetPersona 타입 전 사슬)
npm test            # 기존 테스트 전부 통과 (회귀 0)
npm run build       # 빌드 성공
```

- 이 step은 순수 배선이라 신규 테스트 필수 아님. 단, `noUnusedLocals`류 경고가 없도록(받은 targetPersona가 미사용이면 prepare opts 타입에만 두고 사용은 step1). 기존 테스트 불변.

## 검증 절차

1. 위 AC 실행.
2. 체크리스트: levelSplit 패턴을 정확히 미러했는가(있을 때만 페이로드 포함·마이그 0). seed 경로 무변경. 새 의존성 없음.
3. `phases/target-first-mode/index.json` step 0 갱신(성공→completed+summary / 실패→error).

## 금지사항

- **프롬프트 주입·후보 persona 덮어쓰기를 이 step에서 하지 마라. 이유: step1(target-first-prompt)의 몫. 이 step은 값 배선만.**
- **UI(`NewRunButton`)를 건드리지 마라. 이유: step2.**
- **`startSeedRun`·seed 흐름을 수정하지 마라. 이유: 촉이 우회 경로라 target-first와 무관.**
- **targetPersona를 DB 컬럼/마이그레이션으로 저장하지 마라. 이유: levelSplit처럼 이벤트 페이로드 전달로 충분(마이그 불필요).**
- 기존 테스트를 깨뜨리지 마라.
