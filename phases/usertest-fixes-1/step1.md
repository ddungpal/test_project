# Step 1: regenerate-with-reason

**'다시 생성'에 사용자 이유(텍스트) 입력을 추가한다.** 제안된 후보가 다 마음에 안 들 때, 사용자가 "이유"를 적어 다시 생성하면 그 이유가 LLM 프롬프트에 반영돼 새 제안을 만든다. **현재 상태는 유지**(run-in-place, 기존 동작 그대로)하고, `reason` 한 필드만 흐름에 관통시킨다. **결정: 공용 버튼이라 주제·제목·구성 세 단계 모두에 적용.**

## 배경 (왜 이렇게 — 흐름이 이미 다 뚫려 있다)
이전 phase(`stage-regenerate`, `regenerate-distinct`)로 '다시 생성' 경로가 완성돼 있다. 데이터 흐름:

```
RegenerateButton.tsx (UI)
  → regenerateStage(runId, stage)            [src/app/actions/topicRun.ts:166]
  → inngest.send({ name, data:{ runId, force:true } })
  → StageData 이벤트                          [src/inngest/client.ts:13]
  → topicStage / hookStage / structureStage   [src/inngest/functions/*.ts]
  → executeProposalStage(spec, { force })     [src/inngest/functions/_shared.ts:5]
  → runProposalStage(spec, deps, { force })   [src/pipeline/stageContract.ts:48]  ← run-in-place 분기(103~111)
  → buildRegenerateAugmentedSystem(system, priorCandidates, attempt)  [src/pipeline/regenerateVariation.ts:34]
       ↑ 여기서 "## 다시 생성(N회차)" 섹션을 system 프롬프트에 주입
```

`reason?: string`을 이 흐름에 그대로 얹으면 된다. **DB·상태 변경 없음**(이유는 프롬프트용 transient — 저장 안 함).

## 읽어야 할 파일 (먼저 정독)
- `src/components/RegenerateButton.tsx` — 현재 props `{ runId, stage, proposalId }`, confirm→`regenerateStage`→`LiveRefresh`(proposalId 변경으로 완료 감지). **여기에 선택적 이유 textarea를 붙인다.**
- `src/app/actions/topicRun.ts` (166줄 `regenerateStage`) — `requireOwner` 후 stage→이벤트명 매핑해 `inngest.send`.
- `src/inngest/client.ts` (13줄 `StageData`) — `{ runId, softAck?, levelSplit?, force? }`.
- `src/inngest/functions/topicStage.ts`·`hookStage.ts`·`structureStage.ts` — `event.data`에서 옵션 읽어 `executeProposalStage`로 넘기는 패턴(softAck·force처럼).
- `src/inngest/functions/_shared.ts` (5줄 `executeProposalStage`) — opts를 `runProposalStage`로 전달.
- `src/pipeline/stageContract.ts` (48줄~, run-in-place 분기 103~111) — `buildRegenerateAugmentedSystem` 호출부.
- `src/pipeline/regenerateVariation.ts` (34줄 `buildRegenerateAugmentedSystem`) — 프롬프트 증강 함수.
- `tests/regenerateVariation.test.ts`·`tests/regenerateDecision.test.ts` — **이 옆에 reason 테스트를 추가**(스타일 참고).
- `DESIGN.md` 또는 `design/design-system/trus-create/trus-create-design-system.md` — UI 톤(Black `#121212`/Yellow `#F8F082`/White 3색·격동고딕·그라데이션/그림자 금지).

## 작업
### 1) `buildRegenerateAugmentedSystem`에 reason 주입 (`src/pipeline/regenerateVariation.ts`)
시그니처에 선택적 reason 추가:
```ts
export function buildRegenerateAugmentedSystem(
  baseSystem: string,
  priorCandidates: Pick<Candidate, "payload">[],
  attempt: number,
  reason?: string,            // 신규(선택)
): string
```
- `reason`이 **비어있지 않을 때만** "## 다시 생성(N회차)" 섹션에 한 줄 추가(예: `사용자 요청 이유: "<reason>"` — 이전 후보와 다른 새 안을 내되 이 이유를 반영하라는 지시).
- **`reason`이 undefined/빈문자열이면 결과 문자열이 1바이트도 바뀌면 안 된다**(기존 출력 동일 = promptHash 보존).

