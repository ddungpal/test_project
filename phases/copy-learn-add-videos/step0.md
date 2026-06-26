# Step 0: retro-sweep-prod-guard (회고 sweep을 production_run 있는 영상으로 한정)

**회고 자동 sweep이 production_run이 있는 콘텐츠만 회고하도록 적격성 필터를 추가한다.** 순수 함수 + sweep 배선 + 테스트. UI·새 영상 추가는 다음 step.

## 배경 (왜 이렇게 — 위험 완화)
- `/copy-learn`에 학습 영상을 추가하면(다음 step) 영상마다 `performance_metrics`(d1 overall)가 저장된다.
- 그런데 `retrospectiveSweep`(`src/agents/retrospectivist/runRetrospective.ts:120`)은 **"performance_metrics 있고 retrospectives 없는 모든 content"**를 회고 대상으로 잡는다 — `eligibleForRetrospective`(96)는 **production_run 존재 여부를 보지 않는다.**
- → 학습 전용 영상(파이프라인을 안 거쳐 production_run이 없음)이 자동 회고로 쓸려가, `prepareRetrospective`가 "그때의 선택"(최신 run의 proposal→selection) 맥락을 못 찾아 **빈 맥락 저품질 insight draft를 양산**하고, 운영(API)에선 **영상당 LLM 비용**까지 든다.
- ⚠️ **이건 기존 9개 영상도 이미 잠재된 문제다**(copy-learn으로 들어온 영상은 보통 run이 없음). 이 step은 학습 영상 추가 전에 **기존분까지 같이 보호**한다.
- 해결: 회고는 **실제로 파이프라인을 거친(=production_run이 있는) 영상만** 자동 대상. 학습 전용 import는 자동 회고 제외.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md` — 계층·학습루프·비용($0).
- `src/agents/retrospectivist/runRetrospective.ts` — **주 수정 대상.** `eligibleForRetrospective`(96, 순수)·`retrospectiveSweep`(120, DB). sweep이 performance_metrics·retrospectives를 읽어 eligible을 구하는 흐름.
- `tests/retroSweep.test.ts` — `eligibleForRetrospective`/`retrospectiveSweep` 기존 테스트. **여기에 prod-run 케이스를 추가**하고 기존 케이스는 시그니처 변경에 맞춰 갱신(약화·삭제 금지).
- `src/lib/dashboard/queries.ts:25` — `production_runs`에서 `content_id`를 읽는 방식(참고).
- `supabase/migrations/20260618120003_contents_runs.sql` — `production_runs(content_id)` 스키마(있음·인덱스 존재).

## 작업
### 1) `eligibleForRetrospective` — production_run 필터 추가(순수)
시그니처에 "run 있는 content_id" 집합을 추가한다:
```ts
export function eligibleForRetrospective(
  withPerformance: string[],
  withRetrospective: string[],
  withRun: string[],          // production_run ≥1 있는 content_id (이들만 적격)
  limit: number,
): string[];
```
- 규칙: **`withRun`에 포함된 id만** 적격(성과 있음 ∧ 회고 없음 ∧ **run 있음**). 나머지는 기존과 동일(회고 있으면 제외·dedup·limit 절단·입력 순서 보존).
- 순수 유지(DB 접근 없음).

### 2) `retrospectiveSweep` — production_runs 조인
- `performance_metrics`·`retrospectives` 조회에 더해 `production_runs`에서 `content_id`를 조회(distinct) → `withRun`으로 `eligibleForRetrospective`에 전달.
- 나머지(루프·runRetrospective 호출·SweepResult)는 불변.

## 주의 (구체)
- **기존 9개 보호가 의도다**: run 없는 학습 영상은 회고 sweep에서 빠진다. 이게 정상 동작이며, 회고가 필요한 건 실제 제작 런이 있는 영상뿐이다.
- **수동 회고는 막지 마라**: 이 변경은 `retrospectiveSweep`(자동)만 좁힌다. `runRetrospective(supa, contentId)`를 직접 호출하는 경로(수동·테스트)는 그대로 둔다. 이유: 특정 영상을 의도적으로 회고하는 길은 남겨야 함.
- **시그니처 변경 → 모든 호출자·테스트 갱신**: `eligibleForRetrospective` 인자 순서가 바뀐다. 컴파일 에러 나는 곳 전부 수정(주로 sweep·테스트). 이유: 누락 시 typecheck 실패.
- **멱등·결정성 보존**: dedup·limit·입력 순서 보존 로직은 그대로. 이유: 기존 sweep 테스트(재실행 0 fetch 등).
- `noUncheckedIndexedAccess`·`exactOptionalPropertyTypes` 준수.

## 테스트 (`tests/retroSweep.test.ts`에 추가/갱신)
- run 없는 content는 성과·미회고여도 **제외**(핵심 신규 케이스).
- run 있고 성과 있고 회고 없는 content는 **포함**.
- 기존 케이스(회고 있으면 제외·limit 절단·dedup)는 `withRun`을 전부 포함시켜 **기존 동작 유지** 확인.
- `retrospectiveSweep`(DB 모의/스텁이 있으면) production_runs 조인 반영 — 기존 테스트 패턴 따름.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy가 직접 실행해 exit code 확보).
2. 체크: `eligibleForRetrospective` 순수 유지·run 없는 content 제외·기존 케이스 보존·모든 호출자 갱신됨.
3. `phases/copy-learn-add-videos/index.json` step 0 갱신(성공→completed+summary, 실패3회→error, 외부개입→blocked).

## 금지사항
- `runRetrospective`(직접 호출·수동 경로)를 막지 마라. 이유: 의도적 회고 경로 보존.
- `eligibleForRetrospective`를 비순수로 만들지 마라(DB 조회는 sweep에서). 이유: 순수성·테스트.
- 새 영상 추가·UI·copyLearn 액션을 건드리지 마라. 이유: step1·2 범위.
- 기존 테스트를 깨뜨리지 마라(시그니처 변경분은 갱신하되 의미 보존).
