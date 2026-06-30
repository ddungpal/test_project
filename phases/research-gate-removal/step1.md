# Step 1: research-gate-cleanup

리서치 UX 대수술의 마지막 step. Phase 1(자동흐름)·Phase 2(인라인 검수)·이 Phase의 step 0
(`scriptStage`가 `script_review`로 자동 착지)까지 끝나면, **happy-path에서 런은 리서치 게이트
상태들(`research_scoped`/`research_ready`/`research_review`/`research_approved`)과 `script_ready`에
멈추지 않고 Inngest 안에서 자동으로 통과**한다. 그 상태들의 페이지 UI(수동 통과 버튼·게이트)는
이제 **전이 중 잠깐만 스치는 죽은 코드**다. 이 step은 그 죽은 수동 UI를 진행표시(WaitingNote)로
교체하고, 진행 스테퍼 문구를 자동흐름에 맞게 고친다.

**사용자 결정(이번 Phase 범위 확정):** 리서치 재진입(`ResearchReentryActions`: 다시 검증/예시 재생성)은
**happy-path에서 드랍**한다. 리서치가 부실하면 최종 검수에서 fact를 반려해 스크립트를 재작성하는 것으로
충분하다(리서치 재실행은 YAGNI). **재진입 컴포넌트 파일은 지우지 말고 코드만 남긴다**(미노출 — 나중에
고급 옵션으로 부활 가능). 마찬가지로 `EnterScriptReviewButton`·`ResearchScopeGate`·`GenerateScopeButton`·
`EnterReviewButton` 컴포넌트 **파일은 삭제하지 말고**, `page.tsx`에서 **import·사용만 제거**한다.

## 읽어야 할 파일

- `docs/specs/2026-07-01-research-autoflow-design.md` — §UI 제거 표(`ResearchScopeGate`·`EnterReviewButton`·중간 버튼), "안 깨지는 것" 불변식(진행 표시 유지·창작 단계 무변경).
- `src/app/runs/[id]/page.tsx` — **이 step이 수정할 핵심 파일.** 특히:
  - `ResearchSection`(리서치 단계 분기: `structure_selected` 시작버튼 / `research_scoped` 게이트 / `researching` 진행 / `research_ready` 게이트 / `research_review` 게이트 / 그 외 `ResearchPanel`).
  - `ScriptSection`(`research_approved` "대본 작성 시작" 버튼 / `scripting` 진행 / `script_ready` `EnterScriptReviewButton`+`SegmentList` / `script_review` `ScriptReview` / `approved`·`published` 완료).
  - `ApproveAllInline`(검수대상 0건 인라인 승인 — `research_review` 전용 헬퍼).
  - 상단 `Promise.all`의 `scope = getResearchScopeView(...)`(research_scoped 전용 조회) + `ScopeGateView`/`getResearchScopeView` import.
  - `WaitingNote` 헬퍼(진행표시 + `RefreshButton`) — **재사용한다.**
- `src/components/ResearchPhaseStepper.tsx` — **이 step이 수정.** `PHASES` 카피와 `phaseOf` 매핑에 수동 게이트 표현("내가 선택", "검수 진입 대기", "고위험 사실만 사람 확인")이 박혀 있다.
- (참고, 수정 금지) `src/inngest/functions/researchStage.ts` — 어떤 상태가 자동 전이로 transient한지 근거. `src/components/ScriptReview.tsx`(Phase 2 최종검수 — `script_review`에서 렌더, 그대로 둔다).

## 작업

### A. `page.tsx` ResearchSection — 죽은 게이트를 진행표시로 교체

happy-path에서 아래 상태들은 자동 전이로 잠깐만 머문다(Inngest 한 invocation 안). 각 게이트를 `WaitingNote`로 바꾼다. **시작 버튼(`structure_selected`)과 진행(`researching`)·완료 후 미리보기(`ResearchPanel`)는 보존한다.**

- `structure_selected` → **보존**(이게 비용 동의 시작 버튼 "리서치 시작 (셜록)" — 유일한 시작 접점).
- `research_scoped` → `ResearchScopeGate`/`GenerateScopeButton` 제거 → `WaitingNote`(예: "셜록이 리서치 준비 중… 새로고침").
- `researching` → **보존**(progress_note 진행 마커).
- `research_ready` → `EnterReviewButton` + `ResearchReentryActions` 제거 → `WaitingNote`(예: "리서치 마무리 중… 새로고침").
- `research_review` → `ResearchReview`/`ApproveAllInline` + `ResearchReentryActions` 제거 → `WaitingNote`.
- 그 외 `RESEARCH_LOADED.includes(runState) && rv`(=`research_approved`·`scripting`·`script_ready`·`script_review`·`approved`·`published`) → **`ResearchPanel` 보존**(리서치 결과 읽기전용 — 스크립트 단계에서도 근거로 보여야 함).

결과적으로 `ResearchSection`은 happy-path에서 [시작버튼] → [진행] → [결과 미리보기]만 남고, 중간 게이트는 사라진다. `ApproveAllInline` 헬퍼는 더 안 쓰이면 제거한다.

### B. `page.tsx` ScriptSection — 죽은 버튼 교체

