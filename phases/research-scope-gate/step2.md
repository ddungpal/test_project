# Step 2: scope-select-verify

사용자가 고른 검증 후보만 리서치하도록, **선택 기록 + 검증 트리거 + 검증 셀(선택분만)** 을 잇는다. `research_scoped`에서 사용자가 선택 → `stage_selections`에 기록 → `research_scoped → researching` 전이 → 선택된 claims/concepts만 fan-out 검증 → `research_ready`.

## 읽어야 할 파일

- `src/pipeline/researchScope.ts`(step1) — scope 후보 저장 형태(`stage_proposals(stage='research')` candidates payload `{kind,section,...}`).
- `src/pipeline/researchCell.ts` — 기존 fan-out 검증부(verifyClaimStep·셈이·유이·critic·reconcile·저장). 이걸 **선택된 후보만 입력**받게 한다(검증 로직 자체는 불변).
- `src/pipeline/gate.ts` `selectProposal`/`editSelectedTitle` — 사용자 선택을 `stage_selections`에 기록하고 상태 전이하는 패턴(미러). **다중 선택**(claim/concept 여러 개)이라 `edited_payload`에 선택 집합을 저장하는 방식 참고.
- `src/app/actions/topicRun.ts` — 서버 액션 패턴(requireOwner·transitionRun·inngest.send). 여기에 선택 액션 추가.
- `src/inngest/functions/researchStage.ts`·`src/inngest/client.ts`(step1) — 이벤트·함수. 선택 후 검증 트리거.
- `src/domain/enums.ts`(step0) — `research_scoped → researching` 전이.

## 작업

### 1) 선택 기록 — `src/pipeline/researchScope.ts`에 추가(또는 gate.ts)
```ts
// 사용자가 고른 scope 후보 idx 집합을 stage_selections에 기록 + research_scoped→researching 전이.
//   다중 선택: edited_payload에 {selectedClaimIdx:number[], selectedConceptIdx:number[]} 저장.
export async function selectResearchScope(
  supa, runId, proposalId,
  selected: { claims: number[]; concepts: number[] },
): Promise<void>;
```
- `run.state==='research_scoped'`에서만 허용(아니면 throw). proposal이 그 run의 stage='research'인지 검증.
- 선택 0개 가드: 최소 1개 이상(전부 빼면 리서치할 게 없음) — 명확한 에러 또는 빈 검증 허용 여부는 안전하게 "최소 1개" 권장.
- `stage_selections` INSERT 후 `transitionRun(research_scoped→researching)` → 검증 이벤트 발사.

### 2) 서버 액션 — `src/app/actions/topicRun.ts`
```ts
export async function selectResearchScopeAction(
  runId: string, proposalId: string,
  selected: { claims: number[]; concepts: number[] },
): Promise<void>;  // requireOwner → selectResearchScope → (전이는 위에서) 
```
- 검증 이벤트(`run/research.verify.requested` 신규 또는 `research.requested` + 플래그)를 발사해 fan-out 검증 시작. (researchStage가 researching 상태면 검증 경로로 분기.)

### 3) 검증 셀 — 선택분만 — `researchCell.ts`
- 검증 진입(`researching`)에서 **`stage_selections`의 선택 집합을 읽어** 해당 claims/concepts만 fan-out:
  ```ts
  const selected = await loadSelectedScope(supa, runId); // proposal candidates ∩ selection
  const claims = selected.claims;     // 블라인드 slice 없음 — 사용자가 고른 그대로
  const concepts = selected.concepts;
  ```
- 이후 기존 검증 로직(verifyClaimStep 병렬·셈이/유이·critic·reconcile·research_facts/explanation_assets 저장·에스컬레이션) **그대로**. `section` 메타는 보존하되 검증 로직은 불변.
- 멱등: 이미 research_ready면 기존 결과 반환(기존 가드 유지).

### 4) Inngest 이벤트/함수 — `client.ts`/`functions/index.ts`
- 선택 후 검증 트리거 이벤트 등록·핸들. researchStage가 (a)structure_selected→scope-only, (b)researching→검증 으로 분기하거나, 검증 전용 함수 추가. 등록 누락 없게(functions 배열).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 검증 풀런·이벤트는 사람이 dev에서. callLLM/DB는 AC에서 호출 안 함. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - `selectResearchScope`가 `research_scoped`에서만·다중선택을 `stage_selections`에 기록·`→researching` 전이하는가. 선택 0개 가드 있는가.
   - 검증 셀이 **선택된 후보만** fan-out 하는가(블라인드 slice 없음·사용자가 고른 그대로).
   - 7무결성가드·셈이/유이·critic·에스컬레이션·저장 로직이 **불변**인가(분량 입력만 선택분으로 교체).
   - Inngest 이벤트·함수가 등록되고 scope-only↔검증 분기가 맞는가.
3. `phases/research-scope-gate/index.json`의 step 2 갱신. **유효 JSON.**

## 금지사항

- 검증 로직(7무결성가드·삼각검증·금융 도메인 제한·에스컬레이션·research_facts 스키마)을 바꾸지 마라. 이유: 이 phase는 '무엇을 검증할지 선택'만 — 검증 품질은 불변.
- 선택 안 된 후보를 검증하지 마라(사용자 선택 존중). 반대로 블라인드 slice로 다시 자르지도 마라.
- `stage_selections` 기록을 새 방식으로 발명하지 마라(gate.ts 패턴 재사용).
- 선택 0개를 조용히 통과시키지 마라(리서치 0건 — 명확히 가드).
- Inngest 함수 등록 누락 금지(functions 배열 확인).
- 기존 테스트를 약화/삭제하지 마라.
