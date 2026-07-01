# 설계: 리서치 결과 세그먼트 중심 정리 (근거 토글)

_작성: 2026-07-01 · 상태: 설계 승인(구현 대기)_

## 문제 / 요청

리서치 결과(검증 fact + 쉬운 설명 자산)가 **한 화면에 벽처럼 쏟아져** 다 읽을 수 없다. 사용자 요청:

1. 검증·쉬운설명 자산을 **토글로 숨겨** 필요할 때만 보게.
2. **스크립트에 매칭**해서 정리 — 그때그때 필요한 부분(그 단락에 적용된 근거)만 확인.
3. 최우선 가치: **실사용자가 편안해서 쓰고 싶게**.

현황(확인 완료): 데이터는 이미 세그먼트↔근거 매칭을 갖는다 — `SegmentView.facts`
(`script_segment_facts`)·`SegmentView.assets`(`script_segment_explanation_assets`). 문제는 **표시**:
- `ScriptReview`(script_review)가 세그먼트별 fact를 **항상 펼친 채** 인라인 노출(자산은 아예 안 보임).
- 페이지가 `ResearchPanel`(전체 fact+자산 **평면 덤프**)을 세그먼트 뷰와 **나란히 이중 노출**.
- 읽기 뷰(`SegmentList`)도 `LineageFooter`로 근거를 상시 노출.

## 결정 (사용자 확정)

- **(A) 다 접고 요약 신호**: 세그먼트별 근거는 기본 접힘. 요약에 "근거 N건 · ⚠️ 확인 필요 M건".
- **(B) 세그먼트 토글 + 하단 "안 쓰인 리서치" 접힌 섹션**: 적용된 근거는 세그먼트별, 어느 세그먼트에도
  안 쓰인 fact·자산은 하단 접힌 토글 하나로(기존 `ResearchPanel` 강등).
- **(가) 자산은 라벨(참조)만**: 세그먼트 토글 안 자산은 "kind 배지 + concept" 한 줄. 실제 표/수치
  full은 본문 블록(짠펜이 emit한 table/case 세그먼트) + 하단 전체 리서치에서. (토글 경량 유지.)
- **(D) 읽기 뷰도 일관 적용**: script_ready·approved·published(`SegmentList`)에도 같은 접이식 토글.

## 안 깨지는 것 (불변식)

- **마이그레이션 0·새 의존성 0**: 네이티브 `<details>`/`<summary>`(zero JS·접근성). 데이터는 이미 존재.
- **pending 승인/반려 로직 불변**: 결정 상태는 React state라 토글 open/close와 무관. "최종 승인"의
  `rejectFactIds` 수집·`reviewScriptAction`은 그대로.
- 본문(SegmentBody)·블록 렌더(table/case/visual)·money-safety·lineage 무변경.

## 설계 상세

### A. 공유 위젯 — `EvidenceToggle` (`<details>`·의존성 0)

`src/components/EvidenceToggle.tsx` 신규(순수 표시 셸).
- **Props**: `{ factCount: number; pendingCount: number; assetCount: number; children: React.ReactNode }`.
- 네이티브 `<details>`(기본 닫힘·`open` 미부여):
  - `<summary>`: **"근거 {factCount+assetCount}건"** + `pendingCount>0`이면 **" · ⚠️ 확인 필요 {pendingCount}건"**
    (trus-yellow 강조). 커서·포커스 스타일 TRUS.
  - 펼치면 `children` 렌더.
  - `factCount+assetCount === 0`이면 **아무것도 렌더 안 함**(null) — 근거 없는 세그먼트는 토글 생략.
- 셸만 담당(안쪽 내용은 소비자가 주입) → ScriptReview(인터랙티브)·SegmentList(읽기전용) 공유.

### A-2. 자산 라벨 — `AssetLabel`

`src/components/AssetLabel.tsx` 신규(또는 EvidenceToggle 파일 내 export).
- **Props**: `{ asset: { id: string; concept: string; kind: "number"|"analogy"|"comparison"|"case" } }`
  (= `SegmentView.assets` 원소).
- 렌더: kind 배지(숫자/비유/비교표/케이스) + `concept` 한 줄. TRUS 3색·이모지 최소. **라벨만**(payload 없음).

### 순수 헬퍼 — `src/lib/research/evidence.ts`

