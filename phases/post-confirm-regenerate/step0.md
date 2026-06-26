# Step 0: regen-postconfirm-backend

## 읽어야 할 파일

먼저 아래를 읽고 기존 재생성(run-in-place) 기계장치와 상태 제약을 이해하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `src/pipeline/stageContract.ts` — `runProposalStage`(특히 entry 판정·run-in-place 변주·offset/priorCandidates·`buildRegenerateAugmentedSystem`·**6) run 갱신부 230-241: run-in-place는 proposedState 낙관잠금**). 이 잠금이 selectedState에선 실패하는 게 이 step이 푸는 문제다
- `src/pipeline/regenerateDecision.ts` — `decideStageEntry`(memoized/run-in-place/forward/reject 순수 판정)
- `src/pipeline/regenerateVariation.ts` — `buildRegenerateAugmentedSystem`(이전 후보+회차 nonce+이유로 SYSTEM 변주)
- `src/inngest/functions/hookStage.ts`, `src/inngest/functions/thumbnailStage.ts` — 제목/썸네일 재생성 Inngest 핸들러(`run/titles.requested`·`run/thumbnails.requested`, `force`/`forceLlm`/`reason` 전달)
- `src/app/actions/topicRun.ts` — `regenerateStage`(이벤트 발행 패턴), `requireOwner`, `auditLog`
- `src/domain/enums.ts` — `STAGE_DESCRIPTORS`, 상태 전이

## 배경

확정 전 '다시 생성'은 `runProposalStage`의 **run-in-place**(force) 경로로 동작한다: 새 proposal을 INSERT하되 상태 전이 없이 같은 proposedState로 비용만 갱신한다. 그런데 그 갱신은 `proposedState` 낙관잠금(stageContract.ts:235 `.eq("state", descriptor.proposedState)`)을 건다. **확정 후엔 run이 selectedState(또는 그 이후)라 이 잠금이 실패**한다("in-place 갱신 무효"). 그래서 확정 후 재생성을 위한 별도 경로가 필요하다.

설계: 확정 후 재생성은 **새 proposal만 추가하고 run 상태는 전혀 건드리지 않는다**(전이도, 낙관잠금도 없음 — 비용 patch는 id로만 update). 생성된 후보는 다음 step UI가 폴링으로 받아 draft에 채우고, 사용자가 검토 후 기존 `editTitle`/`editThumbnails`(post-confirm-edit phase)로 저장한다. 즉 이 step은 **selection을 쓰지 않는다**(후보만 만든다).

## 작업

### 1. `runProposalStage` postConfirm 모드
`opts`에 `postConfirm?: boolean`을 추가한다. `postConfirm === true`이면:
- **entry 가드 우회**: selectedState(또는 이후)에서도 진입 허용. (force/normal 기존 분기는 그대로 — postConfirm은 추가 경로)
- **변주 적용**: run-in-place와 동일하게 offset(기존 proposal 개수)·priorCandidates(최근 후보)·`buildRegenerateAugmentedSystem`으로 새 후보가 기존과 달라지게 한다.
- proposal INSERT는 동일.
- **run 갱신부**: 상태 전이도 proposedState 낙관잠금도 하지 마라. 비용 patch는 `production_runs`를 **id로만** update한다(상태 불변). 실패해도 후보는 이미 만들어졌으니 best-effort로(또는 명확히 throw하되 상태 조건 없이).

기존 force/forward/memoized 동작은 **바이트 동일**하게 보존하라(postConfirm일 때만 분기).

### 2. Inngest 핸들러 플래그
`hookStage.ts`·`thumbnailStage.ts`가 `event.data.postConfirm`을 받아 `runProposalStage(..., { postConfirm: true, reason })`로 넘기게 한다. (기존 force/forceLlm 경로 보존.)

### 3. 서버 액션
`src/app/actions/topicRun.ts`에 추가:
```ts
// 확정 후 AI 재생성 — Inngest로 새 proposal 생성(상태 전이 없음). 동기 callLLM 금지(185s 타임아웃 회피).
export async function regenerateAfterConfirm(
  runId: string, component: "titles" | "thumbnail", reason?: string,
): Promise<void>;
```
- `requireOwner()` → 해당 이벤트(`run/titles.requested` 또는 `run/thumbnails.requested`)를 `{ runId, postConfirm: true, ...(reason 트림 비었으면 미포함) }`로 발행 → `auditLog`(action 예 `"stage_regenerated"`, detail에 component·postConfirm).
- `exactOptionalPropertyTypes` 준수: reason 비/공백이면 키 미포함.

## 테스트

`tests/`에 postConfirm 모드 단위 테스트를 추가한다(기존 `tests/editSelected.test.ts`/gate 테스트의 fake supa 패턴 참고):
- selectedState에서 postConfirm 재생성 → 새 proposal INSERT, **run.state 불변**(전이 없음).
- force/forward 기존 동작 회귀 가드(postConfirm 없이는 동일).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(재생성은 augmented system→새 promptHash라 dev에선 픽스처 record가 정상. replay AC 테스트는 라이브 LLM을 부르지 않으므로 통과해야 한다. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - postConfirm 경로가 **상태 전이/낙관잠금을 하지 않는가**(selectedState에서 동작).
   - force/forward/memoized 기존 동작이 바이트 동일하게 보존됐는가(회귀 테스트).
   - 동기 callLLM을 server action에서 직접 부르지 않고 Inngest로 갔는가.
   - selection(stage_selections)을 쓰지 않는가(저장은 다음 step의 기존 액션 몫).
3. `phases/post-confirm-regenerate/index.json`의 step 0 갱신(completed+summary / error / blocked).

## 금지사항

- server action에서 동기 callLLM을 직접 호출하지 마라. 이유: opus 단계 생성 ~185s는 Next/Vercel server action 타임아웃을 넘긴다 — 기존 재생성처럼 Inngest 비동기로 가야 한다.
- postConfirm 경로에서 `transitionRun`이나 proposedState 낙관잠금을 쓰지 마라. 이유: 확정 후 run은 selectedState라 잠금이 실패하고, 이 기능은 상태를 바꾸지 않는다(마이그레이션 0).
- `stage_selections`에 쓰지 마라. 이유: 저장(선택 갱신)은 사용자 검토 후 기존 `editTitle`/`editThumbnails`가 한다 — 이 step은 후보만 만든다.
- force/forward/memoized 기존 분기의 동작·promptHash를 바꾸지 마라(기존 parity/eval 픽스처 보존).
- 기존 테스트를 깨뜨리지 마라.