- `research_approved` → `RequestStageButton next="script"`("대본 작성 시작") 제거 → `WaitingNote`(예: "짠펜이 대본 작성 중… 새로고침"). 이유: step 0/Phase 1로 `research_approved`에서 `run/script.requested`가 자동 발행돼 짠펜이 곧장 시작된다.
- `scripting` → **보존**(진행 마커).
- `script_ready` → `EnterScriptReviewButton` + `SegmentList` 제거 → `WaitingNote`(예: "검수 준비 중… 새로고침"). 이유: step 0으로 `script_ready`는 `script_review`로 자동 전진 — transient.
- `script_review` → **`ScriptReview` 보존**(Phase 2 인라인 검수 — 유일한 사람 접점).
- `approved`·`published` → **보존**(완료 배너 + `SegmentList`).

`RequestStageButton`은 다른 단계(제목·구성·리서치 시작·썸네일)에서도 쓰이므로 **import는 유지**하고 `research_approved`에서의 사용만 제거한다.

### C. `page.tsx` 죽은 import·조회 정리

- 더 이상 `page.tsx`에서 안 쓰는 import 제거: `EnterReviewButton`, `ResearchScopeGate`, `GenerateScopeButton`, `EnterScriptReviewButton`, `ResearchReentryActions`(미노출 결정), `ResearchReview`(이 페이지에서 미사용 시), `getResearchScopeView`/`ScopeGateView`.
- 상단 `Promise.all`에서 `scope` 조회 항목과 `ResearchSection`의 `scope` prop을 제거한다(research_scoped 게이트가 사라져 불필요).
- **주의(rules.md 함정):** 헬퍼/타입을 제거하면 그 import(특히 `type X`)가 죽은 채 남지 않게 같이 지운다. tsconfig에 `noUnusedLocals`가 없어 typecheck가 죽은 import를 안 잡는다 — 직접 확인하라.

### D. `ResearchPhaseStepper.tsx` — 자동흐름 문구로 갱신

`PHASES` 카피와 하단 안내에서 **수동 게이트 전제를 제거**한다(상태 표시기 자체는 유지 — 진행 표시는 불변식):

- "후보 선택 / 셜록이 검증 후보 제시 → 내가 선택" → 자동 선택 표현(예: "검증 범위 / 셜록이 자동 선택").
- "검수 / 고위험 사실만 사람 확인" → 최종 검수가 스크립트 단계로 옮겨졌음을 반영(예: "검수는 대본 단계에서 한 번").
- 하단 "검수 진입 대기" 같은 수동 대기 표현 제거. `phaseOf` 매핑(상태→idx)은 유지하되 카피만 자동흐름에 맞춘다.
- 정확한 문구는 재량(Esther 협업). 원칙: **사용자가 "내가 클릭해야 하나?" 오해하지 않게**, "셜록이 알아서 진행 중"이 읽히게.

### 디자인(Esther)

TRUS 3색(black `#121212`/yellow `#F8F082`/white)만. 그라데이션·그림자·라운딩·이모지 남발 금지. `WaitingNote`는 기존 점선 보더 스타일 재사용(새 시각 패턴 만들지 말 것). 스테퍼 카피는 간결·직설(김짠부 톤).

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과(현재 955 기준 회귀 0)
npm run build       # next build, 에러 0 — /runs/[id] 포함 전 라우트 생성
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - happy-path 리서치 게이트(`ResearchScopeGate`·`EnterReviewButton`·`ResearchReview`·"대본 작성 시작"·`EnterScriptReviewButton`)가 `page.tsx`에서 제거되고 `WaitingNote`로 대체됐는가?
   - **시작 버튼(`structure_selected`)·`ScriptReview`(`script_review`)·완료 뷰·`ResearchPanel` 미리보기·진행 마커**는 보존됐는가?
   - 컴포넌트 **파일은 삭제 안 했는가**(import·사용만 제거)? `scope` 조회·prop 제거 후 죽은 import 없는가?
   - `ResearchPhaseStepper` 문구가 자동흐름을 반영하는가(수동 게이트 표현 제거)?
   - TRUS 3색만 썼는가? 새 의존성 0?
   - 마이그레이션 0인가? `ARCHITECTURE.md` 구조 변경 없는가(UI 한정)?
3. 결과 반영(`phases/research-gate-removal/index.json` step 1): 성공 → `completed`+`summary` / 3회 실패 → `error`+`error_message` / 사람 개입 → `blocked`+`blocked_reason`.

## 금지사항

- 컴포넌트 **파일을 삭제하지 마라**(`EnterReviewButton`·`ResearchScopeGate`·`GenerateScopeButton`·`EnterScriptReviewButton`·`ResearchReentryActions`·`ResearchReview`). 이유: 사용자가 "코드만 남기고 미노출"로 결정 — 고급 옵션 부활 여지. `page.tsx`에서 import·렌더만 뺀다.
- `ScriptReview`(script_review)·시작 버튼(structure_selected)·완료 뷰(approved/published)·`ResearchPanel`·진행 마커를 제거하지 마라. 이유: 시작 접점·유일한 사람 검수·결과 표시는 불변식.
- 서버 액션·전이 로직·`scriptStage`·`researchStage`를 건드리지 마라. 이유: 이 step은 UI 전용. 파이프라인은 step 0과 Phase 1이 담당.
- 새 상태 분기나 새 조회를 만들지 마라(제거만). 마이그레이션 추가 금지.
- 헬퍼/타입 제거 시 죽은 import(`type X` 포함)를 남기지 마라. 이유: `noUnusedLocals` 부재로 typecheck가 못 잡는 사각지대.
- 기존 테스트를 깨뜨리지 마라.
- `npm run build`가 `Cannot find module './xxx.js'`·`PageNotFoundError`로 깨지면 stale `.next` 의심 — `rm -rf .next` 후 재빌드로 판별.
