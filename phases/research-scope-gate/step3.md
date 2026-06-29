# Step 3: scope-gate-ui

`research_scoped` 상태에서 **셜록 후보를 보여주고 사용자가 리서치할 항목을 선택**하는 UI를 만든다. 다른 단계의 '제안 카드 → 선택' UX와 일관되게. 선택 후 "리서치 시작"을 누르면 step2의 액션으로 검증이 돈다.

## 읽어야 할 파일

- `src/app/runs/[id]/page.tsx` — 리서치 섹션(`ResearchSection`). `research_scoped` 상태 분기를 추가해 선택 UI를 렌더한다. `RESEARCH_LOADED`·상태 매핑·`run.progressNote` 등 기존 구조 참고. (리서치 본문 분기 패턴: structure_selected/researching/research_ready/research_review.)
- `src/components/ResearchReview.tsx`·`src/components/FactCard.tsx` — 리서치 UI 톤·구조 레퍼런스(검수 선택 UI). 미러링.
- `src/components/ProposalSelector.tsx` — '제안 후보 중 선택' UX 레퍼런스(라디오/체크 + 확정 버튼).
- `src/app/actions/topicRun.ts`(step2) — `selectResearchScopeAction`.
- `src/pipeline/researchScope.ts`(step1) — 후보 payload 형태(`{kind,section,...}`)·기본선택 힌트.
- 새 dashboard view가 필요하면 `src/lib/dashboard/researchView.ts` 패턴(서버에서 stage_proposals(stage='research') candidates 읽어 뷰 모델로).

## 작업

### 1) 후보 뷰 로딩 (서버)
- `research_scoped`일 때 scope proposal(candidates)을 읽어 뷰 모델로 변환(researchView.ts 패턴 미러 또는 확장). 각 후보: kind(claim/concept)·section·텍스트·is_financial/needs_*·중요도·기본체크 여부.

### 2) `src/components/ResearchScopeGate.tsx` (신규, client)
- 후보를 **섹션별로 그룹**핑해 표시(목차 커버가 한눈에). 각 항목 **체크박스**:
  - **기본 체크** = step1의 기본선택 힌트(중요도 상위). 사용자가 더하거나 뺄 수 있음.
  - **금융 항목은 ⚠️ 배지**("검수 대상 예고") — 선택 시 나중에 사람 검수로 감.
  - claim/concept 구분 표시, concept은 needs_number/analogy 표시.
- 하단 요약: "선택 N개 검증 예정"(많을수록 비용↑ 안내 한 줄). **"이 항목들로 리서치 시작"** 버튼 → `selectResearchScopeAction(runId, proposalId, {claims, concepts})`.
- 진행/전이: 기존 버튼 UX(useTransition·pending "리서치 시작 중…"·router.refresh) 미러. owner 게이트.
- 선택 0개면 버튼 비활성(최소 1개).

### 3) page.tsx 분기
- `ResearchSection`에 `runState==='research_scoped'` 분기 추가 → `<ResearchScopeGate ... />` 렌더. 안내문구("셜록이 검증 후보를 뽑았습니다 — 리서치할 항목을 고르세요. 고른 것만 검증·출처확인합니다.").

### 4) 디자인
- **TRUS Create 3색(Black `#121212`/Yellow `#F8F082`/White)**, 격동고딕2. 새 색·그림자·그라데이션 금지. 기존 카드/체크 UI 톤 일관.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 선택→검증은 사람이 dev에서: research_scoped 화면에서 항목 골라 "리서치 시작" → 선택분만 검증되는지. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - `research_scoped`에서 후보가 **섹션별 그룹·체크박스**로 보이고, 기본체크가 힌트대로인가.
   - 금융 항목 ⚠️ 표시, 선택 N개 안내, "리서치 시작" 버튼이 `selectResearchScopeAction`을 부르는가.
   - 선택 0개 가드(버튼 비활성), owner 게이트, 진행표시·router.refresh.
   - TRUS 3색·기존 UI 톤 준수(새 색·그림자·그라데이션 없음).
   - 백엔드(step0~2)·검증 로직을 안 건드렸는가(UI만).
3. `phases/research-scope-gate/index.json`의 step 3 갱신. **유효 JSON.**

## 금지사항

- 후보를 일부만 숨기거나 자동 절단해 보여주지 마라. 이유: 사용자 요구=전부 보여주고 사용자가 선택.
- 새 색·그림자·그라데이션·다른 폰트 금지. 이유: TRUS Create 디자인 시스템.
- 백엔드(상태·셀·액션·검증 로직)를 수정하지 마라. 이유: 이 step은 UI만 — 로직은 step0~2.
- 선택 0개로 검증을 시작하지 마라(버튼 비활성).
- 기존 테스트를 약화/삭제하지 마라.
