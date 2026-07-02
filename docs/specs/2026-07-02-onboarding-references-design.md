# 온보딩 레퍼런스 3개 + 필수시청 표시 (onboarding-references) — 설계

_2026-07-02 · 대화로 확정(brainstorming) · Phase A (쏙이 개선 1/3)_

## 목적 (item 1 + 2)

쏙이 궁금증 아크의 근거를 **레퍼런스 영상 1개 → 3개**로 넓히고(더 풍부·편향 완화), 그 3개를 **"필수 시청 유튜브 영상"으로 스크립트 위에 노출**한다. 현재 레퍼런스는 `prepareOnboarder`에서 ephemeral하게 수집돼 저장 안 됨 → 저장 경로 신설.

## 결정 (확정)

- **10개 검색 → 배수 상위 3개**(`rankExternalByMultiplier` n=3). "3개"는 목표치.
- **반드시 확보(A+B)**: 필터를 **점진 완화**로 최대한 3개 채우고(구독자 하한 → 조회수 조건 → 검색어 순으로 풂), 그래도 **0개면 온보딩을 막는다**(throw → 실패 표시). refs 없이 아크 생성 안 함. 희귀 주제로 1~2개만 존재하면 그건 허용(≥1 보장·0이면 블록).
- **refs 저장**: 아크 payload(jsonb)에 `references` 필드 추가 → 마이그레이션 0.

## Step 분해

### step0 `onboarder-multi-ref` (백엔드 · 순수+수집)
- `src/agents/onboarder/prepare.ts`의 `gatherReference`(단일) → **다중 수집**: `gatherExternalSignals(maxPerQuery≈10)` → `pickTopReferences(items, 3)`(신규·`rankExternalByMultiplier` n=3 재사용). 3개 미만이면 **점진 완화 재수집**(FLOOR_SUBS 제거 → viewCount 필터 제거 → 검색어 완화). 최종 0개면 `prepareOnboarder`가 **throw**.
- `OnboarderInput`(schema.ts) 다중화: `references: { title, url, videoId, transcript?, videoFacts? }[]`(각 영상별 자막·미검증사실). 기존 단일 `transcript/videoFacts/referenceTitle`는 제거 또는 `references[]`로 흡수.
- `ONBOARDER_SYSTEM`: "여러 레퍼런스 영상의 자막·사실을 근거로" 아하 작성하도록 보강(단일→복수). money-safety(미검증 수치 unverifiedNumbers) 규칙 유지.

### step1 `store-references` (저장 · 백엔드)
- `runOnboarding`(onboarding.ts) insert 시 arc payload에 `references`(경량: title·url·videoId — 자막 전문은 저장 안 함, 용량) 포함. 
- 리더 `loadOnboardingReferences(supa, runId): Promise<Ref[]>`(loadOnboardingArc 미러·없으면 []). 
- **0개 블록**: gather가 0이면 throw가 onboardingStageFn(captureStageFailure)로 잡혀 실패 상태 → UI가 "레퍼런스 못 찾아 온보딩 불가" 표면화(RequestOnboardingButton 근처).

### step2 `must-watch-ui` (프론트)
- `page.tsx`/스크립트 섹션 상단에 **"필수 시청 유튜브 영상"** 패널 — `loadOnboardingReferences`로 3개 title+링크(youtube url·`safeHref`) 렌더. script_review + 읽기뷰(SegmentList) 양쪽. refs 없으면 패널 숨김. TRUS 3색·`<img>` 썸네일은 있으면(onError 방어) 없으면 텍스트만.

## 불변식
- 마이그레이션 0(payload jsonb 확장). 의존성 0. 레퍼런스 0개 아니면 기존 동작 유지.
- 자막 전문은 저장 안 함(입력에만·용량). 저장은 title/url/videoId 경량.

## 비스코프
- 레퍼런스 수동 교체/추가 UI(후속). 자막 캐싱.