- `pendingFactCount(facts: SegmentFactView[]): number` — `f.pending` 개수.
- `unusedResearch(rv: { facts: {id}[]; assets: {id}[] }, segments: { facts: {id}[]; assets: {id}[] }[]):
  { factIds: Set<string>; assetIds: Set<string> }` — 세그먼트 어디에도 안 쓰인 fact·자산 id 집합
  (rv 전체 − 세그먼트 union). 순수·테스트 대상.

### B. `ScriptReview` 적용 (script_review)

- 세그먼트마다: `SegmentBody`(현행) + `<EvidenceToggle factCount assetCount pendingCount>`로
  현재 "항상 펼친 인라인 fact"를 **접이식**으로 교체. 토글 안:
  - fact: 기존 `FactChip`(pending → 승인/반려 토글·기본 승인) 그대로.
  - 자산: `s.assets`를 `AssetLabel`로 나열(현재 미표시 → 신규 노출).
  - `pendingCount = pendingFactCount(s.facts)`.
- **pending 보존**: `decisions` state는 컴포넌트 최상위(토글 밖)라 접어도 유지. "최종 승인"·상단 요약
  문구(확인 필요 총건수) 불변.

### C. 하단 "안 쓰인 리서치" 토글 — `UnusedResearch`

`src/components/UnusedResearch.tsx` 신규.
- **Props**: `{ facts: FactView[]; assets: AssetView[] }`(이미 unused만 필터된 것).
- 접힌 `<details>` "안 쓰인 리서치 ({N}건)": 기존 `ResearchPanel` 내용(FactCard·ComparisonAssetTable·
  CaseAssetView·number/analogy)을 **재사용**해 full 렌더. 0건이면 렌더 안 함.
- `ResearchPanel`의 렌더 로직을 재사용(중복 최소화 — 필요 시 ResearchPanel 내부를 공유 함수로 추출).

### D. 읽기 뷰 `SegmentList` 적용

- 각 세그먼트의 `LineageFooter`(상시 노출)를 `<EvidenceToggle>`로 교체(읽기 전용 — 승인/반려 없음).
  토글 안: fact 읽기 칩(기존 LineageFooter fact 마크업) + `AssetLabel`. `pendingCount`는 읽기 뷰선
  보통 0(이미 확정)이라 요약은 "근거 N건"만.

### E. 페이지 배선 (`src/app/runs/[id]/page.tsx`)

- **ResearchPanel 강등**: `ResearchSection`이 script 상태(script_ready·script_review·approved·published)
  에서 `ResearchPanel`을 **상시 렌더하지 않는다**. (script 이전 리서치 상태는 autoflow로 transient —
  현행 유지.)
- **UnusedResearch를 ScriptSection 하단에**: 페이지에서 `unusedResearch(rv, segments)`로 unused id
  집합을 구해 `rv.facts`/`rv.assets`를 필터 → `<UnusedResearch>`를 ScriptReview/SegmentList **아래**에
  렌더. `ScriptSection`에 `rv` prop 전달(현재 segments만 받음).
- rv·segments는 페이지가 이미 병렬 로드(getResearchView·getScriptView) → 추가 조회 0.

## 데이터·구현 메모

- 마이그레이션 0·새 의존성 0. `SegmentView.assets`는 `{id,concept,kind}`(라벨용으로 충분).
- `<details>`는 접근성 기본 제공(키보드·스크린리더). pending 배지는 aria로 읽히게.
- 테스트: `evidence.ts` 순수 헬퍼(`pendingFactCount` 경계·`unusedResearch` 차집합) + (얕은) 토글 0건
  생략. 무리한 jsdom details 토글 시뮬 금지.

## 작업 범위 (harness phase 1개 · 3 step)

| step | 영역 | 변경 |
|---|---|---|
| 0 | 위젯·헬퍼 | `EvidenceToggle`·`AssetLabel`·`src/lib/research/evidence.ts`(pendingFactCount·unusedResearch) + 테스트 |
| 1 | 검수 화면 | `ScriptReview`에 EvidenceToggle 적용(pending 보존)·자산 라벨 노출 |
| 2 | 읽기 뷰·강등 | `SegmentList` EvidenceToggle + `UnusedResearch` + page 배선(ResearchPanel 강등·ScriptSection에 rv/unused) |

## 보류 (후속)

- 세그먼트 토글 안에서 자산 full 내용 즉시 보기(현재 라벨만 — 본문 블록/하단에서 확인).
- "확인 필요 있는 세그먼트만 펼치기" 일괄 버튼(현재 개별 펼침).
