# Step 0: selection-per-stage

## 읽어야 할 파일

먼저 아래를 읽고 버그의 데이터 흐름을 정확히 이해하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `src/lib/dashboard/runDetail.ts` — **버그 위치**. 특히:
  - 90-94: `latestByStage`(stage별 최신 proposal)
  - 144-157: `selByProposal`(proposal_id별 최신 selection)
  - 161-166: `selection: prop ? (selByProposal.get(prop.id) ?? null) : null` ← **최신 proposal id로만 selection을 찾는 줄**
  - 14-18: `StageSelectionView` 타입
- `src/app/runs/[id]/page.tsx` — 소비처:
  - `ProposalStageSection`(73-102): `if (sv.selection)` 확정 뷰. 75-76에서 `chosen = sv.proposal.candidates.find(idx===chosenIdx)`, `effective = editedPayload ?? chosen?.payload ?? {}`
  - `ThumbnailStageSection`(158-182): `if (sv.selection)` 확정 뷰, `sv.selection.editedPayload`(배열) 사용
  - 131·193: placeholder "이전 단계 완료 후 진행됩니다."
- `src/components/PostConfirmTitleEdit.tsx`, `src/components/PostConfirmThumbnailsEdit.tsx` — `proposalId` prop이 바뀌면(새 proposal 도착) 재생성 완료로 보고 draft를 채운다. 즉 sv.proposal은 **최신 proposal**이어야 한다(폴링 기준)
- `src/lib/dashboard/proposalTypes.ts` — `PROPOSAL_STAGES`, `CandidateView`

## 근본원인

확정(selection) 후 'AI로 다시 생성'(post-confirm-regenerate)은 새 proposal을 INSERT한다(상태 전이 없음). 그런데 `runDetail.ts`는 stage의 selection을 **최신 proposal의 id로만** 조회한다(`selByProposal.get(prop.id)`). 새 proposal엔 selection이 없으므로 `sv.selection=null` → page.tsx의 확정 분기에서 탈락 → placeholder. 확정 뷰(편집 패널)도 언마운트돼 재생성 draft 채움도 도달 불가.

## 작업

selection을 **"stage의 최신 selection"(그 stage의 모든 proposal 횡단)** 으로 읽고, 그 effective payload를 자신의 proposal로 해석해 노출한다. `sv.proposal`은 최신 proposal 그대로 둔다(재생성 폴링·draft 채움이 필요).

### 1. `StageSelectionView`에 해석된 payload 추가
```ts
export interface StageSelectionView {
  chosenIdx: number | null;
  editedPayload: unknown | null;
  reason: string | null;
  payload: unknown; // 해석된 확정 payload: edited_payload ?? 자기 proposal candidate[chosen_idx] ?? {}
}
```

### 2. runDetail.ts: stage별 최신 selection + payload 해석
- proposal_id → 그 proposal의 `{ stage, candidates }`를 매핑(이미 있는 `proposals` 배열 활용).
- `sels`는 이미 `created_at desc` 정렬됨 → proposal_id로 stage를 찾아 **stage별 첫(최신) selection만** 채택한다(`selByStage: Map<Stage, ...>`).
- 각 selection의 `payload`를 **그 selection이 속한 proposal**의 candidates로 해석: `edited_payload ?? candidates.find(c => c.idx === chosen_idx)?.payload ?? {}`. (최신 proposal이 아니라 selection 자신의 proposal로 — 재생성으로 후보가 바뀌어도 확정값이 정확히 보이게.)
- 161-166의 stage 조립: `selection: selByStage.get(stage) ?? null`, `proposal: latestByStage.get(stage)`(그대로).

### 3. page.tsx: 해석된 payload 사용
- `ProposalStageSection`의 확정 뷰: `effective`를 `sv.selection.payload`로 바꾼다(최신 proposal에서 chosen을 찾던 로직 제거 — 재생성 후 최신 proposal엔 다른 후보가 있어 어긋난다). `chosenSources`는 chosen을 못 찾으면 `[]`로 두는 기존 방어 유지(소스 칩 없음은 허용).
- `ThumbnailStageSection`은 `sv.selection.editedPayload`(배열) 사용 그대로 — selection이 stage 횡단으로 잡히면 자동 복구된다.

### 4. 회귀 테스트
`tests/`에 runDetail(또는 순수 헬퍼로 추출 시 그 헬퍼) 테스트 추가:
- stage에 확정 selection이 proposal P1에 있고, 더 새 proposal P2(selection 없음)가 있을 때 → `sv.selection`이 **non-null**이고 `payload`가 P1 확정값으로 해석되며, `sv.proposal.proposalId === P2`(최신, 재생성 폴링용).
- 재생성 안 한 일반 경우(최신 proposal에 selection) → 기존과 동일하게 해석(회귀 가드).

순수 해석 로직을 작은 순수 함수로 빼서 테스트하기 쉬우면 그렇게 하라(외부 의존 없이).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - selection을 **stage 횡단 최신**으로 읽는가(최신 proposal id 한정 아님).
   - effective payload를 **selection 자신의 proposal**로 해석하는가(최신 proposal 아님).
   - `sv.proposal`은 **최신 proposal** 그대로인가(재생성 폴링·draft 채움 불변).
   - 재생성 안 한 일반 경로가 기존과 동일한가(회귀 테스트 green).
3. `phases/regen-confirmed-view-fix/index.json`의 step 0 갱신(completed+summary / error / blocked).
   - **주의(rules.md)**: index.json은 반드시 **유효한 JSON**으로 저장하라(닫는 `}`·쉼표 확인) — 깨진 JSON은 하네스 재읽기를 크래시시킨다.

## 금지사항

- post-confirm-regenerate 백엔드(runProposalStage postConfirm 모드·새 proposal INSERT)를 바꾸지 마라. 이유: 재생성은 새 proposal을 폴링 대상으로 쓴다 — 버그는 뷰 계층(selection 조회)이지 백엔드가 아니다.
- `sv.proposal`을 selection의 proposal로 바꾸지 마라. 이유: PostConfirm*Edit이 proposalId 변경으로 재생성 완료를 감지한다 → sv.proposal은 최신 proposal이어야 한다.
- 상태 전이/마이그레이션을 추가하지 마라(순수 읽기 버그).
- 기존 테스트를 깨뜨리지 마라.
