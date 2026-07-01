# Step 0: structure-edit-backend (구성 확정 후 수정·재생성 배선)

구성 편집 강화 phase의 1단계 — **백엔드만**. 확정된 구성을 수정(edit)·재생성(regenerate)할 수 있게
서버 배선을 깐다. UI는 step 1~3. 설계 전문: `docs/specs/2026-07-01-structure-editing-design.md`(§D, §E).

## 배경

지금 구성은 확정하면 읽기전용이다. 제목·썸네일은 확정 후 손편집(`editSelected*`)과 재생성
(`regenerateAfterConfirm`)이 되는데 **구성만 빠져 있다.** 이 step은 그 두 배선을 **제목 패턴 그대로
미러**해 추가한다. **마이그레이션 0·새 상태 전이 0**(편집=`edited_payload`, 재생성=postConfirm INSERT).

## 읽어야 할 파일

- `docs/specs/2026-07-01-structure-editing-design.md` — §D(확정 후 수정), §E(재생성), 불변식.
- `src/pipeline/gate.ts` — `editSelectedTitle`(line 156 근처)·`editSelectedTopic`(line 196 근처).
  **이 step이 미러할 패턴**: 확정(선택 기록) 후에만, 해당 stage selection의 `edited_payload`에 저장.
- `src/app/actions/topicRun.ts` — `editTitle`(167)·`editTopicPersona`(177)·`regenerateAfterConfirm`(203).
  `regenerateAfterConfirm`은 현재 `component: "titles" | "thumbnail"`만 받는다.
- `src/inngest/functions/structureStage.ts` — 현재 `executeProposalStage(..., { softAck, force, reason })`
  만 넘긴다(**`postConfirm` 누락**). `src/inngest/functions/hookStage.ts`는 `postConfirm:
  event.data.postConfirm`을 넘긴다 — **미러 대상**.
- `src/inngest/functions/_shared.ts` — `executeProposalStage`가 `postConfirm`을 받아 `runProposalStage`에
  전달함(이미 지원). structureStage가 안 넘길 뿐.
- `src/lib/dashboard/proposalTypes.ts` — `StructurePayload`(`{ approach, outline: StructureSection[] }`).
- `src/inngest/client.ts` — `run/structure.requested`의 `StageData`(postConfirm 필드 이미 있음).

## 작업

### 1. `gate.ts` — `editSelectedStructure` 신규 (editSelectedTitle 미러)

```ts
export async function editSelectedStructure(
  supa: Supa, runId: string, payload: StructurePayload, editedBy: string,
): Promise<{ selectionId: string }>
```
- `editSelectedTitle`과 동일 구조: descriptor를 `STAGE_DESCRIPTORS.structure`로. 확정
  (`stageIsConfirmed`) 후에만 허용(아니면 throw), 최신 structure proposal의 selection에 기존
  `chosen_idx` 보존하며 `edited_payload = payload`로 새 selection INSERT. 상태 전이 없음.

### 2. `topicRun.ts` — `editStructure` 액션 신규 (editTitle 미러)

```ts
export async function editStructure(runId: string, payload: StructurePayload): Promise<void>
```
- `requireOwner()` → `editSelectedStructure(supa, runId, payload, ownerId)` →
  `auditLog(action: "stage_edited", targetType: "run", targetId: runId, detail: { stage: "structure" })`.

### 3. `structureStage.ts` — `postConfirm`(+ `forceLlm`) 전달

- `executeProposalStage(structureStageSpec(...), { softAck, force, reason })` →
  **`postConfirm: event.data.postConfirm`**(+ 일관성 위해 `forceLlm: event.data.forceLlm`) 추가.
  hookStage/thumbnailStage와 동일하게. (이게 있어야 확정 상태에서 재생성이 새 proposal을 INSERT.)

### 4. `topicRun.ts` — `regenerateAfterConfirm`에 `"structure"` 추가

- 시그니처 `component: "titles" | "thumbnail"` → `"titles" | "thumbnail" | "structure"`.
- `"structure"`면 `name = "run/structure.requested"`. 나머지(postConfirm:true·reason·audit) 동일.

## 테스트

`tests/`에 fake supa로(기존 `editTopicPersona`/`reviewScript` 테스트 패턴):
- `editSelectedStructure`: 확정 후 `edited_payload`에 payload 저장, `getSelectedStagePayload("structure")`가
  편집본을 우선 반환(라운드트립). 미확정 시 throw.
- `regenerateAfterConfirm("structure")`가 `run/structure.requested`를 `postConfirm:true`로 발행하는지
  (inngest.send 모킹/스파이).

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과(기존 + 신규)
npm run build       # next build, 에러 0
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - `editSelectedStructure`가 `editSelectedTitle`을 정확히 미러하고 확정 후에만 동작하는가?
   - `structureStage`가 `postConfirm`을 전달하는가(hookStage와 동일)?
   - `regenerateAfterConfirm`이 structure에서 `run/structure.requested`(postConfirm) 발행하는가?
   - 마이그레이션 0·새 상태 전이 0인가? enum·CHECK 안 건드렸는가?
3. 결과 반영(`phases/structure-editing/index.json` step 0): 성공 → `completed`+`summary`(다음 step이
   알 것: `editStructure(runId, payload)` 액션·`regenerateAfterConfirm(runId,"structure",reason?)`가
   UI 소비점) / 3회 실패 → `error` / 사람 개입 → `blocked`.

## 금지사항

- 마이그레이션·새 상태 전이를 만들지 마라. 이유: 편집=edited_payload, 재생성=postConfirm INSERT로 충분.
- `editSelectedStructure`가 확정 전에도 동작하게 하지 마라. 이유: 확정 안 된 구성엔 selection이 없다.
- UI(ProposalSelector·page·컴포넌트)를 건드리지 마라. 이유: 이 step은 백엔드 배선만(UI는 step 1~3).
- `@dnd-kit` 등 새 의존성을 추가하지 마라. 이유: 이 step은 백엔드. 의존성은 step 1.
- 기존 테스트를 깨뜨리지 마라.
