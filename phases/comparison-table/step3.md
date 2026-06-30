# Step 3: comparison-ui (Esther)

P3의 **검수 UI 레이어**(순수 프론트엔드). 리서치 검수 화면에서 비교가가 만든 **비교 자산을 표로** 보여주고, 검증 상태(확인 필요 칸)를 강조한다. 대본 안의 표 렌더는 P1에서 이미 완성됐으므로, 이 step은 **리서치 검수(research_review/결과) 화면**만 다룬다.

## 배경

- step0: `explanation_assets`에 `kind='comparison'`+`payload`.
- step1: 비교가가 검증된 사실로 비교 자산 생성.
- step2: 짠펜이 그 자산으로 대본 표 emit(SegmentList가 P1에서 렌더).
- 프로젝트 원칙: 리서치는 **사람이 검수**(고위험 최종확인)한다 → 비교 자산도 검수 화면에 보여야 김짠부가 표의 정확성·확인필요 칸을 점검할 수 있다.
- 현재 리서치 자산(숫자/비유)은 `researchView.ts`의 `AssetView` → `ResearchReview.tsx`로 표시된다.

## 읽어야 할 파일

- `src/lib/dashboard/researchView.ts` — `AssetView`(현재 `kind: "number"|"analogy"`, numericExample/analogy/mathVerified/distortionChecked) + `ResearchView` + `getResearchView`(자산 로드 쿼리). **comparison 반영 대상.**
- `src/components/ResearchReview.tsx` — 리서치 검수 표시 컴포넌트(자산 렌더). 여기에 comparison 표시를 추가.
- `src/components/FactCard.tsx` — 카드 표시 패턴·TRUS 토큰 참고.
- `src/components/SegmentList.tsx` — P1의 table 렌더(순수 `<table>`+TRUS). **변경 불필요** — 표 렌더 마크업 패턴을 재사용/참고만.
- step0 산출물: `src/pipeline/comparisonAsset.ts`의 `ComparisonPayload`(entities/dimensions/cells/verified).
- `CLAUDE.md` TRUS Create 디자인: Black/Yellow/White **3색만**, 그라데이션·그림자·이모지 금지.

## 작업

### 1) `researchView.ts` — comparison 자산 노출

- `AssetView`의 `kind`에 `"comparison"` 추가 + `payload`(또는 정규화된 `comparison: ComparisonPayload | null`) 필드 추가.
- `getResearchView`의 자산 쿼리 select에 `payload` 포함. comparison row는 `normalizeComparison(payload)`로 정규화해 뷰에 담는다(깨지면 표시 제외 — 깨진 시드 방어, 단일 출처 정규화).
- number/analogy 뷰는 **불변**.

### 2) `ResearchReview.tsx` — 비교표 표시

- comparison 자산을 **표**로 렌더(dimensions=행 또는 열, entity별 값). P1 `SegmentList`의 `<table>`+TRUS 패턴을 따른다(헤더 trus-yellow·보더 trus-white/15).
- **검증 강조(중요)**: `verified=false`(확인 필요) 칸은 시각적으로 구분(예: 흐리게 + "확인 필요" 텍스트) → 김짠부가 검수 시 위험 칸을 즉시 인지. money-safety의 UI 표현.
- 빈/없음 상태 안내(비교 자산 없으면 섹션 미표시 — 기존 빈상태 패턴).

### 3) 디자인

- **TRUS 3색만**(임의 색·그라데이션·그림자·이모지 금지). 검증 강조는 trus-yellow 강조/흐림 정도로.
- 기존 fact/asset 검수 UX·레이아웃 회귀 0.

## 금지/범위

- 백엔드(comparator·researchCell·scriptCell·액션)를 건드리지 마라. 순수 프론트엔드 + `researchView` 읽기 뷰모델만.
- `SegmentList.tsx`(대본 표 렌더)를 건드리지 마라(P1 완성). 렌더 패턴 재사용은 가능.
- 새 npm 의존성(표 라이브러리 등) 추가 금지 — 네이티브 `<table>`+Tailwind(YAGNI).
- TRUS 3색 외 색·그라데이션·그림자·이모지 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 디자인/아키텍처 체크리스트:
   - TRUS 3색만 썼는가(임의 색·그라데이션·그림자·이모지 0)?
   - 백엔드/`SegmentList` 변경이 **0**인가(순수 프론트엔드)?
   - `verified=false` 칸이 시각적으로 "확인 필요"로 강조되는가(money-safety UI)?
   - comparison payload가 깨졌을 때 안전하게 표시 제외되는가?
   - 기존 fact/asset 검수 표시가 회귀 없는가?
3. `phases/comparison-table/index.json`의 step 3 갱신(completed+summary / error / blocked).

## 금지사항

- 위 "금지/범위" 전체 준수.
- 명세에 없는 신규 파일(docs·다이어그램·빌드 산출물)을 커밋에 섞지 마라. `git status`로 확인하고 범위 외는 제외(하네스 `git add -A` 떠돌이 함정).
- 기존 테스트를 깨뜨리지 마라.