### 2) reason 배선 (UI → 프롬프트)
- `client.ts` `StageData`에 `reason?: string` 추가.
- `topicRun.ts` `regenerateStage(runId, stage, reason?: string)` — 이벤트 data에 `reason`을 조건부로 실어 보냄(빈 값이면 미포함, `exactOptionalPropertyTypes` 준수).
- `topicStage.ts`·`hookStage.ts`·`structureStage.ts` — `executeProposalStage(spec, { softAck: event.data.softAck, force: event.data.force, reason: event.data.reason })`.
- `_shared.ts` `executeProposalStage(spec, { softAck?, force?, reason? })` → `runProposalStage(spec, deps, { force, reason })`.
- `stageContract.ts` — `runProposalStage` opts에 `reason?` 추가. run-in-place 분기(현재 `buildRegenerateAugmentedSystem(prep.system, priorCandidates, attempt)`)를 `(..., attempt, opts.reason)`로 호출.

### 3) UI — 이유 입력 (`src/components/RegenerateButton.tsx`, Esther)
- '다시 생성' 클릭 시 **선택적 이유 textarea**를 노출(인라인 펼침 또는 작은 입력 영역). 비워도 기존처럼 동작.
- 입력값을 `regenerateStage(runId, stage, reason)`로 전달.
- 기존 동작 보존: confirm/요청중·생성중 상태, proposalId 변경 완료 감지, 5분 안전 상한(`POLL_LIMIT_MS`).
- TRUS Create 톤(3색·radius 직각·그라데이션/그림자 금지·격동고딕). placeholder 예: "왜 다시 생성하나요? (선택) 예: 더 자극적인 후킹으로".

## 주의 (구체)
- **reason 미전달 시 promptHash·출력이 바뀌면 안 된다.** 이유: 기존 parity 픽스처(`fixtures/parity/*`)가 깨지고 개발 $0 계약·회귀가 발생한다. `buildRegenerateAugmentedSystem`의 reason 없는 경로는 기존과 정확히 동치여야 한다(테스트로 박아라).
- **DB·상태 전이를 추가하지 마라.** 이유: reason은 transient(프롬프트용)다. 저장하면 스키마 변경·마이그레이션이 생긴다.
- **research/script는 범위 밖.** 이유: 그 단계는 `runProposalStage`가 아니다(별도 셀). 제안 단계(topic/title_thumb/structure)만.
- **썸네일(thumbnail) 단계는 이 step 범위 밖.** 이유: 썸네일은 ThumbnailStudio 별도 UI/슬롯 흐름이다. 공용 RegenerateButton에만 reason을 붙인다(주제·제목·구성).
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수(옵셔널에 undefined 명시대입 금지 → 조건부 스프레드).

## 테스트
`tests/regenerateVariation.test.ts`에 케이스 추가:
- reason 미전달(undefined) → 결과가 기존(reason 없는) 출력과 동일.
- reason 빈문자열("") → 동일(미주입).
- reason 있음 → 출력에 그 이유 문자열이 포함되고, 이전 후보 차별화 지시도 유지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. 위 AC 커맨드를 실행한다(Joy가 git diff + AC로 검수).
2. 아키텍처 체크: TRUS 3색·격동고딕·그라데이션/그림자 금지, CLAUDE.md 규칙 위반 없음, reason 없는 경로 불변.
3. 결과에 따라 `phases/usertest-fixes-1/index.json`의 step 1을 업데이트(completed+summary / error / blocked).

## 금지사항
- reason 미전달 시 출력 변경 금지(픽스처 보존). 이유: 개발 $0·회귀 방지.
- DB/상태/스키마 변경 금지. 이유: reason은 transient.
- research·script·thumbnail 단계 침범 금지. 이유: 다른 흐름.
- 기존 테스트를 깨뜨리지 마라.
