# Step 0: parallelize-queries  ⭐ (효과 최대)

**대시보드 서버 뷰의 순차 DB 쿼리를 병렬화한다.** 현재 페이지 로드마다 Supabase 쿼리를 하나씩 순차로 `await` → 네트워크 왕복이 누적(runDetail 13개·scriptView 10개). **독립 쿼리는 `Promise.all`로 묶어 왕복 횟수를 줄인다.** 동작(반환 데이터)은 **완전히 동일**해야 한다 — 순수 성능 리팩터.

> ⚠️ 핵심 제약: **결과가 1바이트도 달라지면 안 된다.** 의존성 있는 쿼리(앞 결과를 입력으로 쓰는 것)는 **순서 유지**, 서로 독립인 것만 병렬화. 에러 처리·best-effort 가드(컬럼 미적용 시 안 깨짐)도 그대로 보존.

## 읽어야 할 파일 (먼저 정독)
- `src/lib/dashboard/runDetail.ts` — **주 대상**. 의존 구조(분석됨):
  - `run`(1번, content_id 필요) → 이후 나머지가 이걸 씀.
  - **독립 그룹 A**(run 이후 병렬 가능): `progressNote`(runId)·`content`(run.content_id)·`links`(run.content_id)·`proposals`(runId) — 현재 순차, **서로 무관 → `Promise.all`**.
  - **독립 그룹 B**(그룹 A 이후 병렬 가능): `refContents`(←links.toIds)·`srcRows`(←proposals latestIds)·`selections`(←proposals proposalIds) — 서로 무관 → `Promise.all`.
  - = 순차 8왕복 → **3웨이브**(run → 그룹A → 그룹B).
- `src/lib/dashboard/scriptView.ts` — 10 쿼리, 같은 원칙 적용(독립 그룹 식별 후 병렬).
- `src/lib/dashboard/researchView.ts`(4)·`queries.ts`(6) — 순차 독립 쿼리 있으면 동일 적용. 의존 있으면 건드리지 마라.
- `tests/` 의 관련 테스트.

## 작업
1. `runDetail.ts`: 위 그룹 A/B를 `Promise.all`로 병렬화. 구조분해 시 **순서 보존**(`const [pn, content, links, proposals] = await Promise.all([...])`). 각 쿼리의 에러 가드·best-effort(progressNote·sources 컬럼 미적용 시 무시) **그대로**. `latestByStage`/`selByProposal` 등 후처리 로직 불변.
2. `scriptView.ts`·(해당되면)`researchView.ts`·`queries.ts`: 독립 쿼리 그룹만 `Promise.all`. 의존 체인은 순차 유지.
3. **반환 타입·필드·정렬·null 처리 전부 불변.** 동작 동일 리팩터만.

## 주의 (구체)
- best-effort 블록(`if (!pne && pn)`, `if (!sre)`)은 **throw 안 하는 가드** — 병렬화해도 이 관용(에러 시 무시) 유지. `Promise.all`이 하나라도 reject하면 전체 실패하니, **best-effort 쿼리는 `Promise.all` 안에서 자체 try/catch 또는 `.then(ok,()=>fallback)`로 감싸** 기존처럼 무시되게(throw 가드는 그대로 throw).
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.
- 범위: `src/lib/dashboard/` 의 뷰 파일만. 스키마·에이전트·컴포넌트 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. `git diff`로 **반환 로직 불변** 자가확인(쿼리 묶기만, 필드·정렬·가드 동일).
3. `phases/perf-optimization/index.json` step 0 갱신: 성공 → `"status":"completed"`, `"summary":"runDetail 8왕복→3웨이브 등 대시보드 뷰 독립쿼리 Promise.all 병렬화. 동작 불변. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.
