# Step 0: perf-metrics-field-merge (덮어쓰기 충돌 픽스)

## 배경 (자기완결 — 이 phase의 목적)

전체 설계: `docs/specs/2026-07-16-ctr-manual-d7-learning-design.md` (읽어라). 구현 계획: `docs/plans/2026-07-16-ctr-manual-d7-learning-plan.md`.

목표: 유튜브 업로드 후 **d7(1주일) 조회수는 API 자동수집**, **노출클릭률(CTR)은 사람이 앱에 수동입력**해서, 성과 좋은 영상의 제목·썸네일을 학습시킨다. (노출클릭률은 YouTube Analytics API가 제공하지 않아 Studio 보고 수동 입력하는 게 확정 결정.)

이 step은 그 중 **덮어쓰기 충돌**을 막는다. `performance_metrics`의 unique 키는 `(content_id, metric_window, ab_variant)`. 같은 `(content_id, 'd7', 'overall')` 행에:
- **자동수집**(collect→ingest, 매일 Cron)이 `{views, ctr:null, avg_view_pct}`를 쓰고,
- **수동입력**(이 phase의 step 2가 만들 화면)이 `{ctr}`만 쓴다.

현재 `ingestPerformance`의 upsert는 **행 전체 교체**라, Cron이 다음날 돌면 사람이 넣은 CTR을 `null`로 지운다(반대로 수동입력이 views를 지울 수도). 이 step에서 **필드별 병합(null/undefined 입력은 기존 값 보존)**으로 바꾼다.

## 읽어야 할 파일

- `docs/specs/2026-07-16-ctr-manual-d7-learning-design.md` — 설계 정본(§변경1, 불변식).
- `src/performance/ingest.ts` — **수정 대상**. `ingestPerformance` 함수의 metricRows upsert(현재 `onConflict: "content_id,metric_window,ab_variant"` 전체 교체). `cleanupPerformance`(역연산)는 건드리지 마라.
- `src/performance/types.ts` — `MetricInput`(`window`·`views?`·`ctr?`·`avg_view_pct?`·`traffic_source?` 전부 `number|null` 옵셔널)·`PerformanceEntry`.
- `src/performance/collect.ts` — 자동수집이 `ingestPerformance`를 호출하는 경로(`metrics.push({window, views, ctr, avg_view_pct})`, ctr는 이제 null). **이 파일은 수정하지 않는다**(병합 규칙이 null을 자연 보존).
- `tests/performance.test.ts` — 기존 성과 테스트(17개) 패턴. 여기 확장하거나 신규 `tests/performanceMerge.test.ts`.

## 작업

### 1) `ingest.ts` — metricRows 를 병합 upsert 로

`ingestPerformance` 안에서 metricRows를 만들어 바로 upsert하던 부분(현재 `entry.metrics.map(...)` → `.upsert(metricRows, {onConflict})`)을 **기존 행 병합** 방식으로 바꾼다:

- 이 영상(contentId)의 기존 `performance_metrics` overall 행들을 한 번 조회한다(윈도우별 `views`·`ctr`·`avg_view_pct`·`traffic_source`). 예:
  ```ts
  const { data: existingMetrics } = await supa
    .from("performance_metrics")
    .select("metric_window, views, ctr, avg_view_pct, traffic_source")
    .eq("content_id", contentId)
    .eq("ab_variant", "overall");
  const prevByWindow = new Map(
    (existingMetrics ?? []).map((r) => [r.metric_window, r]),
  );
  ```
- 각 입력 metric 행을 **`입력값 ?? 기존값 ?? null`**로 병합해 upsert row를 만든다(윈도우별). `??`(nullish)라서 입력이 `null`이든 `undefined`든 기존 값을 보존한다:
  ```ts
  const prev = prevByWindow.get(m.window);
  return {
    content_id: contentId,
    metric_window: m.window,
    views: m.views ?? prev?.views ?? null,
    ctr: m.ctr ?? prev?.ctr ?? null,          // 노출클릭률% — 수동입력만 채움. 자동수집은 null → 기존 CTR 보존.
    avg_view_pct: m.avg_view_pct ?? prev?.avg_view_pct ?? null,
    traffic_source: m.traffic_source ?? prev?.traffic_source ?? null,
    ab_variant: "overall",
    recorded_at: nowIso,
  };
  ```
- upsert는 그대로 `onConflict: "content_id,metric_window,ab_variant"` 유지(병합된 값으로 교체 = 결과적으로 필드 보존).

**주석 필수**(rules.md — 메트릭 컬럼 정체 명시): `ctr`이 노출클릭률이고 자동수집은 못 채워 수동입력만 채운다는 점, `?? prev`가 서로 안 지우게 하는 병합이라는 점을 코드 주석으로.

### 2) 회귀 테스트

신규 `tests/performanceMerge.test.ts`(또는 performance.test.ts 확장). 실제 supabase 없이 **인메모리 스텁 supa**(기존 테스트가 쓰는 mock 패턴 재사용 — performance.test.ts 참고)로:

- **자동→수동 순서 보존**: `{views:1000, ctr:null}` 적재 후 `{ctr:3.8}`(views 미제공) 적재 → 최종 행 `views===1000 && ctr===3.8`.
- **수동→자동 순서 보존**: `{ctr:3.8}` 적재 후 `{views:1000, ctr:null}` 적재 → `views===1000 && ctr===3.8`(자동이 ctr 안 지움).
- **멱등**: 같은 `{views:1000, ctr:3.8}`를 2회 적재 → 값 불변(행 수도 불변).
- **manual.json 경로 하위호환**: `{views, ctr, avg_view_pct}` 다 제공 시 세 값 다 반영.

기존 performance.test.ts 17개는 계속 그린이어야 한다(스텁이 `.select().eq().eq()` 체인을 지원하는지 확인 — 없으면 스텁 확장).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- 빌드가 stale `.next`(PageNotFoundError/webpack chunk)로 깨지면 `rm -rf .next` 후 재판별(코드 무관 캐시 오류 오판 금지). **dev 서버 켜진 채 build 하지 마라**(dev 500 footgun) — 켜져 있으면 kill→build→재기동.
- 기존 test 1454 → 신규 테스트만큼 증가, 0 실패.

## 검증 절차

1. AC 실행.
2. 병합 불변식(위 4개 테스트) 통과 확인.
3. `git status`로 범위 외 untracked(fixtures/parity·tavily·youtube replay 등) 제외 — `git add`는 `src/performance/ingest.ts`·테스트 파일만.
4. `phases/ctr-manual-d7-learning/index.json` step 0 갱신(completed + summary / 실패 시 error).

## 금지사항

- `collect.ts`·`youtubeAnalytics.ts`·`cleanupPerformance` 수정 금지(이 step 범위는 ingest 병합만).
- 마이그레이션·새 컬럼·새 테이블 금지(컬럼 이미 존재).
- `ab_variants` upsert 로직 건드리지 마라(이건 metricRows만).
- 명시적 "필드 비우기(null로 clear)" 기능 만들지 마라 — 설계상 불필요(삭제는 cleanupPerformance 소관).
