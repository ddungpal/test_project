# Step 0: regenerate-force-path

**제안 단계를 강제로 다시 돌리는 백엔드 경로.** 지금 `runProposalStage`는 멱등 메모이즈라 이미 proposedState면 재호출 없이 기존 제안을 돌려준다(중복 과금 방지). '다시 생성'은 이 메모를 **force로 우회**해 새 제안을 만든다. **상태는 안 바꾼다**(proposedState 유지) — 그래야 DB 전이 트리거(migration 08)를 안 건드리고 migration 없이 된다.

## 배경 (왜 이렇게)
- `runProposalStage`(`src/pipeline/stageContract.ts`): ① state===proposedState면 기존 proposal 반환(멱등) ② fromState에서만 진입 ③ 끝에 fromState→proposedState 전이.
- 역전이(titles_proposed→topic_selected)로 되돌려 재실행하는 방법은 **DB 트리거 `trg_run_transition`(migration 08)이 전이 그래프를 강제**해서 migration이 필요 → 오프라인 불가·사용자 수동 SQL 필요. **그래서 안 쓴다.**
- 대신 **force=true면 proposedState에서 그대로 재실행**하고 **새 proposal 행을 INSERT**한다. `stage_proposals`는 어디서나 `order created_at desc limit 1`로 **최신 행을 읽으므로**(stageContract 62~70줄·context.ts·runDetail) 새 제안이 자동으로 화면에 뜬다. 상태 전이가 없으니 트리거 무관(같은 state로의 update는 트리거가 허용).

## 읽어야 할 파일 (먼저 정독)
- `src/pipeline/stageContract.ts` — `runProposalStage` 전체. 멱등(62~78)·진입가드(80~83)·전이(131~138). 여기에 force 분기를 넣는다.
- `src/pipeline/runState.ts` — `transitionRun`(낙관적 잠금)·`getRun`·`setProgress`. force-in-place에선 transitionRun 대신 **같은 state 유지 update**를 쓴다.
- `src/inngest/functions/_shared.ts` — `executeProposalStage(spec, opts)` (현재 `{softAck}`). 여기에 `force` 추가.
- `src/inngest/functions/{topicStage,hookStage,structureStage}.ts` — `event.data`에서 옵션 읽어 executeProposalStage로 전달(현재 softAck처럼).
- `src/inngest/client.ts` — `StageData`(현재 `{runId, softAck?, levelSplit?}`)에 `force?` 추가.
- `src/app/actions/topicRun.ts` — `requestTitles`/`requestStructure`/`startTopicRun`가 이벤트 발행하는 패턴(137·149줄). 여기에 regenerate 액션을 추가.
- `tests/pipeline.test.ts` — `canTransition`·descriptor를 순수하게 검증하는 패턴(69~75줄). 새 순수함수 테스트도 이 스타일.

## 작업
### 1) 순수 판정 함수 (오프라인 테스트의 핵심) `src/pipeline/regenerateDecision.ts`
```ts
export type StageEntry = "memoized" | "run-forward" | "run-in-place" | "reject";
// state·force로 진입 방식을 결정. fromState·proposedState는 서로 다른 state라 겹치지 않는다.
export function decideStageEntry(args: {
  state: string; fromState: string; proposedState: string; force: boolean;
}): StageEntry;
```
규칙(이대로):
- `state === proposedState` → `force ? "run-in-place" : "memoized"`
- `state === fromState` → `"run-forward"` (force 여부 무관)
- 그 외 → `"reject"`

### 2) `runProposalStage`에 force 배선 (`stageContract.ts`)
- 시그니처에 옵션 추가: `runProposalStage(spec, deps, opts: { force?: boolean } = {})`.
- `getRun` 후 `decideStageEntry({state: run.state, fromState: descriptor.fromState, proposedState: descriptor.proposedState, force: !!opts.force})`로 분기:
  - `"memoized"` → 기존 멱등 분기 그대로(기존 proposal 반환).
  - `"reject"` → 기존 진입가드 에러 그대로(`fromState에서만 시작`).
  - `"run-forward"` → 기존 정상 경로 그대로(prepare→callLLM→insert→**transitionRun(fromState→proposedState)**→setProgress).
  - `"run-in-place"` → prepare→callLLM→**새 proposal INSERT**→cost_ledger flush→**transitionRun 대신** production_runs를 **같은 state로 update**(cost_usd += res.costUsd·model·prompt_version·latency_ms)→setProgress(null). **상태는 proposedState 유지.**
