# Step 2: thumbnail-regenerate-backend

**썸네일 다시 생성 백엔드 — 전체(3개 새로) + 개별(3칸 중 1칸만 교체·나머지 유지).** UI는 step3, 여기선 파이프라인·서버액션·이벤트만.

## 선행 (step0·1 산출물)
- step0: 상태 `thumbnails_proposed`/`thumbnails_selected`, `STAGE_DESCRIPTORS.thumbnail`.
- step1: `thumbnail_maker` 에이전트(`thumbnailStageSpec`), `thumbnailStage` Inngest(`run/thumbnails.requested`), `requestThumbnails` 액션, `ThumbnailPayload`.

## 두 가지 다시 생성 (의미 — 사용자 확정)
- **전체 다시 생성**: 썸네일 3개 모두 새로. = 기존 force 재생성 경로 재사용(`runProposalStage` run-in-place + 변주). 상태 전이 없음.
- **개별 다시 생성(slot i)**: 3칸 중 **i번만 새 썸네일로 교체, 나머지 2칸은 그대로**. 새 제안 행에 [기존0, 기존1, 새i] 형태로 INSERT(idx 보존). 상태 전이 없음.

## 읽어야 할 파일 (먼저 정독)
- `src/pipeline/stageContract.ts` — `runProposalStage`(force→run-in-place), `Candidate` 타입, in-place 시 새 proposal INSERT + 무전이 run update(낙관잠금 `state=proposedState`) 패턴. **개별 교체는 이 in-place 패턴을 본떠 커스텀 경로로.**
- `src/pipeline/regenerateVariation.ts` — `buildRegenerateAugmentedSystem(baseSystem, priorCandidates, attempt)`(직전 regenerate-distinct phase). **변주(이전 후보와 다르게) 재사용.**
- `src/pipeline/regenerateDecision.ts` — `decideStageEntry`(force→run-in-place 판정).
- `src/app/actions/topicRun.ts` — `regenerateStage`(force 이벤트 발행, 현재 topic|titles|structure 매핑). **thumbnail 추가 + slot 액션.**
- `src/inngest/functions/{thumbnailStage.ts,_shared.ts,hookStage.ts}`(step1·기존) — Inngest 함수 패턴·force 전달.
- `src/agents/thumbnail_maker/{prepare.ts,stage.ts,schema.ts}`(step1) — 썸네일 1개 생성 경로를 여기에 추가.

## 작업
### 1) 전체 다시 생성 (기존 force 경로에 thumbnail 추가)
- `topicRun.ts` `regenerateStage`의 stage 매핑·타입에 **thumbnail** 추가: `thumbnail: "run/thumbnails.requested"`. (인자 union을 `"topic"|"titles"|"structure"|"thumbnail"`로 확장.) force:true 발행.
- `thumbnailStage`가 이미 force를 `executeProposalStage`로 넘기면(step1에서 hookStage 미러) 추가 작업 없음 — runProposalStage가 run-in-place로 3개 새로 생성(buildRegenerateAugmentedSystem 적용). 확인만.

### 2) 개별 슬롯 생성 능력 (thumbnail_maker — 1개 변형)
- 썸네일 1개만 생성하는 경로 추가: `prepare.ts`에 `prepareThumbnailSlot(supa, runId, opts:{ avoid: ThumbnailPayload[] })` 또는 기존 prepare에 slot 컨텍스트 인자. system/input에 **"기존 슬롯들과 뚜렷이 다른 1개"**(avoid 목록 = 현재 3칸, 특히 교체 대상 i) 지시 + nonce(promptHash 차등). 출력 스키마 = 썸네일 **1개**(또는 기존 스키마 재사용하되 1개만 취함).
- 변주는 `buildRegenerateAugmentedSystem` 또는 동등 헬퍼로(이전 슬롯들 요약 + 시도 nonce) — record/replay에서 새 결과 보장.

