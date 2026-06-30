# Step 3: case-ui (Esther)

P4의 **검수 UI 레이어**(순수 프론트엔드). 리서치 검수 화면에서 분기가가 만든 **케이스 자산을 분기 목록으로** 보여주고, 미검증 분기(확인 필요)를 강조한다. P3 step3(`comparison-ui`)와 **구조가 동일**하다. 대본 안의 케이스 렌더는 P1에서 완성됐으므로, 이 step은 **리서치 검수 화면**만 다룬다.

## 배경

- step0: `explanation_assets.kind='case'`+payload(마이그31).
- step1: 분기가가 댓글 발굴 + 검증된 사실로 케이스 자산 생성.
- step2: 짠펜이 그 자산으로 대본 케이스 emit(SegmentList가 P1에서 렌더).
- 리서치는 사람이 검수 → 케이스 자산도 검수 화면에 보여야 분기·확인필요를 점검한다.
- **P3 step3가 이미 `ComparisonAssetTable.tsx` + `researchView`/`ResearchReview`/`page.tsx` 분기**를 만들어뒀다 → 이 step은 그 패턴을 case로 복제.

## 읽어야 할 파일

- `src/lib/dashboard/researchView.ts` — `AssetView`(P3에서 `kind: ...|"comparison"`, `comparison: ComparisonPayload|null` 추가됨). 여기에 case 추가.
- `src/components/ComparisonAssetTable.tsx` — **P3 step3의 순수 표시 컴포넌트**(TRUS 표·verified=false 흐림+"확인 필요" 라벨·접근성). **이 step의 `CaseAssetView`(또는 유사)는 이 패턴을 미러**.
- `src/app/runs/[id]/page.tsx` — **P3 step3가 ResearchPanel 자산 루프에 comparison 분기**를 추가한 곳. case 분기를 같은 방식으로 추가.
- `src/components/ResearchReview.tsx`·`FactCard.tsx` — 검수 표시·TRUS 토큰.
- `src/components/SegmentList.tsx` — P1의 case 렌더('조건 → 결과'). **변경 불필요** — 패턴 참고만.
- step0 산출물: `src/pipeline/caseAsset.ts`의 `CaseAssetPayload`/`CaseBranch`.
- `CLAUDE.md` TRUS Create: Black/Yellow/White **3색만**, 그라데이션·그림자·이모지 금지.

## 작업

### 1) `researchView.ts` — case 자산 노출

- `AssetView`의 `kind`에 `"case"` 추가 + `case: CaseAssetPayload | null` 필드 추가(comparison 패턴 미러).
- `getResearchView`의 자산 쿼리는 P3에서 이미 `payload` select 포함 — case row는 `normalizeCaseAsset(a.payload)`로 정규화(깨지면 null=표시 제외). number/analogy/comparison 뷰 **불변**.

### 2) 케이스 표시 컴포넌트 — `src/components/CaseAssetView.tsx`(신규)

- 순수 표시. `intro`(있으면) + 각 branch를 **"조건 → 결과"** 분기 목록으로(P1 SegmentList의 case 렌더 패턴 미러: 조건 trus-yellow 강조, → aria-hidden).
- **검증 강조(중요)**: `grounded=false`(확인 필요) 분기는 흐리게(text-trus-white/40) + "확인 필요" trus-yellow 라벨 → 김짠부가 위험 분기를 즉시 인지(money-safety UI). `ComparisonAssetTable`의 verified=false 처리와 동일 톤.

### 3) `page.tsx`(또는 ResearchReview) — 분기

- 자산 루프에서 `kind==='case'`면 `CaseAssetView`로(P3가 comparison에 한 분기 미러). number/analogy/comparison 표시 불변.
- 빈/없음 상태: case 자산 없으면 미표시.

### 4) 디자인

- **TRUS 3색만**(임의 색·그라데이션·그림자·이모지 금지).
- 기존 검수 UX·레이아웃 회귀 0.

## 금지/범위

- 백엔드(case_miner·researchCell·scriptCell·액션)를 건드리지 마라. 순수 프론트엔드 + `researchView` 읽기 뷰모델만.
- `SegmentList.tsx`(대본 케이스 렌더)를 건드리지 마라(P1 완성). 패턴 재사용은 가능.
- `ComparisonAssetTable.tsx`를 깨지 마라(P3 자산 표시 — case는 별도 컴포넌트).
- 새 npm 의존성 추가 금지(네이티브 + Tailwind).
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
   - TRUS 3색만(임의 색·그라데이션·그림자·이모지 0)?
   - 백엔드/`SegmentList`/`ComparisonAssetTable` 변경이 **0**(순수 프론트·신규 컴포넌트만)?
   - `grounded=false` 분기가 "확인 필요"로 강조되는가(money-safety UI)?
   - case payload 깨졌을 때 안전하게 표시 제외되는가?
   - 기존 fact/asset/comparison 검수 표시 회귀 0?
3. `phases/case-branching/index.json`의 step 3 갱신(completed+summary / error / blocked).

## 금지사항

- 위 "금지/범위" 전체 준수.
- 명세에 없는 신규 파일(docs·다이어그램·빌드 산출물)을 커밋에 섞지 마라. `git status` 확인·범위 외 제외(하네스 `git add -A` 떠돌이 함정).
- 기존 테스트를 깨뜨리지 마라.
