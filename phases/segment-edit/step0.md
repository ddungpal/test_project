# Step 0: segment-edit-backend

세그먼트 **프로즈 텍스트 직접 수정**의 백엔드(액션 + 순수 staleness 판정). AI·전이 0.

## 읽어야 할 파일

- `docs/specs/2026-07-02-segment-edit-design.md` — 이 phase 전체 설계(단일 출처). "현황(제약)"·"결정".
- `src/pipeline/scriptCell.ts` — `script_segments` 테이블 스키마(`content_id, run_id, ord, text, kind, payload`·`:134-138`). 전량 delete-insert 패턴(이 step은 **단일 행 update만**).
- `src/lib/dashboard/scriptView.ts` — `SegmentView`(id·ord·text·kind·payload)·`getScriptView`(읽기).
- `src/pipeline/gate.ts`의 `editSelectedStructure`(`:236-272`) + `src/app/actions/topicRun.ts`의 `editStructure`(`:225-230`) — **미러 대상**(requireOwner·audit·전이 0 패턴). 단 structure는 edited_payload, 세그먼트는 테이블 행 직접 update(차이 주의).
- `src/lib/outline/staleness.ts`(`isStructureDownstreamStarted`) + `src/domain/enums.ts`(RUN_STATES·approved/published) — staleness 순수 판정 미러.

## 작업

### 1) 순수 staleness 판정 (`src/lib/script/staleness.ts` 신규)
- `isScriptDownstreamStarted(state: RunState): boolean` — `approved`·`published`면 true(스크립트 확정 이후 편집 = 경고 대상). `isStructureDownstreamStarted` 미러·순수·throw 0. 신규 `tests/scriptStaleness.test.ts`.

### 2) 세그먼트 직접 수정 액션 (`src/app/actions/topicRun.ts` 또는 신규 scriptSegment 액션 파일)
- `editSegment(runId, segmentId, text): Promise<void>` — `requireOwner()` → **kind 확인**(프로즈=prose/null만·블록[table/case/visual]이면 거부/throw "블록은 재생성으로") → `script_segments.update({text}).eq("run_id", runId).eq("id", segmentId)` → `auditLog("segment_edited", {segmentId})`. **상태 전이·AI 0.** `.eq run_id` 스코프 필수(타 run 오염 금지·editSelectedStructure 패턴).
- text 공백/빈 문자열 거부(가드).

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 회귀 테스트 포함 전부 통과
npm run build
```

신규 테스트:
- `isScriptDownstreamStarted`: approved/published=true, script_review/scripting/그 이전=false.
- `editSegment`: 프로즈면 update(run·id 스코프)·블록이면 거부·빈 text 거부(모킹 supa).

## 검증 절차
1. AC 실행.
2. 체크리스트: `.eq run_id` 스코프(타 run 오염 방지). 프로즈만(블록 거부). 전이·AI 0. 순수 staleness 분리(vitest alias 함정 회피).
3. `phases/segment-edit/index.json` step 0 갱신.

## 금지사항
- **`runScriptStage`(전량 delete-insert)를 건드리지 마라 — 이 step은 단일 행 update만.**
- **`.eq("run_id", runId)` 스코프 없이 update하지 마라**(타 run 세그먼트 오염).
- **블록 세그먼트(table/case/visual) text를 직접 수정 허용하지 마라 — 프로즈만**(블록은 step2 재생성).
- **상태 전이/AI 호출 넣지 마라**(직접 수정은 순수 DB update).
- **순수 staleness를 컴포넌트 파일에 두지 마라** — `src/lib/script/`(vitest `@/` alias 함정).
- 기존 테스트를 깨뜨리지 마라.
