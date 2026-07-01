# 설계: 구성 편집 강화 — 확정 후 재생성·수정 + 섹션 개별 조작(수정/삭제/추가/드래그 정렬)

_작성: 2026-07-01 · 상태: 설계 승인(구현 대기)_

## 문제 / 요청

구성(구다리) 단계에 두 가지가 부족하다:

1. **확정 후 재생성·수정이 없다.** 구성을 선택·확정하면 읽기전용이 된다. 마음이 바뀌어도 고치거나
   다시 뽑을 방법이 없다. (제목·썸네일은 확정 후 손편집·재생성이 되는데 구성만 빠져 있다.)
2. **섹션을 개별 조작할 수 없다.** 한 후보(A/B안)의 outline은 섹션 1~9개인데, "다 좋고 나쁠 순
   없다" — 각 섹션을 개별적으로 **수정·삭제·추가·순서변경**하고 싶다. 지금은 선택 화면에서 섹션
   *필드*만 고칠 수 있고, 추가/삭제/정렬은 불가.

## 확정 결정 (사용자)

- **① 확정 후 재생성 + 수정**: 제목 확정 후 패턴(`PostConfirmTitleEdit` + `regenerateAfterConfirm`)을
  그대로 미러해 구성에 적용.
- **다운스트림 staleness = (A) 경고만**: 확정 후 구성을 바꾸면 이미 돌아간 리서치·스크립트가 낡는다.
  차단·자동 재실행 없이 **경고 배너**만 띄우고, 재실행은 사람이 판단.
- **② 섹션 개별 조작**: 수정 + 삭제 + 추가 + **드래그 정렬**. 순서 = 이해 흐름이라 정렬 포함.
- **드래그 = `@dnd-kit`**: 새 의존성 1개 감수. (↑↓ 버튼 대신 사용자가 드래그 선택.)
- **공유 위젯 `OutlineEditor`**: 선택 중(`ProposalSelector`)과 확정 후(`PostConfirmStructureEdit`)가
  **같은 편집 위젯**을 쓴다(DRY).

## 안 깨지는 것 (불변식)

- **마이그레이션 0**: `outline`은 이미 `OutlineSection[]` 가변 배열. 새 컬럼·테이블 없음.
- **새 상태 전이 0**: 편집·재생성 모두 상태 전이 없이 진행(`edited_payload` / postConfirm INSERT).
- **전파 메커니즘 불변**: 편집본은 `getSelectedStagePayload("structure")`의 `edited_payload` 우선
  반환으로 짠펜·다운스트림에 자동 전파(제목·타겟 페르소나와 동일).
- persona 없는 옛 구성·기존 짠펜 픽스처 무회귀(편집은 payload 조작일 뿐 프롬프트 형태 불변).

## 설계 상세

### A. 데이터·전파 (변경 없음)

- `src/agents/structurer/schema.ts` `OutlineSection` = `{ section, goal, why, format? }`. 이미 배열.
- `getSelectedStagePayload(supa, runId, "structure")`이 선택 payload를 반환하며 `edited_payload`
  우선(사람 수정본). → 편집한 outline이 자동으로 다운스트림에 흐른다. 추가 배선 0.

### B. `OutlineEditor` — 공유 편집 위젯 (②의 핵심)

`src/components/OutlineEditor.tsx` 신규(클라이언트 컴포넌트).

- **Props**: `{ outline: StructureSection[]; onChange: (next: StructureSection[]) => void }`.
  상태를 스스로 갖지 않는다(제어 컴포넌트) — 부모(`ProposalSelector` draft / `PostConfirmStructureEdit`
  로컬 상태)가 소유. 순수하게 outline을 받아 편집 이벤트를 `onChange`로 올린다.
- **렌더**: `@dnd-kit`의 `DndContext` + `SortableContext`로 섹션 배열을 드래그 정렬 리스트로.
  각 섹션 행:
  - **드래그 핸들**(≡ 아이콘·`useSortable`) — 키보드·터치 접근성은 @dnd-kit이 처리.
  - 필드 인풋: `section`(제목), `format`(select: 설명/표/분기), `goal`(목표), `why`(왜 이 순서).
  - **✕ 삭제** 버튼(그 섹션 제거).
  - 하단 **"+ 섹션 추가"** 버튼(빈 섹션 `{section:"",goal:"",why:"",format:"explain"}` append).
- **순수 조작 로직은 별도 헬퍼로 추출**해 테스트 가능하게: `src/lib/outline/ops.ts`(또는 컴포넌트 내
  export) — `moveSection(list, from, to)`, `removeSection(list, i)`, `addSection(list)`,
  `patchSection(list, i, patch)`. 컴포넌트는 이 순수 함수 결과를 `onChange`로 올린다.
- **키(key) — 드래그 안정성**: @dnd-kit sortable은 **드래그 내내 각 item의 id가 안정**이어야
  한다. 인덱스 기반 id(`sec-${i}`)는 재정렬 시 id가 옆 섹션을 가리키게 되어 드래그가 깨진다. →
  `OutlineEditor`는 내부 상태를 `Array<{ id: string; section: StructureSection }>`로 들되 `id`는
  **클라이언트 전용 임시 id**(마운트 시 `crypto.randomUUID()`·payload에 저장 안 함). @dnd-kit엔 이
  안정 id를 주고, `onChange`로 부모에 올릴 때는 **`id`를 벗겨 순수 `StructureSection[]`만** 전달한다
  (payload·스키마 불변 유지). 부모 outline이 외부에서 바뀌면(예: 재생성 로드) id 배열을 재동기화.
