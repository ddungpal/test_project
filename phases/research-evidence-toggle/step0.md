# Step 0: evidence-widget (근거 토글 위젯 + 순수 헬퍼)

리서치 결과 세그먼트 중심 정리 phase의 1단계. 세그먼트별 접이식 "근거 토글"의 공유 위젯과, 카운트·
차집합 순수 헬퍼를 만든다. step 1~2가 이걸 소비한다. 설계 전문:
`docs/specs/2026-07-01-research-evidence-toggle-design.md`(§A, §A-2, 순수 헬퍼). UI step → Esther 투입.

## 배경

리서치 결과(검증 fact + 쉬운 설명 자산)가 벽처럼 쏟아져 못 읽는다. 세그먼트별로 **기본 접힌 토글**로
정리해 "필요할 때만" 보게 한다. 이 step은 재사용 셸과 헬퍼만 — 적용은 step 1(ScriptReview)·2(읽기 뷰).

## 읽어야 할 파일

- `docs/specs/2026-07-01-research-evidence-toggle-design.md` — §A(EvidenceToggle)·§A-2(AssetLabel)·순수 헬퍼.
- `src/lib/dashboard/scriptView.ts` — `SegmentFactView`(id·claim·pending·verificationStatus·
  primarySourceUrl 등)·`SegmentView.assets`(`{ id, concept, kind: "number"|"analogy"|"comparison"|"case" }`).
- `src/lib/dashboard/researchView.ts` — `FactView`(id...)·`AssetView`(id...) — unused 차집합 대상 타입.
- `src/components/ScriptReview.tsx` — 기존 `FactChip`·"확인 필요" 배지·TRUS 스타일(참고: 토글 안 콘텐츠는 step1이 주입).
- `src/components/SegmentList.tsx` — `LineageFooter`(현재 근거 상시 노출)·kind 배지 스타일(자산 라벨 톤 참고).

## 작업

### 1. 순수 헬퍼 — `src/lib/research/evidence.ts` (신규)

```ts
export function pendingFactCount(facts: { pending?: boolean }[]): number   // f.pending===true 개수
export function unusedResearch(
  rv: { facts: { id: string }[]; assets: { id: string }[] },
  segments: { facts: { id: string }[]; assets: { id: string }[] }[],
): { factIds: Set<string>; assetIds: Set<string> }   // 세그먼트 union에 없는 rv fact/asset id 집합
```
- 전부 순수(입력 비변형). `unusedResearch` = rv 전체 − 모든 세그먼트의 fact/asset id union.
- 소비 측(step2 page)에서 `rv.facts.filter(f => factIds.has(f.id))`로 unused만 렌더한다.

### 2. `EvidenceToggle` — `src/components/EvidenceToggle.tsx` (신규·순수 표시 셸)

- **Props**: `{ factCount: number; assetCount: number; pendingCount: number; children: React.ReactNode }`.
- 네이티브 `<details>`(기본 닫힘 — `open` 미부여):
  - `<summary>`: **"근거 {factCount+assetCount}건"** + `pendingCount>0`이면 **" · ⚠️ 확인 필요 {pendingCount}건"**
    (trus-yellow). summary는 커서 포인터·포커스 표식(접근성).
  - 펼치면 `children`.
  - **`factCount+assetCount === 0`이면 `null` 반환**(근거 없는 세그먼트는 토글 자체 생략).
- 셸만 — 안쪽 fact/asset 렌더는 소비자(step1/2)가 children으로 주입. 상태 없음(제어·표시 전용).
- TRUS 3색·안티슬롭. 이모지는 ⚠️ 정도만.

### 3. `AssetLabel` — `src/components/AssetLabel.tsx` (신규, 또는 EvidenceToggle 파일 내 export)

- **Props**: `{ asset: { id: string; concept: string; kind: "number"|"analogy"|"comparison"|"case" } }`.
- 렌더: kind 배지(숫자/비유/비교표/케이스) + `concept` 한 줄. **라벨만**(payload·표 내용 없음). TRUS 3색.

## 테스트

- `tests/researchEvidence.test.ts`(순수 헬퍼):
  - `pendingFactCount`: pending true 개수만·빈 배열 0·pending 없는 필드 방어.
  - `unusedResearch`: 세그먼트에 쓰인 id 제외·중복 세그먼트 union·rv 전부 unused/전부 used 경계·입력 비변형.
- (EvidenceToggle/AssetLabel 컴포넌트는 표시 셸이라 순수 헬퍼로 로직 잠그고, 렌더는 step1·2 통합·라이브에서 확인. 무리한 jsdom details 시뮬 금지.)

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과(기존 + 신규)
npm run build       # next build, 에러 0
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - `evidence.ts` 2함수가 순수(비변형)이고 테스트로 잠겼는가?
   - `EvidenceToggle`이 `factCount+assetCount===0`이면 null이고, pending>0일 때만 ⚠️ 요약을 붙이는가?
   - `EvidenceToggle`이 상태 없는 표시 셸(children 주입)인가? `AssetLabel`이 라벨만(내용 없음)인가?
   - 네이티브 `<details>` 사용(새 의존성 0)·TRUS 3색인가?
3. 결과 반영(`phases/research-evidence-toggle/index.json` step 0): 성공 → `completed`+`summary`(위젯
   props 시그니처·헬퍼 위치를 명시 → step1·2가 소비) / 3회 실패 → `error` / 사람 개입 → `blocked`.

## 금지사항

- 토글에 새 의존성(아코디언 라이브러리 등)을 쓰지 마라. 이유: 네이티브 `<details>`로 충분(zero JS·접근성).
- `EvidenceToggle`을 상태 소유로 만들지 마라. 이유: pending 결정 상태는 소비자(ScriptReview)가 토글 밖에서
  소유해야 접어도 유지된다.
- `AssetLabel`에 표/케이스 payload 내용을 렌더하지 마라. 이유: 사용자 결정 = 라벨만(내용은 본문 블록·하단).
- ScriptReview·SegmentList·page를 이 step에서 바꾸지 마라. 이유: 적용은 step1·2. 이 step은 위젯·헬퍼만.
- 기존 테스트를 깨뜨리지 마라.
