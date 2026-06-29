# Step 1: scope-candidates

셜록 scope를 **'제안'으로** 바꾼다: 검증 후보(claims/concepts)를 **목차 섹션을 고루 커버**해 전부 생성하고(블라인드 절단 없음), `stage_proposals(stage='research')`에 저장한 뒤 `structure_selected → research_scoped`로 전이한다. **fan-out 검증은 하지 않는다**(그건 사용자 선택 후 step2). 이 step이 "몰래 안 잘림 + 섹션 커버"를 만든다.

## 읽어야 할 파일

- `src/pipeline/researchCell.ts` — 현재 `scopeStep → slice(blind) → fan-out` 흐름(L67-73 등). scope 부분을 **scope-only 경로로 분리**한다. structure(outline) payload 읽는 부분.
- `src/agents/sherlock_lead/schema.ts` — `SHERLOCK_SCOPE_SYSTEM`/`SHERLOCK_SCOPE_SCHEMA`. 섹션 커버·중요도·`section` 태그 지시/필드 추가.
- `src/agents/sherlock_lead/step.ts` — `scopeStep`. 입력에 budget(기본 선택 개수 제안용) 전달.
- `src/pipeline/stageContract.ts` `runProposalStage` + `src/pipeline/gate.ts` — 제안을 `stage_proposals`에 저장하는 패턴(candidates 배열·proposalId). 이걸 **미러링**해 research 후보를 저장.
- `src/domain/enums.ts`(step0) — `research_scoped` 상태·전이.
- `src/inngest/functions/researchStage.ts`·`src/inngest/client.ts` — 리서치 이벤트·함수. scope-only 진입 분기.
- `src/lib/dashboard/proposalTypes.ts` — `CandidateView{idx,payload,evidence_ids}` 형태(후보 payload 모양 참고).

## 작업

### 1) scope 프롬프트·스키마 — `sherlock_lead/schema.ts`
- `SHERLOCK_SCOPE_SYSTEM`: "**목차 각 섹션을 고루 커버**(특정 섹션 쏠림 금지, 모든 섹션이 최소 1개)", "각 항목이 어느 섹션을 뒷받침하는지 `section`에 기재", "**중요도순으로** 정렬(틀리면 시청자 손해 보는 것 우선)". budget은 '기본 선택 개수 힌트'일 뿐 **상한이 아니다 — 후보는 빠짐없이 내라**(사용자가 고를 것).
- `SHERLOCK_SCOPE_SCHEMA`: claims·concepts items에 **`section`(string, 옵셔널)** + 중요도 신호(예: `priority` 1~N 또는 정렬 순서로 대체) 추가. 기존 필드(text/is_financial, name/needs_*) 유지.

### 2) scope-only 셀 경로 — `researchCell.ts`에서 분리 (예: `src/pipeline/researchScope.ts` 신규)
```ts
// 셜록 scope만 실행 → 후보를 stage_proposals(stage='research')에 저장 → research_scoped 전이.
//   fan-out 검증 안 함. budget(섹션 비례 기본선택 힌트)도 함께 저장(UI 기본 체크용).
export async function runResearchScope(runId: string, deps: ...): Promise<...>;
```
- structure(outline) 읽기 → `scopeStep(llm, runId, {topic,title,outline,budget})` → 후보 배열 구성:
  - 각 후보 payload = `{ kind: 'claim'|'concept', section, ...해당 필드(claim text/is_financial · concept name/needs_*) }`, idx, importance.
- `stage_proposals`에 `stage='research'`로 candidates 저장(runProposalStage 저장부 미러). **블라인드 slice 제거 — 후보 전부 저장.**
- 기본 선택 힌트: `computeResearchBudget`(섹션 수 비례, 아래)로 "기본 체크할 개수"를 산출해 proposal에 같이 저장(또는 importance 상위 N 표시). UI(step3)가 이걸 기본 체크로 씀.
- 전이: `structure_selected → research_scoped`. (진행표시 `setProgress` "1/2·검증 범위 생성(셜록)" 등 가능.)

### 3) 섹션 비례 기본선택 헬퍼 — 신규 `src/pipeline/researchBudget.ts` (순수)
```ts
export function countOutlineSections(outline: unknown): number;          // {outline:[...]} 길이, 못 읽으면 0
export function suggestDefaultSelection(sectionCount: number, research): { claims: number; concepts: number };
//   섹션 비례(예: 섹션당 ~1.5 claim) + floor/ceiling. '기본 체크 개수' 제안일 뿐 상한 아님.
```
- `config.research`에 `claimsPerSection`/`conceptsPerSection`/floor/ceiling 추가(+`.env.example`). 순수 함수 + 테스트.

### 4) Inngest 분기 — `researchStage.ts`
- `run/research.requested` → **scope-only**(`runResearchScope`)로 진입(structure_selected에서). 검증(`researching`)은 step2의 선택 이벤트가 트리거.

### 5) 픽스처 재기록
- scope SYSTEM·입력 변경 → `sherlock_lead` promptHash 변함 → 영향 fixture를 **claude-p로 재기록**(`set -a; . ./.env; set +a; LLM_BACKEND=claude-p LLM_FIXTURES=record`). `npm test` 그린 확인. stray fixture 격리(git status).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(scope 픽스처 재기록 후 test 그린. 실제 풀런은 사람이 dev에서. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - scope가 **후보를 빠짐없이** 생성·저장하는가(블라인드 slice 제거). 섹션 `section` 태그·중요도순.
   - 후보가 `stage_proposals(stage='research')`에 저장되고 `structure_selected→research_scoped` 전이만 하는가(**fan-out 검증 안 함**).
   - `countOutlineSections`/`suggestDefaultSelection`이 순수·테스트됨. budget이 '상한'이 아니라 '기본선택 힌트'로 쓰이는가.
   - promptHash 변경 fixture 재기록 후 test 그린, stray 없음.
   - 검증 로직(fan-out·7무결성가드)을 **아직 호출 안 함**(step2 몫).
3. `phases/research-scope-gate/index.json`의 step 1 갱신. **유효 JSON.**

## 금지사항

- budget을 후보 생성의 **상한(절단)으로 쓰지 마라**. 이유: 사용자 요구=몰래 안 자름. budget은 UI 기본체크 힌트일 뿐, 후보는 전부 저장.
- 이 step에서 fan-out 팩트검증을 돌리지 마라. 이유: 검증은 사용자 선택 후(step2) — scope만.
- `stage_proposals` 저장을 새 방식으로 발명하지 마라. 이유: runProposalStage 패턴 재사용(드리프트 0).
- 7무결성가드·researchReconcile 등 검증 로직을 바꾸지 마라(이 phase는 커버리지·선택만).
- 픽스처 재기록 시 범위 외 stray fixture를 섞지 마라(rules.md).
- 기존 테스트를 약화/삭제하지 마라.
