# 노출클릭률(CTR) 수동입력 + d7 성과 학습 설계

_작성: 2026-07-16 · 상태: 확정(구현 대기)_

## 배경 / 문제

김짠부 채널을 연동해 **업로드 후 1주일(d7) 성과로 잘나온 영상의 제목·썸네일을 학습**시키는 것이 목표. 이번 세션에서 YouTube Analytics OAuth 연동을 완료(실데이터 수신 확인)했으나, 다음이 드러남:

- **노출클릭률(CTR)은 YouTube Analytics API가 제공하지 않는다** — `impressions`/`impressionsClickThroughRate`는 `400 Unknown identifier`. Studio '도달범위' 탭 전용 지표. (테스트로 확정: `views`·`averageViewPercentage`·`subscribersGained`·`cardImpressions`는 200, 썸네일 `impressions`만 400.)
- 운영 백엔드가 그 없는 지표를 요청하고 있어 실 수집 시 무조건 크래시 → 이번 세션에 지원 지표만 요청하도록 이미 수정(`youtubeAnalytics.ts`, `ctr=null`).

**결정(사용자)**: CTR은 Studio에서 사람이 보고 **앱 화면에 수동 입력**(A안). 성과 신호 = **영상별 전체 d7 CTR 순위**(A/B 변형 비교 아님).

## 비목표 (YAGNI)

- YouTube 자동 업로드 — 하지 않음(수동 업로드 후 video_id 입력 유지).
- Studio CSV 파싱/브라우저 자동화 — 하지 않음(사람이 숫자만 입력).
- A/B 변형별 CTR 입력 UI — 하지 않음(기존 manual.json 경로가 이미 지원, 이번 범위는 영상별 전체 CTR).
- 학습 자동 활성화 — 하지 않음(draft까지 자동, activate는 기존대로 사람 게이트).

## 핵심 흐름

```
업로드 → (매일 Cron·자동) YouTube API: d7 views·avg_view_pct 수집 → performance_metrics(d7, overall)
       → (앱 화면·수동) Studio 보고 d7 노출클릭률 입력 → 같은 performance_metrics(d7, overall) 행의 ctr 만 갱신
       → (주1회 Cron or 재학습 버튼) loadAbResultsFromDb single 경로: 영상들을 d7 CTR 내림차순 정렬
         → 상위=winner·하위=loser 로 제목·썸네일 문구 학습 → style_profiles draft → 사람이 활성화
```

학습 엔진(`loadAbResultsFromDb`의 영상간 CTR 순위 합성 = single 경로)과 재학습 트리거(`styleRelearnSweep` + `/copy-learn` 재학습 버튼)는 **이미 존재 → 재사용**. 새 학습 로직 없음.

## 변경 3가지

### 1. 덮어쓰기 충돌 픽스 (correctness 핵심)

**문제**: `performance_metrics`의 unique 키는 `(content_id, metric_window, ab_variant)`. 자동수집은 `{views, ctr:null, avg_view_pct}`를, 수동입력은 `{ctr}`를 같은 (content_id, d7, overall) 행에 쓴다. 현재 `ingestPerformance`의 upsert는 **행 전체 교체** → 나중 쓴 쪽이 상대 필드를 null로 지운다. (Cron이 매일 돌므로 수동 입력한 CTR이 다음날 null로 날아간다.)

**해결: 필드 소유권 분리 + null-보존 merge**
- 자동수집 경로: `ctr` 컬럼을 **쓰지 않는다**(views·avg_view_pct·traffic_source만). YouTube API가 ctr을 못 주므로 애초에 쓸 값도 없음.
- 수동입력 경로: `ctr`만 갱신, views 등은 **건드리지 않는다**.
- 공용 규칙: performance_metrics upsert 시 **입력이 `undefined`인 필드는 기존 값 보존**(명시적 `null`과 구분). 즉 "이 필드를 비워라"가 아니라 "이 필드는 이번에 안 건드림"을 표현.

**구현 방침**: `ingestPerformance`의 metricRows upsert를 read-modify-write(기존 행 조회 → `newVal ?? existingVal` merge → upsert)로 바꾸거나, 필드별 부분 업데이트로 분리. `PerformanceMetricInput`에서 값이 제공되지 않은 필드는 merge 시 제외. **불변식: 같은 입력 재적재 시 행 수·값 불변(멱등 유지).**

기존 manual.json 경로(views+ctr 함께 입력)도 이 merge를 통과해야 하며, 그 경우 두 필드 다 제공되므로 동작 동일.

### 2. 학습 윈도우 d1 → d7

- `abLearnSource.ts` `loadAbResultsFromDb`가 랭킹 CTR을 읽는 곳(`.eq("metric_window", "d1")`)을 **d7 우선**으로.
- **d7 폴백**: d7 행이 없으면(업로드 7일 미만·구자료) d1로 폴백해 기존 동작 보존. 구현: d7·d1 둘 다 조회해 영상별 `d7.ctr ?? d1.ctr`, `d7.views ?? d1.views` 선택.
- 주석으로 "1주일 성과 기준" 명시. (rules.md의 "메트릭 컬럼 정체 명시" 준수.)

### 3. CTR 입력 화면 (앱, owner 전용)

- 위치: `/copy-learn` 페이지에 "성과 입력(노출클릭률)" 섹션 추가(신규 페이지 대신 기존 학습 허브에 통합).
- 표시: 발행 영상 목록(제목·업로드일·현재 d7 조회수·현재 저장된 CTR). `contents`에서 `youtube_video_id`·`upload_date` 있는 것만, 업로드일 내림차순.
- 입력: 영상별 CTR% 한 칸(예 `3.8`). 저장 시 서버액션 → 해당 content의 `performance_metrics(d7, overall)` 행에 **ctr만** merge(섹션 1 규칙). 행 없으면 생성(views 등은 null=미수집, Cron이 나중에 채움).
- 서버액션: `submitVideoCtr`(가칭) — `requireOwner` → 검증(0<ctr≤100) → merge upsert → auditLog. 기존 `copyLearn.ts` 서버액션 패턴·owner 게이트 재사용.
- 재학습: 기존 `/copy-learn` 재학습 버튼(`relearn*` 액션) 그대로 사용. CTR 저장 후 그 버튼을 누르면 d7 순위로 재학습.
- UI: 기존 `CopyLearningForm` 등 폼 패턴·TRUS 디자인 재사용, 새 컴포넌트는 최소.

## 데이터 / 스키마

- 마이그레이션 **0**. `performance_metrics`에 `ctr`·`views`·`avg_view_pct` 컬럼 이미 존재. 새 테이블·컬럼 없음.
- `ab_variants`: 변경 없음(single 경로가 여기의 title 행 payload로 문구를 학습 — 발행 시 적재되는 기존 파이프라인).

## 테스트 (회귀 가드)

- **merge 불변식**: 자동수집(views만)→수동입력(ctr만) 순서, 역순, 재적재 각각에서 두 필드 모두 보존되는지. 명시적 null vs 미제공 구분.
- **d7 폴백**: d7 있으면 d7, 없으면 d1 사용.
- **입력 검증**: ctr 범위 밖·비오너 거부.
- 기존 performance.test.ts(17)·abVerdict·styleRelearn 테스트 그린 유지.

## 열린 항목 (비차단)

- 여러 영상 CTR을 한 번에 저장(배치) vs 영상별 저장 — 구현 시 폼 편의로 결정, 데이터 모델 무관.
- traffic_source(유입경로)까지 볼지 — 이번 범위 밖.
