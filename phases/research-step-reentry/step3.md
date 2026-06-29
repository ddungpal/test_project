# Step 3: reentry-ui

리서치 재진입(B) UI. (1) 선택 게이트(`research_scoped`)에 **"더 뽑아줘"(재생성)·"직접 추가"(수동, 금융 토글)**, (2) 리서치 결과/검수 화면에 **"① 다시 선택/보완 · ② 다시 검증 · ④ 예시 다시 생성"** 버튼. 순수 프론트엔드 — 백엔드(step0~2)는 안 건드린다.

## 읽어야 할 파일

- `src/components/ResearchScopeGate.tsx` — 선택 게이트 UI(섹션별 후보·체크·"리서치 시작"). 재생성·수동추가 추가.
- `src/app/runs/[id]/page.tsx` — `ResearchSection`(research_scoped / research_ready / research_review 분기). 결과/검수에 재진입 버튼 추가.
- `src/app/actions/topicRun.ts`(step1·2) — `regenerateResearchScopeAction(reason)`, 수동추가 포함 선택 액션, `backToResearchScope`/`reverifyResearch`/`regenResearchExamples`.
- `src/pipeline/financialHeuristic.ts`(step1) — `detectFinancial`(수동 입력 시 기본 토글값).
- `src/components/RegenerateButton.tsx` — 이유 입력 재생성 UX 미러.

## 작업

### 1) `ResearchScopeGate` 보강 (research_scoped)
- **(a) "더 뽑아줘"**: 이유 입력칸(선택) + 버튼 → `regenerateResearchScopeAction(runId, reason)`. 완료 후 router.refresh로 새 후보 표시. pending "더 뽑는 중…".
- **(b) "직접 추가"**: claim/concept 직접 입력 폼.
  - claim: 텍스트 + **금융 토글**(기본값 = `detectFinancial(text)` 자동, 사용자가 켜고 끔). section은 선택(목차 중 고르거나 공란).
  - concept: 이름 + needs_number/needs_analogy 체크.
  - 추가한 항목은 후보 목록에 사용자 추가분으로 표시(✓ 기본 선택). "리서치 시작" 시 선택 idx + 수동 항목을 함께 액션에 전달.
- 금융으로 켜진 항목엔 ⚠️ 배지(검수 대상 예고) — 기존 패턴.

### 2) 결과/검수 재진입 버튼 (research_ready / research_review)
- `ResearchSection`(또는 ResearchPanel 근처)에 작은 액션 줄:
  - **"① 다시 선택/보완"** → `backToResearchScope` (확인 다이얼로그: "선택 단계로 돌아갑니다").
  - **"② 다시 검증"** → `reverifyResearch` (확인: "검색·검증을 다시 합니다. 비용이 듭니다." — ②는 재과금).
  - **"④ 예시 다시 생성"** → `regenResearchExamples` ("숫자·비유만 다시 만듭니다. 사실은 유지.").
- 각 버튼 useTransition·pending·router.refresh. owner 게이트. 5단계 진행바(StageStepper)는 기존대로 재진입 후 동작.

### 3) 디자인
- **TRUS Create 3색(Black/Yellow/White)**·격동고딕2. 새 색·그림자·그라데이션 금지. 기존 카드/버튼 톤 미러. 재진입 버튼은 보조(outline), 주 액션과 위계 구분.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 재생성·재진입은 사람이 dev에서 검증: 후보 부족 시 더 뽑기·직접 추가·② 다시 검증·④ 예시 다시. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 선택 게이트에 "더 뽑아줘"(이유)·"직접 추가"(금융 토글 기본=detectFinancial)가 있고 액션에 선택+수동 함께 전달하는가.
   - 결과/검수에 ①②④ 재진입 버튼이 각 액션을 부르고, ②엔 비용 안내가 있는가.
   - 금융 항목 ⚠️ 배지, owner 게이트, 진행/refresh.
   - 백엔드(step0~2)·검증 로직을 안 건드렸는가(UI만).
   - TRUS 3색·기존 톤 준수.
3. `phases/research-step-reentry/index.json`의 step 3 갱신. **유효 JSON.**

## 금지사항

- 후보를 일부만 숨기거나 자동 절단하지 마라(전부 노출·사용자 선택·추가).
- ② 재검증 버튼에 비용 안내를 빠뜨리지 마라(재과금 — 사용자 인지).
- 백엔드(상태·셀·액션·검증)를 수정하지 마라(UI만).
- 새 색·그림자·그라데이션·다른 폰트 금지(TRUS Create).
- 기존 테스트를 약화/삭제하지 마라.
