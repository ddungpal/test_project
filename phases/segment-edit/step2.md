# Step 2: segment-regen-backend

**단일 세그먼트 재생성**(사유 입력)의 백엔드. 짠펜 부분 모드 + Inngest 이벤트. 그 세그먼트 행만 교체(전량 delete 금지).

## 읽어야 할 파일

- `docs/specs/2026-07-02-segment-edit-design.md` — "step2 segment-regen-backend"·"결정"(단일 집중·비동기 Inngest).
- `src/pipeline/scriptCell.ts` — **핵심 참조.** `runScriptStage`(전체·`:35-194`)·`scribeStep`(`:110`)·세그먼트 저장(`script_segments` + lineage 조인테이블 `script_segment_facts`/`_explanation_assets`·`:132-182`)·`normalizeSegmentPayload`(재사용). 여기서 **단일 세그먼트판 저수준 경로**를 새로 만든다(전량 delete-insert 재사용 금지).
- `src/agents/scribe/step.ts`·`schema.ts` — 짠펜 `scribeStep`·`SCRIBE_SYSTEM`·`SCRIBE_SCHEMA`. 단일 세그먼트 재생성용 부분 모드(입력=그 세그먼트+맥락+사유).
- `src/lib/dashboard/scriptView.ts` — `getScriptView`(세그먼트·lineage 읽기·이웃 맥락 조회에 참고).
- `src/inngest/functions/scriptStage.ts` + `src/pipeline/stageRuntime.ts`(`withStageRuntime`·비용가드) — Inngest 함수·비용가드 패턴 미러.
- `src/app/actions/topicRun.ts` — `regenerateAfterConfirm`(`:235-247`·이벤트 발행 패턴·동기 callLLM 금지)·`requestScript`.
- `src/inngest/client.ts` — 이벤트 타입.

## 작업

### 1) 단일 세그먼트 재생성 파이프라인 (`scriptCell.ts` 또는 신규 `src/pipeline/segmentRegen.ts`)
- `regenerateSegment(runId, segmentId, reason, deps): Promise<void>` — 
  - 대상 세그먼트 + **앞뒤 이웃 세그먼트 text(맥락)** + 그 세그먼트 **lineage 사실/자산**(script_segment_facts/_assets 조인) 로드.
  - 짠펜 부분 모드 호출(그 한 세그먼트를 사유 반영해 다시 씀·주변 맥락 참고·money-safety 유지).
  - 결과로 **그 `script_segments` 행만 update**(text/kind/payload·`normalizeSegmentPayload`) + 그 세그먼트의 lineage 조인 행만 재설정(다른 세그먼트·표절검사 전체 재실행 X). `.eq run_id`+`.eq id` 스코프.
- 짠펜 부분 모드: `scribe/step.ts`에 세그먼트 1개 재작성 함수(또는 기존 scribeStep에 single-segment 입력 분기). **SCRIBE_SYSTEM 본문 확장 금지**(promptHash) — 전용 지시 상수 조건부 append(SCRIBE_PERSONA_DIRECTIVE 패턴).

### 2) Inngest 이벤트 + 액션
- 이벤트 `run/segment.regen.requested` data `{runId, segmentId, reason}`(client.ts StageData류). 신규 함수 `segmentRegenFn`(id·concurrency `event.data.runId`·retries·`withStageRuntime`로 비용가드·onFailure 캡처).
- 액션 `requestSegmentRegen(runId, segmentId, reason)` — `requireOwner` → `inngest.send`(동기 callLLM 금지·타임아웃 회피·regenerateAfterConfirm 패턴) → `auditLog("segment_regenerated")`.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 회귀 테스트 포함 전부 통과
npm run build
```

신규 테스트:
- `regenerateSegment`가 **그 행만** update(다른 세그먼트 건드림 0·`.eq id` 스코프·모킹 supa).
- lineage는 그 세그먼트 것만 재설정.
- 짠펜 부분 모드 입력에 사유+이웃 맥락 포함.
- SCRIBE_SYSTEM 본문 불변(promptHash 보존).

## 검증 절차
1. AC 실행.
2. 체크리스트: 전량 delete-insert 안 씀(그 행만). Inngest 비동기(동기 callLLM X). `.eq run_id`+`.eq id` 스코프. `normalizeSegmentPayload` 재사용. SCRIBE_SYSTEM 무변경.
3. `phases/segment-edit/index.json` step 2 갱신.

## 금지사항
- **`runScriptStage`의 전량 delete-insert를 재사용/트리거하지 마라 — 그 세그먼트 행만 update.**
- **동기 callLLM을 액션에서 호출하지 마라 — Inngest 이벤트로**(185s 타임아웃).
- **표절검사·다른 세그먼트를 재실행하지 마라 — 단일 세그먼트 스코프.**
- **`SCRIBE_SYSTEM` 본문을 늘리지 마라 — 부분모드 지시는 조건부 상수 append**(promptHash 보존).
- **`.eq("run_id")`+`.eq("id")` 스코프 없이 update/delete 하지 마라.**
- 기존 테스트를 깨뜨리지 마라.
