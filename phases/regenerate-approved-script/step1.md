# Step 1: reopen-ui-button

## 배경 (자기완결)

step 0에서 백엔드(전이 `approved→scripting` + `regenerateApprovedScriptAction`)를 만들었다. 이 step은 **승인된 런 화면에 "대본 다시 생성" 버튼**을 붙여, 오너가 앱에서 바로 재생성하게 한다.

재생성은 **승인을 해제**하고(→ scripting → 짠펜 재실행 → script_review 착지) 대본을 새로 만든다. 시간이 걸리고(섹션별 생성) 현재 승인이 풀리므로 **오해 없는 정직한 카피 + 확인 절차**가 중요하다.

## 읽어야 할 파일

- `src/app/runs/[id]/page.tsx` — 런 상세 페이지. **`approved` 상태 분기**(완료 대본 `SegmentList` + 발행 관련 UI가 렌더되는 곳)를 찾아 그 근처에 버튼을 놓는다.
- `src/app/actions/topicRun.ts` — `regenerateApprovedScriptAction`(step 0 신규)·기존 액션 버튼 사용 패턴(`requestScriptReworkAction` 호출하는 컴포넌트, 재생성 버튼들 예: 썸네일 '다시 생성').
- 기존 확인 다이얼로그/버튼 컴포넌트 패턴(예: `PostConfirm*`·rework 버튼·`useTransition`+`router.refresh` 패턴). **그대로 미러**.
- `DESIGN.md` / `design/design-system/trus-create/` — TRUS Create 토큰(Black `#121212`/Yellow `#F8F082`/White·산돌 격동고딕2·그라데이션·그림자 금지). 신규 색/그림자 도입 금지.

## 작업

`approved` 상태 뷰에 **"대본 다시 생성"** 액션을 추가:

- 버튼 클릭 → **확인 절차**(네이티브 `confirm` 또는 기존 다이얼로그 패턴): 정직 카피 예 — *"대본을 다시 생성하면 현재 승인이 해제되고 검수 단계로 돌아갑니다. 새 대본이 만들어지는 동안 잠시 기다려 주세요. 계속할까요?"*
- 확인 시 `regenerateApprovedScriptAction(runId)` 호출 → `router.refresh()`(상태가 scripting→…로 바뀌며 페이지가 "작성 중"→검수로 진행).
- `useTransition`으로 pending 표시(재생성 중 버튼 비활성·"다시 생성 중…"), 실패 시 에러 노출(기존 액션 버튼 에러 패턴 미러).
- 위치: 완료 대본(SegmentList) 근처 또는 발행 버튼 옆. 눈에 띄되 실수 클릭이 어렵게(확인 절차가 방어).

**클라이언트에서 단위 테스트할 순수 로직이 생기면**(예: 버튼 노출 조건 술어) 컴포넌트가 아니라 `src/lib/**`에 두고 export한다(rules.md: vitest에 `@/` alias 없음 — 컴포넌트 직접 import 시 스위트 로드 실패). 이번 건 순수 로직이 거의 없으면 UI만.

**핵심 규칙:**
- 카피는 **정직**하게 — "승인 해제 + 검수부터 다시"를 숨기지 마라(사용자가 결과를 예측할 수 있어야 함).
- 확인 절차 없이 곧바로 재생성하지 마라(비용·승인 해제라 실수 방지).
- 신규 색/그림자/그라데이션 금지(TRUS Create 3색 토큰만·이모지·사색 톤 금지).
- 백엔드(액션·전이·runScriptStage)는 이 step에서 **미변경**(step 0 완성분 호출만).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.
- 실제 버튼 클릭→재생성 동작은 라이브(claude-p·마이그 라이브 적용 필요)라 AC 아님 — 렌더·타입·기존 테스트로 검증. 라이브 동작은 머지 후 사용자 확인.

## 검증 절차

1. AC 실행.
2. `approved` 뷰에만 버튼이 뜨는지(다른 상태 미노출)·정직 카피·확인 절차 존재 확인.
3. git diff가 `page.tsx`(+필요 시 신규 버튼 컴포넌트·`src/lib` 순수헬퍼)만 잡히는지. 백엔드 미변경.
4. `git status`로 범위 외 untracked 제외.
5. `phases/regenerate-approved-script/index.json` step 1 갱신(완료 → completed + summary / 실패 → error).

## 금지사항

- 백엔드(액션·scriptGate·전이·runScriptStage)를 바꾸지 마라(step 0 산출물 호출만).
- 확인 절차 없이 재생성 실행 금지. 정직 카피 생략 금지.
- 신규 색/그림자/그라데이션·이모지·사색적 표현 금지(TRUS Create).
- 컴포넌트 파일을 vitest가 직접 import하게 만들지 마라(순수 로직은 src/lib로).
- 기존 테스트를 깨뜨리지 마라.
