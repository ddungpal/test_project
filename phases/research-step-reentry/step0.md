# Step 0: reentry-state-cell

리서치 5단계 안에서 **이전 단계로 되돌아가 다시 실행**(B)하기 위한 상태머신 + 셀 재진입 기반. 이 step은 (1) 되돌림 전이 추가, (2) 셀이 **'④예시만 다시'**(검증 스킵, 저장된 facts에서 시작)를 지원하게 `fromStep` 파라미터를 받게 한다. 액션·UI는 다음 step.

## 배경 (현재 구조)

리서치 셀(`src/pipeline/researchCell.ts` `runResearchCell`)은 `researching`에서 **②팩트검증→③교차정리→④숫자·비유→⑤반론**을 한 번에 실행하고 `research_ready`로 전이한다. 의존 DAG: **①선택(research_scoped) → ②검증 → ③정리 → {④예시, ⑤반론}**. ③의 산출(factRows)은 `research_facts`에, ④는 `explanation_assets`에 저장됨(⑤critic은 미저장).

(B-lite) 재진입점은 **①(다시 선택/보완)·②(다시 검증)·④(예시 다시)**. 이 step은:
- 되돌림 전이: `research_ready`/`research_review` → `research_scoped`(①로) 와 → `researching`(②/④로).
- 셀 `fromStep`:
  - `'full'`(기본, 현행): ②③④⑤ 전부 + facts/assets 삭제 후 재생성.
  - `'examples'`: **②③ 스킵** — `research_facts`에서 factRows를 읽어 ④(셈이/유이)만 재실행, `explanation_assets`만 삭제·재기록. facts·critic 보존. `research_ready`로 복귀.

## 읽어야 할 파일

- `src/domain/enums.ts` — `ALLOWED_TRANSITIONS`. 되돌림 전이 추가(현재 research_ready→research_review→research_approved 단방향).
- `supabase/migrations/20260629120027_research_scoped_stage.sql` — 직전 전이 마이그레이션 패턴(전이 insert·CHECK). **다음 번호 = `20260629120028`**.
- `src/pipeline/researchCell.ts` — `runResearchCell`(②~⑤ 흐름·`loadSelectedScope`·facts/assets delete+insert L111-120·전이 L127). `fromStep` 분기 삽입.
- `src/agents/numbers/step.ts`·`src/agents/analogist/step.ts`·`src/pipeline/researchReconcile.ts`(`buildAssetRows`) — ④ 재실행에 필요한 입력(factContext = {claim, verification_status, quote_excerpt}). research_facts 행에서 직접 복원 가능.
- `src/pipeline/runGuards.ts` — `MAX_REWORK`/`bumpRework`. **결정: 리서치 내부 재진입(①②④)은 rework_count를 올리지 않는다**(교차단계 rework와 구분 — 내부 반복은 비용 캡으로만 제한). 코드/주석에 명시.
- `src/inngest/functions/researchStage.ts`·`src/inngest/client.ts` — `run/research.requested` 이벤트에 `fromStep?` 추가(기본 'full').

## 작업

### 1) 마이그레이션 `supabase/migrations/20260629120028_research_reentry_transitions.sql`
- `run_state_transitions`에 추가(additive): `('research_ready','research_scoped')`, `('research_review','research_scoped')`, `('research_ready','researching')`, `('research_review','researching')`. (상태 CHECK는 기존 상태만 쓰므로 변경 불필요 — 확인.)
- 멱등·트랜잭션. 기존 전이 보존.

### 2) `enums.ts` ALLOWED_TRANSITIONS
- `research_ready`·`research_review`의 to 목록에 `research_scoped`·`researching` 추가. **DB 전이표와 정확히 일치.**

### 3) 셀 `fromStep` — `runResearchCell(runId, deps, opts?: { fromStep?: 'full' | 'examples' })`
- 기본 `'full'` = 현행 동작(바이트 동일).
- `'examples'`: ②③ 스킵 → `research_facts`(run_id)에서 factRows 로드 → factContext 구성({claim, verification_status, quote_excerpt}) → numbersStep/analogyStep(concepts는 `loadSelectedScope`로) 재실행 → `explanation_assets`만 delete+insert → `research_ready` 복귀(전이는 현재 상태가 researching이므로 동일 researching→research_ready). facts·critic 미변경.
- 멱등 가드(L46 research_ready 조기반환)는 `fromStep==='examples'` 재진입과 충돌하지 않게 보정(재진입은 researching에서 들어오므로 OK지만, 재진입 트리거가 researching으로 전이 후 호출하는 전제 확인).

### 4) Inngest — `run/research.requested.data.fromStep?`
- `researchStage`가 `event.data.fromStep`을 셀에 전달(없으면 'full'). scope-only 분기(structure_selected/research_scoped)는 불변.

### 5) 테스트
- 전이표↔enums 일치, 되돌림 전이 4개 존재.
- 셀 `fromStep='examples'`가 ②(verifyClaimStep) 호출 0·③ 스킵·facts 미삭제·assets만 재생성인지(목/주입으로). `'full'`은 기존 동작 유지(회귀).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(마이그레이션 적용·실제 셀 실행은 사람이 머지 후. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 되돌림 전이 4개가 마이그레이션·enums에 **일치**하게 추가됐는가(기존 전이 보존).
   - `fromStep='examples'`가 ②③ 스킵·facts 보존·assets만 재생성인가. `'full'`은 회귀 없이 기존대로인가.
   - 리서치 내부 재진입이 rework_count를 안 올리는가(주석·코드 명시).
   - 액션·UI·scope augment를 **안 건드렸는가**(다음 step).
3. `phases/research-step-reentry/index.json`의 step 0 갱신(completed+summary/error/blocked). **유효 JSON.**

## 금지사항

- 검증 로직(7무결성가드·삼각검증·금융 에스컬레이션·fact_verifier)을 바꾸지 마라. 이유: 이 phase는 **재진입(흐름 제어)만**, 검증 품질 불변.
- `fromStep='examples'`에서 `research_facts`를 삭제하지 마라(③ 산출 보존이 핵심 — assets만 재생성).
- 되돌림 전이를 단방향 기존 전이 대체로 만들지 마라(additive로 추가만).
- 리서치 내부 재진입에 교차단계 rework_count를 올리지 마라(반복 제약은 비용 캡).
- 기존 테스트를 약화/삭제하지 마라.
