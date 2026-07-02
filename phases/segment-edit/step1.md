# Step 1: segment-edit-ui

프로즈 세그먼트를 **인라인 텍스트 수정**하는 UI. step0의 `editSegment` 호출. `script_review`(검수)+`approved`(완료)에서.

## 읽어야 할 파일

- `docs/specs/2026-07-02-segment-edit-design.md` — "결정"(프로즈만·검수+완료).
- `phases/segment-edit/step0.md` + 산출물 — `editSegment(runId, segmentId, text)` 액션·`isScriptDownstreamStarted`.
- `src/components/SegmentList.tsx` — **수정 대상.** `SegmentList({segments})`·`SegmentBody`(kind 스위치·prose→`Prose`). 읽기 전용 → 프로즈에 편집 얹기.
- `src/components/ScriptReview.tsx` — script_review 검수 화면(SegmentBody 재사용). 편집이 여기서도 되게.
- `src/components/OutlineEditor.tsx` / `PostConfirmStructureEdit.tsx` — 제어 컴포넌트·편집 상태 관리 패턴 미러(상태 부모 소유).
- `src/app/runs/[id]/page.tsx` — SegmentList/ScriptReview 렌더 상태 분기(script_review·approved·published).

## 작업

- 프로즈 세그먼트(kind=prose/null)에 **"수정" 버튼** → textarea(현재 text 프리필) + 저장/취소. 저장 시 `editSegment(runId, segment.id, text)` → `router.refresh()`(ScriptReview submit 패턴 미러). 블록 세그먼트(table/case/visual)는 **버튼 미노출**.
- 노출 상태: `script_review`(ScriptReview) + `approved`(SegmentList). `published`는 제외(설계). `runState` prop으로 게이팅.
- 편집 로직 중 순수 부분(있으면)은 `src/lib/**`에 두고 컴포넌트는 호출만(vitest alias 함정). 상태는 컴포넌트 로컬(useState)·OutlineEditor 제어 패턴.
- TRUS 3색·기존 스타일. 새 색·그라데이션·그림자 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 기존 테스트 전부 통과
npm run build
```

- UI라 단위 테스트 필수 아님. 순수 헬퍼는 `src/lib/**`. 기존 테스트 불변.

## 검증 절차
1. AC 실행.
2. 체크리스트: 프로즈만 편집 버튼(블록 미노출). script_review+approved만(published 제외). 저장이 `editSegment` 호출. TRUS 3색. 백엔드 무변경.
3. `phases/segment-edit/index.json` step 1 갱신(**브라우저 수동검증 필요** 명시).

## 금지사항
- **블록(table/case/visual) 세그먼트에 텍스트 편집 버튼을 달지 마라 — 프로즈만.**
- **published 상태에서 편집 노출하지 마라(설계: review+approved).**
- **백엔드(editSegment·scriptCell)를 수정하지 마라(step0에서 끝냄·step2는 재생성).**
- 새 색·그라데이션·그림자 금지(TRUS 3색).
- 기존 테스트를 깨뜨리지 마라.
