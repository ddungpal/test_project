# Step 3: post-confirm-structure-ui (확정 후 수정·재생성 UI + staleness 경고)

구성 편집 강화 phase의 마지막 step. 확정된 구성을 화면에서 **수정(OutlineEditor)·재생성**할 수 있게
하고, 다운스트림이 낡을 수 있으면 **경고**한다. 백엔드(step 0)·위젯(step 1)을 화면에 연결한다.
설계 전문: `docs/specs/2026-07-01-structure-editing-design.md`(§D, §E, §F). Esther 투입.

## 읽어야 할 파일

- `docs/specs/2026-07-01-structure-editing-design.md` — §D(수정)·§E(재생성)·§F(staleness 경고).
- `src/components/PostConfirmTitleEdit.tsx` — **미러 대상**: 확정 후 손편집 + "AI로 다시 생성"
  (`regenerateAfterConfirm`) + 재생성 완료 폴링 → 새 후보를 draft에 로드하는 패턴.
- `src/components/OutlineEditor.tsx` — step 1 산출(`{ outline, onChange }`).
- `src/app/actions/topicRun.ts` — step 0 산출 `editStructure(runId, payload)` +
  `regenerateAfterConfirm(runId, "structure", reason?)`.
- `src/app/runs/[id]/page.tsx` — `StageSection`의 `sv.selection` 분기(확정 요약). title_thumb가
  `PostConfirmTitleEdit`를 렌더하는 위치(line 97~108 근처)와 주석 "topic/structure는 미지원"(line 94).
  `sv.selection.payload`(확정 구성)·`runState`가 이 컴포넌트 입력.
- `src/domain/enums.ts`(RunState) — staleness 판정용 상태 목록.

## 작업

### `PostConfirmStructureEdit.tsx` 신규 ('use client', PostConfirmTitleEdit 미러)

- **Props**: `{ runId: string; payload: StructurePayload; runState: RunState; proposalId?: string }`
  (proposalId·재생성 폴링은 제목 미러 방식).
- 로컬 상태로 `payload`(approach + outline)를 들고:
  - `approach` 인풋(수정 가능) + `<OutlineEditor outline={outline} onChange={next => setLocal({...local, outline: next})} />`.
  - **"저장"** → `editStructure(runId, { approach, outline })` → `router.refresh()`.
  - **"AI로 다시 생성"** → `regenerateAfterConfirm(runId, "structure", reason?)` → 재생성 완료를 폴링
    (제목의 `regenCandidate` 방식 미러) → 새 proposal 첫 후보 outline을 로컬 draft에 로드(사용자가
    수정·저장). (A/B 재선택 UI는 후속 — v1은 첫 후보 로드.)
- **staleness 경고(§F)**: `runState`가 `structure_selected` **이후**(research_ready·research_review·
  research_approved·scripting·script_ready·script_review·approved·published 등)면 상단에 경고 배너:
  "구성을 바꾸면 이후 단계(리서치·스크립트)를 다시 만들어야 합니다." (trus-yellow 보더. **차단 없음** —
  저장·재생성은 항상 허용.)
- 서버 전이·검증을 UI에서 중복하지 말 것(액션만 호출). TRUS 3색·안티슬롭.

### `page.tsx` 배선

- `StageSection`의 structure 확정 요약(`sv.selection` 분기)에 `PostConfirmStructureEdit` 렌더 —
  title_thumb의 `PostConfirmTitleEdit`와 대칭. `stage === "structure"`일 때만.
  ```tsx
  {stage === "structure" && (
    <PostConfirmStructureEdit runId={runId} payload={effective} runState={runState} proposalId={sv.proposal?.proposalId} />
  )}
  ```
- 기존 "topic/structure는 미지원" 주석은 갱신(structure는 이제 지원).

## 테스트

- 이 step은 주로 UI 배선(로직은 step 0 액션·step 1 ops에서 검증). 회귀 0이 핵심.
- (선택) staleness 판정 헬퍼를 순수 함수로 뽑았다면(예: `isStructureDownstreamStarted(state)`) 그
  경계만 테스트. 무리한 컴포넌트/드래그 시뮬 금지.

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과(회귀 0)
npm run build       # next build, 에러 0 — /runs/[id] 포함 전 라우트 생성
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - 확정 요약에 `PostConfirmStructureEdit`가 뜨고, 저장이 `editStructure`를 호출하는가?
   - "AI로 다시 생성"이 `regenerateAfterConfirm(runId,"structure")`를 호출하고 새 후보를 로드하는가?
   - staleness 경고가 `structure_selected` 이후 상태에서만 뜨고, **차단은 안 하는가**?
   - 서버 로직 UI 중복 없는가? TRUS 3색? 마이그 0?
3. 결과 반영(step 3): 성공 → `completed`+`summary` / 3회 실패 → `error` / 사람 개입 → `blocked`.

## 금지사항

- staleness를 **차단**으로 만들지 마라. 이유: 사용자 결정 = 경고만, 재실행은 사람 판단.
- 서버 상태 전이·검증을 UI에서 중복하지 마라. 이유: 액션이 단일 출처.
- `editStructure`가 `approach`·`outline` 외 필드를 덮어쓰게 만들지 마라(payload 전체를 정확히 전달).
- 촉이·구다리·짠펜 백엔드를 건드리지 마라. 이유: 이 step은 확정 후 UI만(배선은 step 0 완료).
- 마이그레이션 금지. 기존 테스트를 깨뜨리지 마라. build가 `MODULE_NOT_FOUND`면 stale `.next` 의심
  (`rm -rf .next` 후 재빌드로 판별).
