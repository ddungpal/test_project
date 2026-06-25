# Step 1: views-data-wiring (데이터 배선 — 입력 → 저장 → 로드 → 스코어 주입)

**24h 조회수를 폼 입력 계약부터 학습 스코어까지 관통시키는 백엔드.** step0이 만든 `ctrWeightedScore(videoViews24h, viewsReference)`에 실제 데이터가 흐르게 한다. UI는 step2.

## 배경 (왜 이렇게)
- step0에서 `ctrWeightedScore`가 `videoViews24h`·`viewsReference`를 받도록 확장됨(둘 없으면 기존과 동일).
- 이 step은 그 인자에 **실데이터를 채운다**: 폼 입력 → `performance_metrics.views` 저장 → 재학습 시 로드 → 코퍼스 reference 산출 → 스코어 주입.
- **마이그레이션 불필요**: `performance_metrics.views` 컬럼이 이미 존재(현재 copy-learn에서만 미사용). `mapCtr24hToMetricRow`가 ctr만 쓰던 걸 views도 쓰게 확장.
- **reference = 코퍼스 상대 기준**: `buildAbStyleInput`(`scripts/learn-ab-style.ts:155`)이 학습대상 영상 전체를 순회하므로, 여기서 `viewsReference = max(video_views24h)`를 1회 산출해 각 `ctrWeightedScore` 호출에 넘긴다.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md`, `docs/tech.md`(§13.2), `CLAUDE.md`.
- `src/performance/abVerdict.ts` — step0이 확장한 `ctrWeightedScore`·`CtrWeightArgs`(videoViews24h/viewsReference 인자) — **시그니처 그대로 사용**.
- `src/app/actions/copyLearnMap.ts` — **수정 대상.** `CopyAbInput`(14)·`mapCtr24hToMetricRow`(121). views를 입력 계약 + d1 overall 행에 추가.
- `src/app/actions/copyLearn.ts` — `saveCopyAbResults`가 `mapCtr24hToMetricRow`를 호출하는 지점. CopyAbInput에 views가 흐르게.
- `src/performance/abLearnSource.ts` — **수정 대상.** `loadAbResultsFromDb`(62) — `performance_metrics`에서 `ctr`만 select(88) → `views`도 select하고 `video_views24h`로 채운다. ab 경로(127)·single 경로(158) 둘 다.
- `scripts/learn-ab-style.ts` — **수정 대상.** `AbResultVideo`(66) 인터페이스에 `video_views24h?` 추가. `buildAbStyleInput`(155)에서 reference 산출 + `ctrWeightedScore` 호출(172·209) 2곳에 `videoViews24h`/`viewsReference` 주입.
- `src/lib/dashboard/copyLearnView.ts` — `getCopyLearnVideos`가 `performance_metrics`에서 ctr24h를 읽는 지점. views24h도 읽어 `CopyLearnVideo`에 싣는다(step2 폼 프리필용).
- `tests/copyLearnStore.test.ts`·`tests/abStyleLearn.test.ts`·`tests/ctrWeightedLearning.test.ts` — 기존 매핑·학습 테스트.
- DB: `performance_metrics`(content_id·metric_window 'd1'·ab_variant 'overall'·`ctr`·**`views`**(기존 컬럼)·unique(content_id,metric_window,ab_variant)).

## 작업
### 1) `copyLearnMap.ts` — 입력 계약 + d1 행에 views
- `CopyAbInput`에 `views24h: number | null` 추가(ctr24h 옆).
- `mapCtr24hToMetricRow`: 반환 행에 `views: input.views24h` 추가(ctr는 그대로). 함수명은 유지(이름까지 바꾸면 diff 커짐 — ponytail).
- `saveCopyAbResults`(copyLearn.ts) 경로에서 views24h가 멱등 upsert에 포함되는지 확인(performance_metrics onConflict로 같은 영상 재저장 시 views 갱신).

### 2) `abLearnSource.ts` — views 로드
- `loadAbResultsFromDb`의 `performance_metrics` select에 `views` 추가.
- `ctrById` 옆에 `viewsById: Map<string, number|null>` 구성.
- ab 경로·single 경로 `out.push({...})`에 `video_views24h: viewsById.get(cid) ?? null` 추가.

### 3) `learn-ab-style.ts` — AbResultVideo 확장 + reference 산출 + 주입
- `AbResultVideo`에 `video_views24h?: number | null` 추가(`video_ctr24h` 옆, 주석=파일 시드엔 보통 없음→null→vconf 무가중·하위호환).
- `buildAbStyleInput` 진입부에서 **1회**:
  ```ts
  const viewsReference = Math.max(0, ...videos
    .map((v) => v.video_views24h)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0));
  // 전부 null → 0 → ctrWeightedScore에서 vconf=1.0(하위호환).
  ```
- `ctrWeightedScore` 호출 2곳(single 172·ab 209)의 args에 `videoViews24h: video.video_views24h ?? null, viewsReference` 추가.

### 4) `copyLearnView.ts` — views24h 읽기(step2 프리필)
- `CopyLearnVideo`에 `views24h: number | null` 추가.
- `getCopyLearnVideos`의 performance_metrics 조회에 `views` 포함 → 매핑.

## 주의 (구체)
- **멱등 보존**: performance_metrics는 onConflict(content_id,'d1','overall') upsert 유지. 재저장 시 views가 행을 늘리지 않고 갱신돼야 함. 이유: 표본 오염 방지.
- **하위호환**: 파일 시드(`ab-results.json`)·기존 DB 행에 views가 없으면 `video_views24h=null` → `viewsReference`가 0이거나 해당 영상 vconf=1.0 → **기존 학습 결과 불변**. 이유: 기존 parity 픽스처·테스트 보존.
- **reference는 코퍼스 max 1회 산출**(영상마다 다시 구하지 마라). 이유: O(n) 유지·일관.
- **promptHash 영향 없음 확인**: 이 변경은 학습 *가중치*만 바꾼다. 제안 생성(hook_maker/thumbnail_maker) 프롬프트 입력은 안 건드린다 → forward 파이프라인 픽스처 불변이어야 함. 이유: 오프라인 $0 회귀 금지.
- `exactOptionalPropertyTypes`(옵셔널에 undefined 명시대입 금지 — 조건부 할당)·`noUncheckedIndexedAccess` 준수.

## 테스트 (기존 파일에 추가)
- `copyLearnStore.test.ts`(또는 매핑 테스트): `mapCtr24hToMetricRow`가 `views=views24h`를 d1 overall 행에 싣는다. views24h=null → views null.
- `abStyleLearn.test.ts`: `buildAbStyleInput`에서 두 영상(고조회 vs 저조회, 같은 결정력·CTR) → 고조회 영상 weight > 저조회 weight. 전부 views null → 기존 weight와 동일(하위호환).
- (선택) `loadAbResultsFromDb` 목 테스트가 있으면 views 매핑 1건.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수). 기존 `abStyleLearn`·`ctrWeightedLearning`·`copyLearnStore` 테스트가 그대로 통과(하위호환)하는지.
2. 체크: views 멱등 저장·loadAbResultsFromDb views 로드·buildAbStyleInput reference 1회 산출·ctrWeightedScore 2곳 주입·promptHash 무영향.
3. `phases/copy-views-weight/index.json` step 1 갱신.

## 금지사항
- DB 마이그레이션 작성 금지. 이유: `performance_metrics.views` 컬럼 기존재.
- 제안 생성 프롬프트 입력(hook_maker/thumbnail_maker prepare) 수정 금지. 이유: forward 픽스처 보존·이 step은 학습 가중만.
- views 없는 기존 데이터의 학습 결과를 바꾸지 마라. 이유: 하위호환·픽스처 보존.
- UI(CopyLearningForm·page) 수정 금지(step2). 이유: 범위.
- 라이브 DB·네트워크 의존 테스트 금지(순수 매핑·목). 이유: 오프라인 $0.
- 기존 테스트를 깨뜨리지 마라.
