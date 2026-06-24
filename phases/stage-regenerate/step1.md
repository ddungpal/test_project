# Step 1: regenerate-button

**'다시 생성' 버튼(프론트엔드).** 후보가 떠 있는 화면(proposedState)에서 현재 후보를 버리고 새로 생성한다. step0의 `regenerateStage` 액션을 호출하고, 생성 중엔 LiveRefresh로 새 후보가 새로고침 없이 뜨게 한다.

## 배경
- step0이 `regenerateStage(runId, stage: "topic"|"titles"|"structure")` 서버 액션을 만들었다(force=true로 같은 단계 재실행 → 새 제안 행 INSERT, 상태 불변).
- 제안 화면은 `src/app/runs/[id]/page.tsx`의 `StageSection`에서 `runState === desc.proposedState && sv.proposal` 분기(75~84줄)가 `ProposalSelector`를 렌더한다. **여기에 '다시 생성'을 붙인다.**
- **선택 전에만** 이 분기가 보인다(선택 후엔 selection 분기) → 재생성은 다운스트림을 깨지 않는다.
- 상태가 안 바뀌므로(proposedState 유지) 버튼은 **자체 LiveRefresh를 일정 시간** 띄워 새 후보를 끌어온다(StageStepper의 상태기반 LiveRefresh는 안 뜸).

## 읽어야 할 파일 (먼저 정독)
- `src/app/runs/[id]/page.tsx` — `StageSection` proposal 분기(75~84줄). 여기에 RegenerateButton을 ProposalSelector 옆/아래로.
- `src/components/RequestStageButton.tsx` (직전 phase 산출) — `submitted → <LiveRefresh active fallbackMs={3000}/>` + 상한 타임아웃 패턴. **이 패턴을 그대로 따른다.**
- `src/components/LiveRefresh.tsx` — `{active, fallbackMs}` 재사용(수정 금지).
- `src/app/actions/topicRun.ts` — step0의 `regenerateStage` 시그니처.
- `src/lib/dashboard/stages.ts` 또는 page.tsx의 stage 매핑 — `stage`(topic|title_thumb|structure)를 regenerate 인자(topic|titles|structure)로 매핑.

## 작업
### 1) RegenerateButton (`src/components/RegenerateButton.tsx`, client)
```ts
export function RegenerateButton({ runId, stage }: { runId: string; stage: "topic" | "titles" | "structure" })
```
- 버튼 "다시 생성"(보조 스타일 — ProposalSelector의 '확정'보다 약하게, 예: 테두리만/노랑 텍스트). 누르면 `window.confirm` 또는 인라인 확인("현재 후보를 버리고 새로 생성합니다") — 실수 클릭 방지.
- 확인 시: `useTransition`으로 `regenerateStage(runId, stage)` 호출 → 성공하면 `setSubmitted(true)` + `router.refresh()`.
- `submitted`이면 RequestStageButton과 동일하게 `<LiveRefresh active fallbackMs={3000} />` + **상한 타임아웃**(예: 60초 — 상태가 안 바뀌어 자동 언마운트가 없으니 반드시 상한을 둔다) 후엔 폴링 끄고 "새 후보가 위에 반영됐는지 확인하세요" 안내.
  - // ponytail: 상태 불변이라 '완료' 신호가 없다 — 상한 폴링으로 충분(새 proposal은 보통 수초 내). proposalId 변화 추적까지 만들지 말 것(과설계).
- 에러 시 `setSubmitted(false)` + 메시지(기존 패턴).

### 2) StageSection 배선 (`page.tsx`)
- proposal 분기에서 ProposalSelector 아래(또는 위)에 `<RegenerateButton runId={runId} stage={regenStageOf(stage)} />`.
- `regenStageOf`: `topic→"topic"`, `title_thumb→"titles"`, `structure→"structure"`. research/script 단계엔 **렌더하지 않는다**(이 분기 자체가 그 단계엔 안 옴 — 그래도 매핑에 없는 stage면 버튼 생략).

## 주의
- **선택 전(proposedState) 분기에만** 붙여라. 이유: 선택 후 재생성은 다운스트림(구성·리서치·대본)을 무효화한다 — 범위 밖.
- `LiveRefresh`·`stageProgress`·서버 상태 분류 **수정 금지**. 클라 버튼만.
- 상한 타임아웃 필수. 이유: 상태가 안 바뀌어 버튼이 자동 언마운트되지 않으므로 무한 폴링 위험.
- TRUS 3색·radius 0·그림자 금지. '다시 생성'은 '확정'보다 시각적으로 약하게(주행동 아님).
- 백엔드/액션은 step0에서 끝 — 건드리지 마라.
- 이 step은 **UI 신호** → 팀 리드는 Esther 투입.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. (가능하면) 로컬: 제목·썸네일 후보가 뜬 상태에서 '다시 생성' → 확인 → 잠시 뒤 **새로고침 없이** 새 후보로 갱신되는지 육안. 헤드리스면 타입·빌드로 갈음(육안은 사용자).
3. step 1 갱신: 성공 → `"status":"completed"` + `"summary":"RegenerateButton(확인+regenerateStage 호출+생성중 LiveRefresh 60s 상한) + StageSection proposal 분기 배선(topic/titles/structure). 서버 상태머신 불변. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- 선택 후(selection) 화면에 재생성 노출 금지(다운스트림 무효화).
- LiveRefresh/서버 상태 분류 수정 금지 — 클라 버튼만.
- 상한 없는 무한 폴링 금지.
- 기존 테스트를 깨뜨리지 마라.
