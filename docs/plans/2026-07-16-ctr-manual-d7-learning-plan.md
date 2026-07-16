# 노출클릭률(CTR) 수동입력 + d7 성과 학습 — 구현 계획

> **실행 방식:** 이 프로젝트는 Harness(`scripts/execute.py`)로 step을 돌린다. 실행 가능한 계획은 `phases/ctr-manual-d7-learning/`의 `stepN.md` 브리핑이 정본이다. 이 문서는 설계→task 매핑 요약이다.

**Goal:** 업로드 후 d7 조회수(API 자동) + 노출클릭률(수동입력)로 잘나온 영상의 제목·썸네일을 학습.

**Architecture:** 기존 성과 파이프라인(collect→ingest→styleRelearn) 재사용. 새 학습 로직 없음. 3가지 변경: 필드 병합 upsert(충돌 픽스) · 학습 윈도우 d7 · CTR 입력 화면.

**Tech Stack:** Next.js15 서버액션 · Supabase · TypeScript · vitest · TRUS Create 디자인.

## Global Constraints (spec verbatim)

- 마이그레이션 **0** · 새 테이블/컬럼 **0**(performance_metrics.ctr·views·avg_view_pct 이미 존재).
- 학습 자동 활성화 **금지** — draft까지 자동, activate는 기존 사람 게이트.
- 멱등 불변식: 같은 입력 재적재 시 행 수·값 불변.
- rules.md: 메트릭 컬럼 정체를 주석으로 명시 · step 완료 시 index.json 갱신 · 범위 외 untracked(fixtures 등) 제외.
- YAGNI: 자동 업로드·CSV 파싱·A/B 변형 CTR UI·traffic_source 뷰 = 비목표.

## 설계→Task 매핑

| spec 섹션 | Task(step) |
|---|---|
| 변경1 덮어쓰기 충돌 픽스 | Step 0 |
| 변경2 학습 윈도우 d1→d7 | Step 1 |
| 변경3 CTR 입력 화면 | Step 2 |
| 크래시 픽스·oauth 로더 | (이미 커밋 `fix(perf)`) |

## Step 0 — performance_metrics 필드 병합 upsert (충돌 픽스)

**Files:** Modify `src/performance/ingest.ts` · Test `tests/performance.test.ts`(확장) 또는 신규 `tests/performanceMerge.test.ts`

`ingestPerformance`의 metricRows upsert를 **read-modify-write 병합**으로: 각 (content_id, window, overall) 기존 행을 조회해 `newVal ?? existingVal`로 필드별 병합 후 upsert. `null`/`undefined`인 입력 필드는 기존 값 보존. 자동수집(ctr=null)·수동입력(ctr만·views 미제공) 둘 다 이 writer를 통과 → 서로 안 지움. **collect.ts 변경 불필요**(ctr=null이 `?? existing`으로 자연 보존).

**Interfaces produces:** `ingestPerformance` 시그니처 불변(동작만 병합으로).

## Step 1 — 학습 윈도우 d1 → d7 (폴백)

**Files:** Modify `src/performance/abLearnSource.ts:86-99` · Test `tests/`(abLearnSource 관련 or 신규)

`loadAbResultsFromDb`의 랭킹 CTR·views 조회를 d7 우선: d1·d7 둘 다 조회해 영상별 `d7.ctr ?? d1.ctr`, `d7.views ?? d1.views`. 주석 "1주일(d7) 성과 기준, 없으면 d1 폴백".

## Step 2 — CTR 입력 화면 (owner 전용)

**Files:** Create `src/app/actions/*` 서버액션(또는 copyLearn.ts에 추가) · Create 순수헬퍼 `src/lib/performance/ctrInput.ts` · Create 로더 `src/lib/dashboard/*` · Create 컴포넌트 `src/components/PerformanceInputForm.tsx` · Modify `src/app/copy-learn/page.tsx` · Test `tests/`

owner 전용 `submitVideoCtr(contentId, ctr)`: `requireOwner` → 검증(0<ctr≤100) → PerformanceEntry `{content_id, metrics:[{window:'d7', ctr}]}` 구성해 `ingestPerformance` 호출(Step 0 병합으로 views 보존) → auditLog. `/copy-learn`에 발행 영상 목록(제목·업로드일·현재 d7 조회수·저장된 CTR)+입력칸 섹션. 검증·라벨 로직은 순수헬퍼로 분리(vitest 테스트 — rules.md "컴포넌트 아닌 src/lib에").

## Self-Review

- **Spec 커버리지:** 변경1→S0, 변경2→S1, 변경3→S2, 크래시픽스→커밋됨. 비목표는 task 없음(정상). ✓
- **Placeholder:** 없음(`submitVideoCtr`는 확정 함수명). ✓
- **Type 일관성:** MetricInput.ctr(number|null)·PerformanceEntry·ingestPerformance 시그니처 spec/코드와 일치. ✓