- **의존성 추가**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`(package.json).
- TRUS 3색·안티슬롭(그라데이션·그림자·라운딩 금지). 드래그 핸들 아이콘은 이모지 남발 없이 최소.

### C. 선택 중 통합 (②)

- `src/components/ProposalSelector.tsx` structure 분기(현재 outline을 인라인으로 그리며 `setSection`
  으로 필드만 수정) → **`<OutlineEditor outline={outline} onChange={next => setDraft({ ...p, outline: next })} />`
  로 교체**. 기존 인라인 섹션 렌더·`setSection`은 제거(OutlineEditor로 흡수). approach 인풋은 유지.
- 결과: 선택 화면에서도 섹션 추가/삭제/드래그 정렬이 바로 된다.

### D. 확정 후 수정 (①)

- `src/pipeline/gate.ts` `editSelectedStructure(supa, runId, payload, editedBy)` 신규 —
  `editSelectedTitle` 미러(descriptor만 `structure`): 확정(선택 기록) 후에만, structure selection의
  `edited_payload`에 payload 저장. 상태 전이 없음.
- `src/app/actions/topicRun.ts` `editStructure(runId, payload: StructurePayload)` 신규 액션:
  `requireOwner()` → `editSelectedStructure` → `auditLog(action: "stage_edited", detail: {stage:"structure"})`.
- `src/components/PostConfirmStructureEdit.tsx` 신규(= `PostConfirmTitleEdit` 미러): 확정된 outline을
  로컬 상태로 들고 `OutlineEditor`로 편집, "저장" 시 `editStructure(runId, {approach, outline})` 호출 후
  `router.refresh()`. 'use client'.
- `src/app/runs/[id]/page.tsx`: `StageSection`의 structure 확정 요약(`sv.selection` 분기·현재
  "topic/structure는 미지원" 주석 자리)에 `PostConfirmStructureEdit` 렌더(title_thumb의
  `PostConfirmTitleEdit`와 대칭).

### E. 확정 후 재생성 (①)

- `src/inngest/functions/structureStage.ts`: `executeProposalStage(...)` 옵션에
  **`postConfirm: event.data.postConfirm`**(+ 일관성 위해 `forceLlm: event.data.forceLlm`) 추가 —
  현재 빠져 있어 hookStage/thumbnailStage와 미러 맞춘다. postConfirm이면 `runProposalStage`가
  선택 상태에서도 새 proposal을 INSERT(상태 전이·낙관잠금 없음).
- `src/app/actions/topicRun.ts` `regenerateAfterConfirm`: 시그니처 component에 `"structure"` 추가 →
  `run/structure.requested`(`postConfirm: true`, reason 선택) 발행. audit 동일.
- `PostConfirmStructureEdit`에 "AI로 다시 생성" 버튼(제목 미러): 클릭 시 `regenerateAfterConfirm(runId,
  "structure", reason?)` → 폴링으로 새 proposal의 **첫 후보 outline을 에디터 draft에 로드**(제목의
  `regenCandidate` 로드 방식 미러). 사용자가 수정·저장. (A/B 재선택 UI는 확장 여지 — v1은 첫 후보
  로드로 제목 UX와 통일.)

### F. 다운스트림 staleness 경고 (A)

- `PostConfirmStructureEdit`가 `run.state`(prop)를 받아, `structure_selected` 이후 상태
  (research_* / scripting / script_* / approved / published)면 **경고 배너** 표시:
  "구성을 바꾸면 이후 단계(리서치·스크립트)를 다시 만들어야 합니다." (trus-yellow 보더·차단 없음.)
- 편집·재생성 자체는 항상 허용. 재실행은 사람이 기존 재생성 경로로 판단.

### G. 하위호환·테스트

- 마이그레이션 0·새 의존성은 @dnd-kit 3패키지뿐.
- 옛 구성(persona/format 없음)도 OutlineEditor가 옵셔널 필드로 렌더(무회귀).
- **테스트**:
  - `outline/ops`: `moveSection`/`removeSection`/`addSection`/`patchSection` 순수 로직(경계·불변성).
  - `editSelectedStructure`: 확정 후에만·`edited_payload` 저장·`getSelectedStagePayload("structure")`가
    편집본 우선 반환(fake supa 라운드트립 — `editTopicPersona`/`reviewScript` 패턴).
  - `regenerateAfterConfirm` structure 경로가 `run/structure.requested`(postConfirm) 발행하는지.

## 작업 범위 (harness phase 1개 · 4 step)

| step | 영역 | 변경 |
|---|---|---|
| 0 | 백엔드 | `editSelectedStructure`(gate) + `editStructure`(action) + `structureStage` postConfirm 전달 + `regenerateAfterConfirm` structure |
| 1 | 편집 위젯 | `OutlineEditor`(@dnd-kit) + `outline/ops` 순수 헬퍼(추가/삭제/이동/patch) |
| 2 | 선택 통합 | `ProposalSelector` structure 분기를 `OutlineEditor`로 교체 |
| 3 | 확정 후 UI | `PostConfirmStructureEdit`(수정+재생성+staleness 경고) + `page.tsx` 배선 |

## 보류 (후속)

- 확정 후 재생성의 **A/B 재선택 UI**(v1은 첫 후보 로드로 통일).
- **섹션 단위 AI 재생성**("이 섹션만 다시")(v1은 전체 재생성만).
- 다운스트림 자동 무효화·재실행(현재 경고만).
