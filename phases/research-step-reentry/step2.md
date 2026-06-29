# Step 2: reentry-actions

step0(되돌림 전이·셀 `fromStep`)·step1(scope 보완) 위에, 사용자가 리서치 결과/검수에서 **이전 단계로 되돌아가 다시 실행**하도록 서버 액션 + Inngest 트리거를 잇는다. UI는 step3.

## 재진입 3종
1. **① 다시 선택/보완** — `research_ready`/`research_review` → `research_scoped`(전이만, 셀 실행 없음). 사용자가 다시 선택·재생성·수동추가(step1) 후 기존 선택→검증 흐름 재사용.
2. **② 다시 검증** — `research_ready`/`research_review` → `researching` → `run/research.requested(fromStep='full')`. ②③④⑤ 재실행(재검색).
3. **④ 예시 다시 생성** — `research_ready`/`research_review` → `researching` → `run/research.requested(fromStep='examples')`. ④만 재실행(저장된 facts에서·step0).

## 읽어야 할 파일

- `src/domain/enums.ts`(step0) — 되돌림 전이.
- `src/pipeline/researchCell.ts`(step0) — `fromStep` 셀.
- `src/pipeline/researchScope.ts`(step1) — selectResearchScope/regenerate.
- `src/inngest/functions/researchStage.ts`·`client.ts`(step0) — `fromStep?` 이벤트.
- `src/app/actions/topicRun.ts` — 기존 액션 패턴(requireOwner·transitionRun·inngest.send). `regenerateThumbnails`/`requestStage` 등 미러.
- `src/pipeline/runState.ts` `transitionRun` — 전이 헬퍼.
- `src/pipeline/runGuards.ts` — 리서치 내부 재진입은 rework_count 미증가(step0 결정).

## 작업

### 서버 액션 — `src/app/actions/topicRun.ts`
```ts
// ① 로 되돌리기: research_ready/research_review → research_scoped (셀 실행 없음).
export async function backToResearchScope(runId: string): Promise<void>;

// ② 다시 검증: → researching → research.requested(fromStep='full').
export async function reverifyResearch(runId: string): Promise<void>;

// ④ 예시 다시: → researching → research.requested(fromStep='examples').
export async function regenResearchExamples(runId: string): Promise<void>;
```
- 모두 `requireOwner`. 현재 상태 가드(research_ready 또는 research_review에서만; 아니면 명확한 throw).
- ②④: `transitionRun(현재→'researching')` 후 `inngest.send({name:'run/research.requested', data:{runId, fromStep}})`. 새 이벤트/함수 만들지 말 것(기존 라우팅 재사용).
- ①: `transitionRun(현재→'research_scoped')`만. (이후 사용자가 step1/기존 선택 흐름으로 진행.)
- 리서치 내부 재진입이므로 **rework_count 미증가**(step0 정책 일관).
- auditLog(best-effort)로 재진입 종류 기록.

### Inngest 분기 확인 — `researchStage.ts`
- `researching` 진입 시 `event.data.fromStep`(기본 'full')을 셀에 전달(step0에서 배선됐으면 확인만).

### 테스트 — `tests/`
- 각 액션: 잘못된 상태에서 throw, 올바른 상태에서 전이+이벤트(목). ②=fromStep 'full', ④='examples', ①=research_scoped 전이·이벤트 없음.
- rework_count 미증가 확인.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 재진입 실행은 사람이 dev에서. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 3개 액션이 상태 가드·requireOwner·올바른 전이/이벤트(fromStep)인가.
   - ①은 셀 실행 없이 research_scoped 전이만, ②=full, ④=examples.
   - 새 Inngest 이벤트/함수 없이 `run/research.requested` 재사용인가.
   - 리서치 내부 재진입이 rework_count를 안 올리는가.
   - 검증 로직 불변.
3. `phases/research-step-reentry/index.json`의 step 2 갱신. **유효 JSON.**

## 금지사항

- 새 Inngest 이벤트/함수를 만들지 마라(기존 `run/research.requested` + fromStep 재사용).
- 잘못된 상태에서 재진입을 허용하지 마라(가드 없이 transitionRun → DB 트리거 거부/고착).
- 리서치 내부 재진입에 교차단계 rework_count를 올리지 마라.
- 검증 로직(7무결성가드·fact_verifier·금융)을 바꾸지 마라.
- 기존 테스트를 약화/삭제하지 마라.
