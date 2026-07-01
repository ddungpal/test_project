# Step 2: read-view-and-demote (읽기 뷰 토글 + 안 쓰인 리서치 강등 + 페이지 배선)

리서치 결과 정리 phase의 마지막 step. 읽기 뷰(`SegmentList`)에도 같은 근거 토글을 적용하고, 전체
`ResearchPanel` 평면 덤프를 **"안 쓰인 리서치" 하단 접힌 토글로 강등**한다. 설계 전문:
`docs/specs/2026-07-01-research-evidence-toggle-design.md`(§C, §D, §E). UI step → Esther 투입.

## 읽어야 할 파일

- `docs/specs/2026-07-01-research-evidence-toggle-design.md` — §C(UnusedResearch)·§D(SegmentList)·§E(페이지 배선).
- `src/components/SegmentList.tsx` — **수정.** `LineageFooter`(각 세그먼트 근거 상시 노출·읽기전용)·
  `SegmentBody`. fact 읽기 칩 마크업(토글 안에 재사용).
- `src/app/runs/[id]/page.tsx` — **수정.** `ResearchPanel`(로컬 함수·전체 fact+asset 렌더:
  FactCard·ComparisonAssetTable·CaseAssetView·number/analogy)·`ResearchSection`(RESEARCH_LOADED에서
  ResearchPanel 렌더)·`ScriptSection`(segments만 받음·ScriptReview/SegmentList 분기)·상단 병렬 로드
  (`rv` getResearchView·`segments` getScriptView).
- `src/components/EvidenceToggle.tsx`·`AssetLabel`(step0)·`src/lib/research/evidence.ts`
  (`unusedResearch`·step0).
- step0·1 index.json summary.

## 작업

### A. `SegmentList.tsx` — 근거를 EvidenceToggle로 (읽기 전용)

- 각 세그먼트의 `LineageFooter`(상시 노출)를 `<EvidenceToggle factCount={s.facts.length}
  assetCount={s.assets.length} pendingCount={0}>`로 교체. 토글 children:
  - fact: 기존 LineageFooter의 fact 읽기 칩 마크업(주장/근거·출처) — 승인/반려 **없음**(읽기 뷰).
  - 자산: `s.assets.map(a => <AssetLabel asset={a} />)`.
- 읽기 뷰라 `pendingCount=0`(요약은 "근거 N건"만). `SegmentBody`·kind 렌더 무변경.

### B. `UnusedResearch.tsx` — 안 쓰인 리서치 하단 토글 (신규)

- **Props**: `{ facts: FactView[]; assets: AssetView[] }` (이미 unused만 필터된 것).
- 접힌 `<details>` "안 쓰인 리서치 ({facts.length + assets.length}건)": 기존 `ResearchPanel`의 렌더
  (FactCard·ComparisonAssetTable·CaseAssetView·number/analogy)를 **재사용**해 full 렌더. 0건이면 `null`.
- **중복 최소화**: `page.tsx`의 `ResearchPanel` 렌더 본문을 공유 컴포넌트/함수로 추출해 UnusedResearch와
  ResearchSection(pre-script)이 함께 쓰게 한다(복붙 금지). 추출 시 기존 렌더 결과 불변.

### C. `page.tsx` 배선 — ResearchPanel 강등 + UnusedResearch

- **ResearchSection**: script 상태(`SCRIPT_LOADED` = script_ready·script_review·approved·published)에서는
  `ResearchPanel`을 **상시 렌더하지 않는다**(리서치는 이제 세그먼트별 + 하단 UnusedResearch로 표시).
  script 이전 리서치 상태(research_ready 등·autoflow로 transient)는 현행 유지.
- **UnusedResearch를 ScriptSection 하단에**: `unusedResearch(rv, segments)`로 id 집합을 구해
  `rv.facts.filter(f => factIds.has(f.id))`·`rv.assets.filter(a => assetIds.has(a.id))`로 unused만 추려
  `<UnusedResearch facts={..} assets={..} />`를 ScriptReview/SegmentList **아래**에 렌더.
  - `ScriptSection`에 `rv` prop 추가(현재 segments만). rv 없으면(로드 전) UnusedResearch 생략(방어).
- rv·segments는 이미 페이지가 병렬 로드 → 추가 조회 0.

## 작업 시 주의 (rules.md 함정)

- `ResearchPanel` 렌더를 공유로 추출하면 원본(page.tsx)에서 죽은 코드·죽은 import가 남지 않게 정리
  (noUnusedLocals 사각지대).
- script 상태에서 ResearchPanel을 빼되, ResearchSection 자체가 빈 껍데기(스테퍼만)로 어색하게 남지 않는지
  확인(필요하면 script 상태에서 ResearchSection 반환 null 또는 스테퍼 유지 — 설계 의도는 "평면 덤프 제거").

## 테스트

- `unusedResearch` 헬퍼는 step0에서 테스트됨. 이 step은 UI 배선이라 회귀 0이 핵심.
- (선택) unused 필터가 페이지에서 올바른 id만 넘기는지 얕은 확인. 무리한 컴포넌트 시뮬 금지.

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과(회귀 0)
npm run build       # next build, 에러 0 — /runs/[id] 포함 전 라우트 생성
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - `SegmentList`가 근거를 `EvidenceToggle`(읽기 전용·기본 닫힘)로 접는가?
   - `UnusedResearch`가 **안 쓰인** fact·자산만 하단 접힌 토글로 렌더하는가(0건이면 미표시)?
   - script 상태에서 상단 `ResearchPanel` 평면 덤프가 제거됐는가? ResearchSection이 어색하게 안 남는가?
   - ResearchPanel 렌더를 공유 추출하며 죽은 import·중복이 없는가? TRUS 3색? 마이그 0?
3. 결과 반영(step 2): 성공 → `completed`+`summary` / 3회 실패 → `error` / 사람 개입 → `blocked`.

## 금지사항

- `ResearchPanel` 렌더를 복붙하지 마라(공유 추출). 이유: 리서치 렌더 로직 단일 출처 유지.
- 전체 리서치(안 쓰인 것 포함 X)를 하단에 다 넣지 마라 — **안 쓰인 것만**. 이유: 세그먼트별과 중복 방지·사용자 결정(B).
- 세그먼트 근거·본문 렌더를 백엔드/조회 변경으로 풀지 마라(추가 조회 0). 마이그레이션 금지.
- ScriptReview(step1 완료분)를 다시 건드리지 마라. 이유: 이 step은 읽기 뷰·강등·배선만.
- 기존 테스트를 깨뜨리지 마라. build가 `PageNotFoundError`/`MODULE_NOT_FOUND`면 stale `.next` 의심
  (`rm -rf .next` 후 재빌드로 판별).