### 3) 순수 합성 + 커스텀 in-place 경로 (`src/pipeline/thumbnailSlot.ts`)
```ts
// 3칸 중 slotIdx만 새 payload로 교체, 나머지 idx·내용 보존(순수·결정적).
export function composeSlotReplacement(existing: Candidate[], slotIdx: number, newPayload: unknown, reason: string, evidenceIds: string[]): Candidate[];

// 커스텀 in-place: thumbnails_proposed에서만. 1개 생성 → 합성 → 새 proposal INSERT → 무전이 run update.
export async function regenerateThumbnailSlot(deps, runId: string, slotIdx: number): Promise<...>;
```
- `regenerateThumbnailSlot`: getRun→**thumbnails_proposed 아니면 reject**(가드). 최신 thumbnail proposal(3후보) 읽기 → slotIdx 유효성(0..2) → 1개 생성(callLLM≤1, claude-p $0) → `composeSlotReplacement` → `stage_proposals` INSERT(stage "thumbnail") → run **무전이** update(낙관잠금 `state="thumbnails_proposed"`, runProposalStage in-place 미러) → cost flush. **상태 전이 없음**(전이 트리거 무관).
- idx는 0,1,2 고정 보존(읽기 최신우선이라 새 proposal이 화면에 뜸).

### 4) Inngest 함수 + 이벤트 + 서버액션
- `src/inngest/functions/thumbnailSlotStage.ts`: `{ event:"run/thumbnail-slot.requested" }` {runId, slotIdx} → step.run → `regenerateThumbnailSlot`. onFailure `captureStageFailure("thumbnail")`. concurrency runId limit 1, retries 2. `functions/index.ts` 등록. `client.ts` 이벤트 타입에 slotIdx 추가.
- `topicRun.ts`:
  - `regenerateThumbnails(runId)` → `regenerateStage(runId, "thumbnail")` 호출(또는 동등) = 전체.
  - `regenerateThumbnailSlot(runId, slotIdx)` → requireOwner + `inngest.send({ name:"run/thumbnail-slot.requested", data:{ runId, slotIdx } })`.

## 주의
- **둘 다 상태 전이 없음**(thumbnails_proposed 유지). DB 전이 트리거·마이그레이션 무관(in-place update만). 낙관잠금 `eq("state","thumbnails_proposed")` 필수(경합 안전).
- 개별 교체는 **나머지 2칸을 그대로 보존**(idx·payload·reason·evidence). composeSlotReplacement 순수·테스트.
- 슬롯 생성 promptHash는 변주로 forward와 차등 — replay 전용($0 동결)에선 픽스처 미스 throw가 정상(재생성=새 생성, record 필요). AC는 오프라인 순수테스트라 무관.
- slotIdx 범위 밖·proposal 없음·후보<3 → 안전하게 reject(크래시 금지).
- 비용: claude-p $0. cost_ledger flush는 전이 전에(runProposalStage 패턴 동일).
- exactOptionalPropertyTypes·noUncheckedIndexedAccess. tsx top-level await 금지.

## 테스트 (`tests/thumbnailSlot.test.ts`)
- `composeSlotReplacement([c0,c1,c2], 1, newPayload, ...)` → 길이 3·idx 0,1,2 보존·idx1만 newPayload·c0/c2 불변.
- slotIdx 범위 밖(예: 3, -1) → 안전 처리(throw 또는 무변경, 명세대로).
- (가능하면) 슬롯 변주 system이 forward와 promptHash 다름(buildRegenerateAugmentedSystem 재사용 검증).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. `git diff`로 개별 경로가 **무전이 in-place**(transitionRun 안 부름)·나머지 슬롯 보존인지, 전체는 기존 force 재사용인지 확인.
3. step 2 갱신: 성공 → `"status":"completed"` + `"summary":"썸네일 전체 다시생성(regenerateStage에 thumbnail 추가·force run-in-place 3개 새로) + 개별 다시생성(composeSlotReplacement 순수 1칸 교체·나머지 보존 + regenerateThumbnailSlot 무전이 in-place + thumbnailSlotStage Inngest run/thumbnail-slot.requested + 서버액션). 변주로 promptHash 차등. 상태전이 없음. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- 개별/전체 다시생성에서 상태를 전이시키지 마라(thumbnails_proposed 유지 — 다운스트림 무효화·전이트리거 충돌 방지).
- 개별 교체 시 나머지 2칸을 건드리지 마라.
- UI·confirm(최종확정)은 범위 밖(step3).
- 빈배열 가능 필드 schema required 금지.
- 기존 테스트를 깨뜨리지 마라.
