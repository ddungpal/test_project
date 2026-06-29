# Step 1: scope-augment

① 선택 단계(`research_scoped`)에서 **셜록 후보가 부족할 때 보완**하는 백엔드: (a) **scope 재생성**("더 뽑아줘"·이유 입력) + (b) **수동 추가**(사용자가 직접 claim/concept 입력). 수동 추가 claim의 **금융 여부는 자동 판정 + 사용자 토글 보정**. UI는 step3.

## 배경

현재 `research_scoped`에서 `selectResearchScope`(`src/pipeline/researchScope.ts`)는 **셜록 후보 중 idx 선택만** 기록(`stage_selections.edited_payload = {selectedClaimIdx, selectedConceptIdx}`). 후보가 부족해도 **추가/재생성 불가**. `loadSelectedScope`(researchCell.ts)는 후보∩선택만 복원. 이걸 (a)(b)로 확장한다.

## 읽어야 할 파일

- `src/pipeline/researchScope.ts` — `runResearchScope`(scope 생성→stage_proposals(research)→research_scoped 전이), `selectResearchScope`(선택 기록·0개 가드). 재생성·수동추가 추가.
- `src/pipeline/researchCell.ts` `loadSelectedScope`(L138-191) — candidate∩선택 복원. **수동 추가분 병합** 지점.
- `src/agents/sherlock_lead/schema.ts`/`step.ts` — scope 생성 프롬프트/스키마. 재생성 시 "이미 뽑은 것 외 추가/이유 반영" 힌트 전달.
- `src/components/RegenerateButton.tsx`·기존 "다시 생성"(이유 입력) 패턴 — 재생성 미러.
- `src/agents/topic_scout/topicMissing.ts`(또는 유사 순수 휴리스틱) — 키워드 휴리스틱 패턴 참고(금융 판정 헬퍼 미러).

## 작업

### 1) 금융 자동판정 순수 헬퍼 — 신규 `src/pipeline/financialHeuristic.ts`
```ts
// 텍스트에 금융/세금/금리/수익률/원금/제도/% 등 신호가 있으면 true. 순수·결정적.
export function detectFinancial(text: string): boolean;
```
- 키워드/패턴 기반(세금·금리·수익률·원금·배당·ETF·연금·%·만원·원 등). 테스트로 경계 고정. **표시·기본값용**(사용자가 토글로 최종 결정).

### 2) scope 재생성 (a) — `researchScope.ts`
```ts
// 셜록에게 후보를 다시(더/다르게) 뽑게 해 새 stage_proposals(research) 행 INSERT. 전이 없음(이미 research_scoped).
export async function regenerateResearchScope(supa, runId, deps, reason?: string): Promise<{ proposalId: string }>;
```
- `run.state==='research_scoped'`에서만. scopeStep에 reason(+선택적으로 기존 후보 텍스트)을 전달해 "기존 외 추가·이유 반영"하도록(중복 회피). 새 proposal INSERT(runResearchScope 저장부 재사용). **전이 안 함**(research_scoped 유지). loadSelectedScope는 최신 proposal을 읽으므로 자동 반영.
- ⚠️ 재생성은 새 proposal이라 **이전 선택(stage_selections)은 옛 proposal에 묶임** — UI가 새 후보로 다시 선택하게(step3). 백엔드는 최신 proposal 기준.

### 3) 수동 추가 (b) — 선택 기록 확장
- `selectResearchScope`의 입력·`edited_payload`를 확장: 기존 `{selectedClaimIdx, selectedConceptIdx}` + **`manualClaims: {text, is_financial, section?}[]`**, **`manualConcepts: {name, needs_number, needs_analogy, section?}[]`**. (proposal을 변형하지 않고 선택에 인라인 — 드리프트 0.)
- 0개 가드: 선택 idx + 수동 추가 합쳐 **최소 1개**.
- `loadSelectedScope`(researchCell.ts): candidate∩선택 + **manualClaims/manualConcepts를 ScopeClaim/ScopeConcept로 합쳐 반환**. 수동분도 동일 ②검증/④예시 파이프라인을 타게(section 옵셔널 보존). 수동 claim의 `is_financial`은 전달된 값 사용(자동판정+토글 결과).

### 4) 서버 액션 — `src/app/actions/topicRun.ts`
- `regenerateResearchScopeAction(runId, reason?)` (requireOwner→regenerateResearchScope).
- 기존 선택 액션이 manual 항목을 받도록 시그니처 확장(또는 selectResearchScopeAction에 manual 인자 추가).

### 5) 테스트
- `detectFinancial` 경계(금융/비금융 키워드).
- `loadSelectedScope`가 manual 항목 병합·is_financial 보존·0개 가드.
- 재생성이 새 proposal INSERT·전이 없음.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(재생성 LLM·실제 추가는 사람이 dev에서. scope 프롬프트가 바뀌면 sherlock_lead promptHash 변동분 fixture는 라이브 풀런 때 재기록. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - (a) `regenerateResearchScope`가 research_scoped에서만·새 proposal INSERT·전이 없음인가.
   - (b) 수동 추가가 `edited_payload`에 인라인 저장되고 `loadSelectedScope`가 후보선택+수동을 병합하는가(proposal 미변형).
   - 금융 자동판정 헬퍼가 순수·테스트됨. 수동 claim의 is_financial이 전달값(토글 결과) 보존인가.
   - 0개 가드가 선택+수동 합산 기준인가.
   - ②검증/④예시 파이프라인·검증 로직을 안 바꿨는가(입력 보강만).
3. `phases/research-step-reentry/index.json`의 step 1 갱신. **유효 JSON.**

## 금지사항

- 수동 추가를 proposal candidates에 직접 변형 INSERT하지 마라. 이유: proposal은 셜록 산출의 출처 — 수동분은 selection(edited_payload)에 인라인(드리프트·출처혼동 방지).
- 수동 claim의 금융여부를 자동판정만으로 확정하지 마라(사용자 토글 보정이 최종 — UI는 step3, 백엔드는 전달값 그대로 저장).
- 검증 로직(fact_verifier·7무결성가드·금융 도메인 제한)을 바꾸지 마라.
- 픽스처 재기록 시 범위 외 stray를 섞지 마라(rules.md — fixtures·docs·빌드 부산물 포함).
- 기존 테스트를 약화/삭제하지 마라.