- **기본(force=false)일 때 동작·반환·전이는 1바이트도 안 바뀌어야 한다**(decideStageEntry가 기존 분기와 동치). 멱등/정상 경로 회귀 금지.
- `ProposalStageResult`에 `skipped`는 그대로. force-in-place는 `skipped:false`, provider=실제.

### 3) 이벤트·함수·액션 배선
- `client.ts` `StageData`에 `force?: boolean` 추가.
- `_shared.ts` `executeProposalStage(spec, { softAck?, force? })` → `withStageRuntime(... (deps)=>runProposalStage(spec, deps, { force }), { softAck })`.
- `topicStage.ts`·`hookStage.ts`·`structureStage.ts`: `executeProposalStage(spec, { softAck: event.data.softAck, force: event.data.force })`.
- `topicRun.ts`에 액션 추가:
  ```ts
  export async function regenerateStage(runId: string, stage: "topic" | "titles" | "structure"): Promise<void>
  ```
  - `requireOwner()`(기존 액션과 동일 게이트) 후, stage→이벤트명 매핑(`topic→run/topic.requested`·`titles→run/titles.requested`·`structure→run/structure.requested`)으로 `inngest.send({ name, data: { runId, force: true } })`.

## 주의
- **상태 전이를 추가하지 마라(enums·migration 금지).** 이유: DB 트리거가 전이 그래프를 강제해 역전이는 SQL migration이 필요해진다 — 이 step은 오프라인. force-in-place는 같은 state update라 트리거 무관.
- **force=false 경로 불변 최우선.** 이유: 멱등/정상 단계가 깨지면 전체 파이프라인 회귀. decideStageEntry가 기존 if 분기와 정확히 동치인지 테스트로 박아라.
- **research/script는 범위 밖.** 이유: 그 단계는 `runProposalStage`가 아니라 researchCell/scriptCell을 쓴다 — 다른 흐름. 이 step은 topic/title_thumb/structure(제안 단계)만.
- force-in-place가 새 proposal을 INSERT하면 옛 proposal 행은 남는다(최신-우선 읽기라 무해). // ponytail: 행 누적 — 자주 재생성하면 쌓임, 정리는 필요해지면. 지금은 단일 owner·소수 런이라 무시.
- `exactOptionalPropertyTypes`(옵셔널에 undefined 명시대입 금지 — `force` 조건부 스프레드)·`noUncheckedIndexedAccess` 준수.
- UI(page.tsx·컴포넌트)는 건드리지 마라(step1).

## 테스트 (신규 `tests/regenerateDecision.test.ts`)
- `decideStageEntry` 4케이스: proposedState+force=false→memoized · proposedState+force=true→run-in-place · fromState(+force 양쪽)→run-forward · 무관 state→reject.
- (가능하면) descriptor 기반: title_thumb의 fromState=topic_selected·proposedState=titles_proposed로 위 매핑이 의도대로 나오는지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0. 기존 pipeline·parity·eval 그린(force=false 경로 불변 입증).
2. `git diff`로 enums.ts·migrations 무변경 확인(전이표·DB 안 건드림). 기본 경로 분기 동치 자가확인.
3. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"decideStageEntry 순수판정(memoized/run-forward/run-in-place/reject) + runProposalStage force 배선(in-place=새 proposal INSERT·전이 없음·같은 state cost update) + StageData.force·executeProposalStage·3 함수·regenerateStage 액션. force=false 불변. enums/migration 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- enums.ALLOWED_TRANSITIONS·migration 추가/수정 금지(위 이유).
- force=false 기존 동작 변경 금지.
- UI 수정 금지(step1).
- 기존 테스트를 깨뜨리지 마라.
