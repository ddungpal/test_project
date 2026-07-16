# Step 1: learning-window-d7 (학습 윈도우 d1 → d7)

## 배경 (자기완결)

전체 설계: `docs/specs/2026-07-16-ctr-manual-d7-learning-design.md` (읽어라, §변경2).

목표는 **업로드 후 1주일(d7) 성과**로 제목·썸네일을 학습하는 것이다. 그런데 학습 입력을 만드는 `loadAbResultsFromDb`는 영상 랭킹에 쓸 CTR·조회수를 **d1(24시간)** 윈도우에서 읽는다(`.eq("metric_window", "d1")`). "1주일 성과"라는 취지와 어긋난다.

이 step은 그 조회를 **d7 우선(없으면 d1 폴백)**으로 바꾼다. (step 0에서 d7 overall 행에 자동수집 views + 수동입력 ctr이 병합되어 들어온다.)

## 읽어야 할 파일

- `docs/specs/2026-07-16-ctr-manual-d7-learning-design.md` — §변경2.
- `src/performance/abLearnSource.ts` — **수정 대상**. `loadAbResultsFromDb` 함수의 `performance_metrics` 조회 부분(현재 `.eq("metric_window", "d1")` → `ctrById`/`viewsById` 맵 구성). 이 맵이 `video_ctr24h`/`video_views24h`로 나가 랭킹에 쓰인다(single 경로=영상간 CTR 순위, ab 경로 둘 다).
- `src/performance/abVerdict.ts` — `ctrWeightedScore`가 `video_ctr24h`를 어떻게 쓰는지(랭킹 신호). **수정 불필요**, 이해용.
- `tests/` 중 abLearnSource·styleRelearn 관련 테스트 — 회귀 패턴.

## 작업

### 1) `abLearnSource.ts` — d7 우선 조회 + d1 폴백

`performance_metrics` overall 조회를 d1 하나가 아니라 **d1·d7 둘 다** 가져와 영상별로 d7 우선 선택:

- 조회 필터를 `.eq("metric_window", "d1")` → `.in("metric_window", ["d1", "d7"])`로.
- 영상별로 d7 행이 있으면 d7, 없으면 d1을 쓰도록 맵 구성:
  ```ts
  // 1주일(d7) 성과 우선 — 업로드 7일 미만·구자료는 d1 폴백. CTR은 수동입력(노출클릭률), views는 자동수집.
  const d7 = new Map<string, { ctr: number | null; views: number | null }>();
  const d1 = new Map<string, { ctr: number | null; views: number | null }>();
  for (const r of perf ?? []) {
    (r.metric_window === "d7" ? d7 : d1).set(r.content_id, { ctr: r.ctr, views: r.views });
  }
  for (const cid of contentIds) {
    const pick = d7.get(cid) ?? d1.get(cid) ?? { ctr: null, views: null };
    ctrById.set(cid, pick.ctr);
    viewsById.set(cid, pick.views);
  }
  ```
  (조회 select에 `metric_window`를 포함시켜야 한다 — 현재 `select("content_id, ctr, views")`에 `metric_window` 추가.)

**주석 필수**(rules.md): "1주일(d7) 성과 기준, 없으면 d1 폴백" + ctr=노출클릭률(수동입력)·views=자동수집.

### 2) 회귀 테스트

`tests/`에 신규 또는 기존 abLearnSource 테스트 확장(인메모리 스텁 supa — 기존 패턴 재사용):

- **d7 우선**: 한 영상에 d1(ctr=3.0)·d7(ctr=5.0) 둘 다 있으면 랭킹 CTR = 5.0(d7).
- **d1 폴백**: d7 없고 d1(ctr=3.0)만 있으면 3.0.
- **둘 다 없음**: null(랭킹에서 안전 강등 — 기존 동작).
- 스텁의 `performance_metrics` 조회가 `.in("metric_window", [...])`를 지원하는지 확인(없으면 스텁 확장).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- stale `.next` 깨짐 시 `rm -rf .next`(dev 켜져 있으면 kill 후). dev 켠 채 build 금지.
- 기존 테스트 0 실패.

## 검증 절차

1. AC 실행.
2. d7 우선·d1 폴백·null 3케이스 통과 확인.
3. `git status`로 범위 외 untracked 제외 — `git add`는 `src/performance/abLearnSource.ts`·테스트만.
4. `phases/ctr-manual-d7-learning/index.json` step 1 갱신.

## 금지사항

- ab 경로(영상 내 A/B 비교) 로직·`judgeComponent`·`ctrWeightedScore` 수정 금지(조회 윈도우만 바꾼다).
- 학습 활성화 자동화 금지(draft 게이트 유지).
- 마이그·의존성 금지.
