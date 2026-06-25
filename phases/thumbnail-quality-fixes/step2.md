# Step 2: thumbnail-regen-reason

**썸네일 '다시 생성'에 사유(reason) 입력을 추가한다.** 제목 단계에 붙인 reason 패턴을 썸네일의 **전체 다시생성**과 **개별(카드별) 다시생성** 양쪽에 적용한다. 사용자가 사유를 적으면 그 사유에 맞춰 수정본이 나온다. **결정: 전체=상단 공용 사유 1칸, 개별=각 카드마다 사유 1칸.**

## 배경 (흐름이 거의 다 뚫려 있음)
- `buildRegenerateAugmentedSystem(base, priors, attempt, reason?)`는 **이미 reason 파라미터를 지원**(제목 단계에서 추가함, `src/pipeline/regenerateVariation.ts`). 재사용.
- **전체 다시생성**: `regenerateThumbnails` → `regenerateStage(runId,"thumbnail")` → `run/thumbnails.requested`(StageData에 reason? 이미 있음) → `thumbnailStageFn` → `executeProposalStage`(reason 지원) → `runProposalStage`(reason 지원) → buildRegenerate(reason). **유일한 누락: `thumbnailStage.ts`가 `event.data.reason`를 안 넘김.**
- **개별 슬롯**: `regenerateThumbnailSlot(runId, slotIdx)` → `run/thumbnail-slot.requested`(reason 필드 없음) → `thumbnailSlotStageFn` → `regenerateThumbnailSlot(deps,runId,slotIdx)`(`src/pipeline/thumbnailSlot.ts`, reason 없음) → buildRegenerate(reason 미전달). **reason 전 구간 관통 필요.**

## 읽어야 할 파일 (먼저 정독)
- `src/components/ThumbnailStudio.tsx` — `runRegen`(~52-67), 개별 버튼(~111-117 `regenerateThumbnailSlot(runId, c.idx)`), 전체 버튼(~125-131 `regenerateThumbnails(runId)`). UI 추가 지점.
- `src/components/RegenerateButton.tsx` — 제목 reason textarea 최종형(톤·접근성 useId·완료감지). **UI 패턴 참고.**
- `src/app/actions/topicRun.ts` — `regenerateThumbnails`(~189-191), `regenerateThumbnailSlot`(~194-197), `regenerateStage`(reason? 이미 지원).
- `src/inngest/client.ts` — `StageData`(reason? 있음), `run/thumbnail-slot.requested`(~19, reason 없음 → 추가).
- `src/inngest/functions/thumbnailStage.ts` — `executeProposalStage(...)` 호출에 `reason: event.data.reason` 추가(~10).
- `src/inngest/functions/thumbnailSlotStage.ts` — `regenerateThumbnailSlot(deps,…)`에 reason 전달(~9-16).
- `src/pipeline/thumbnailSlot.ts` — `regenerateThumbnailSlot`(~55-157), `buildRegenerateAugmentedSystem` 호출(~90). 시그니처에 reason 추가·전달.
- `src/pipeline/regenerateVariation.ts` — `buildRegenerateAugmentedSystem(.., reason?)` (변경 불필요, 재사용).

## 작업
### 1) 전체 다시생성 reason 관통 (누락 1곳 + 액션)
- `thumbnailStage.ts`: `executeProposalStage(spec, { softAck: event.data.softAck, force: event.data.force, reason: event.data.reason })`.
- `topicRun.ts` `regenerateThumbnails(runId, reason?: string)` → `regenerateStage(runId, "thumbnail", reason)`.

### 2) 개별 슬롯 reason 관통 (전 구간)
- `client.ts` `run/thumbnail-slot.requested` data에 `reason?: string` 추가.
- `topicRun.ts` `regenerateThumbnailSlot(runId, slotIdx, reason?: string)` → 이벤트 data에 reason 조건부 포함.
- `thumbnailSlotStage.ts`: `event.data.reason`를 `regenerateThumbnailSlot(deps, runId, slotIdx, reason)`로 전달.
- `thumbnailSlot.ts` `regenerateThumbnailSlot(deps, runId, slotIdx, reason?: string)` → `buildRegenerateAugmentedSystem(prep.system, existing, attempt, reason)` 호출(4번째 인자). reason 비/공백이면 출력 바이트 동일(픽스처 보존).

### 3) UI (ThumbnailStudio, Esther)
- **전체**: 상단에 공용 사유 textarea 1개 → 전체 다시생성 시 `regenerateThumbnails(runId, 전체사유)`.
- **개별**: 각 카드마다 사유 input 1개(카드별 state) → `regenerateThumbnailSlot(runId, c.idx, 카드사유)`.
- 비워도 기존처럼 동작(선택). 완료 감지(proposalId 변경)·진행 표시·POLL 상한 등 기존 동작 보존.
- TRUS Create 톤(3색·격동고딕·radius 직각·그라데이션/그림자 금지). placeholder 예: "왜 다시? (선택) 예: 박스 문구 더 짧게".

## 주의 (구체)
- **reason 미전달 시 promptHash·출력 불변.** 이유: 기존 thumbnail 픽스처·$0 보존. 조건부 전달(빈 값 미포함).
- **개별 슬롯은 1칸만 교체·나머지 2칸 완전 보존 로직을 깨지 마라.** 이유: `thumbnailSlot.ts`의 핵심 계약(idx/payload/reason/evidence 보존·범위밖 throw·낙관잠금). reason은 프롬프트에만 얹는다.
- **상태 전이 추가 금지**(슬롯은 무전이 in-place). 이유: DB 트리거.
- **buildRegenerateAugmentedSystem 변경 금지**(이미 reason 지원). 이유: 제목·썸네일 공유, 회귀 위험.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수(reason 조건부 스프레드).

## 테스트
- `thumbnailSlot.ts` 기존 테스트(`tests/thumbnailSlot.test.ts`)에 reason 전달 시 augmented system에 사유 포함·미전달 시 기존 동일 케이스 추가.
- 전체 경로는 기존 regenerate 테스트로 커버되면 충분(필요시 thumbnailStage reason 전달 단위).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. 위 AC 실행(Joy 검수).
2. 체크: 전체·개별 모두 reason 관통, 미전달 시 불변(픽스처), 슬롯 1칸 교체 계약 보존, UI TRUS 톤·전체 공용/개별 카드별 구조.
3. `phases/thumbnail-quality-fixes/index.json` step 2 갱신(completed+summary / error / blocked).

## 금지사항
- reason 미전달 시 출력 변경 금지. 이유: 픽스처·$0.
- 슬롯 보존 계약(나머지 2칸·무전이·낙관잠금) 변경 금지. 이유: 데이터 무결성.
- buildRegenerateAugmentedSystem 변경 금지. 이유: 공유·회귀.
- 기존 테스트를 깨뜨리지 마라.
