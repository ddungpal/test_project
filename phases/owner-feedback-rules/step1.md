# Step 1: copy-learn-ui

`/copy-learn` 학습 허브에 "🎯 김짠부 직접 피드백 (제목)"·"(썸네일)" 섹션 2개를 추가한다.
별도 페이지 없음 — 기존 패널을 미러한다. `analogy-learning` step2(AnalogyPanel 편입)를 미러.

## 읽어야 할 파일

- `docs/specs/2026-07-05-owner-feedback-rules-design.md` — 전체 설계.
- `phases/owner-feedback-rules/index.json` — step 0 summary(신규 서버액션 `submitOwnerFeedback`·매핑·draft 구조 확인).
- `src/app/actions/copyLearn.ts` — step 0에서 추가된 `submitOwnerFeedback`·기존 `activateCopyStyle` 시그니처.
- `src/app/actions/copyLearnView.ts` — `getAnalogyDrafts` 등 draft 조회(best-effort 폴백 패턴). **미러 대상**.
- `src/components/CopyLearningForm.tsx` — `AnalogyPanel`·`AnalogyDraftCard`·`StylePanel`·`STATUS_LABEL`·`fmtDate`·`PatternNode` 등 **재사용 대상 렌더러**. 새 렌더러를 발명하지 마라.
- `src/app/copy-learn/page.tsx` — 서버 컴포넌트 `Promise.all` 데이터 로드 + `CopyLearningForm`에 props 전달.
- `src/lib/learning/analogyDraftSummary.ts` — draft 요약 순수헬퍼 패턴(미러 대상).
- `design/design-system/trus-create/trus-create-design-system.md` — TRUS Create 3색·직각·그림자0 규칙.

## 작업

### 1. draft 조회 (copyLearnView.ts)
`getOwnerRulesDrafts(component: 'title_owner'|'thumbnail_owner', limit=5)` 또는 두 전용 함수 추가.
`getAnalogyDrafts` 미러: 해당 `component_type` version desc 조회, **조회 error 시 `console.warn`→`[]` best-effort 폴백**
(마이그 034 미적용 환경에서도 `/copy-learn` 페이지가 안 막히게 — `getStructureProfiles`/`getAnalogyDrafts` 패턴).
`OwnerRulesDraft` 인터페이스 export(`{id, version, status, createdAt, rules: string[], sourcesCount}` 정도).

### 2. draft 요약 순수헬퍼
`src/lib/learning/ownerRulesDraftSummary.ts` 신규 — `ownerRulesDraftSummary(unknown)` → 표시라인/칩.
`null`/비객체/`rules` 비배열 등 전부 방어(analogyDraftSummary 패턴). 정상이면 "규칙 N개·근거 N건" 류 요약 + 규칙 목록.
`src/lib/**`에 두고 export하라(컴포넌트 파일에 순수 헬퍼를 두면 vitest `@/` alias 부재로 스위트 로드가 깨진다 — 프로젝트 규칙).

### 3. UI 패널 두 개 (CopyLearningForm.tsx)
`AnalogyPanel`/`StylePanel`을 미러해 오너 피드백 패널을 만든다. 제목·썸네일 두 인스턴스.

- **입력**:
  - 공통: `topic`(한 줄, 선택 컨텍스트) + `feedback` textarea(김짠부 피드백).
  - 제목 패널: 제목 후보 N행(입력 + [행 추가]/[행 삭제]).
  - 썸네일 패널: 세트 N개, 각 세트 = 메인 2칸·박스 2칸(기존 썸네일 입력 UI가 있으면 그 모양 재사용) + [세트 추가]/[삭제].
- **액션**:
  - [학습] → `submitOwnerFeedback({component, topic, candidates, feedback})`. 성공/빈 피드백 안내 분기·스피너·`aria-busy`·`router.refresh`.
  - [최신 초안 활성화] → `activateCopyStyle('title_owner'|'thumbnail_owner')`. draft 없으면 disabled.
- **표시**: 현재 활성 규칙셋(누적된 규칙 목록)을 읽기전용으로 렌더 — 김짠부가 지금까지 쌓인 "놓친 큰 규칙들"을 본다. draft 카드는 `ownerRulesDraftSummary` + 기존 칩/`STATUS_LABEL`/`fmtDate` 재사용.

### 4. 페이지 배선 (page.tsx)
`Promise.all`에 `getOwnerRulesDrafts` 2건(또는 active 규칙 조회 포함) 추가, `CopyLearningForm`에 props 전달.

### 5. 불변식
서버액션(step 0)·훅이/썸네일 prepare·프롬프트·fixture 무변경. 이 step은 UI + 조회 뷰만.
TRUS Create 3색(`#121212`/`#F8F082`/`#FFFFFF`)·직각·그림자0·그라데이션 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # ownerRulesDraftSummary 순수헬퍼 유닛 포함
npm run build       # /copy-learn 라우트 빌드 성공
```

## 검증 절차

1. 위 AC 실행.
2. 체크리스트: 순수 헬퍼가 `src/lib/**`에 있는가(컴포넌트 파일 아님)? 조회가 best-effort 폴백(CHECK 미적용에도 페이지 안 막힘)인가? TRUS 3색·직각·그림자0 준수? 새 렌더러 없이 기존 컴포넌트 재사용?
3. `phases/owner-feedback-rules/index.json`의 step 1 갱신(completed+summary / error / blocked).

## 금지사항

- 순수 헬퍼를 `CopyLearningForm.tsx`에 두지 마라. 이유: vitest에 `@/` alias가 없어 컴포넌트를 테스트가 import하면 내부 `@/` import까지 끌려와 스위트 전체 로드가 깨진다(프로젝트 규칙).
- draft 조회를 throw로 두지 마라(best-effort `[]` 폴백). 이유: 마이그 034 미적용 환경에서 `/copy-learn` 전체가 막힌다.
- 그라데이션·그림자·3색 외 색을 쓰지 마라. 이유: TRUS Create 위반.
- 훅이/썸네일 prepare·프롬프트·서버액션을 수정하지 마라. 이유: 주입은 step2, 백엔드는 step0.
- 명세에 없는 신규 untracked 파일을 커밋에 섞지 마라. `git status`로 확인.
- 기존 테스트를 깨뜨리지 마라.
