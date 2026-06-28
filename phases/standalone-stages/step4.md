# Step 4: standalone-ui

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md`, `DESIGN.md` — TRUS Create 디자인(Black #121212 / Yellow #F8F082 / White 3색만, 산돌 격동고딕2, 강렬·직설, 그라데이션·그림자 금지)
- `design/design-system/trus-create/trus-create-design-system.md` — 디자인 원본
- `src/app/page.tsx` — 메인 화면(여기 '단독 실행' 섹션 추가). 기존 run 목록 렌더 구조 파악
- `src/pipeline/standalone/deps.ts` — step0 `STANDALONE_DEPS`(크루별 필요한 입력 필드·라벨 — 폼을 이걸로 동적 렌더)
- `src/app/actions/standaloneRun.ts`(또는 step2/3가 둔 위치) — `runStandalone(target, rawInputs)` 진입점
- 기존 폼 컴포넌트(예: `src/app/copy-learn/` 의 CopyLearningForm, ThumbnailStudio) — 입력·버튼 스타일·서버액션 호출 패턴 미러

## 목표

**메인 화면에 '단독 실행' 섹션**을 추가해, 크루를 골라 필요한 입력만 넣고 한 단계만 즉시 실행한다(별도 페이지 아님). 제출하면 `/runs/[id]`로 이동해 결과를 본다.

## 작업

`src/app/page.tsx`에 '단독 실행'(또는 '한 단계만 실행') 섹션 추가:

- 크루 선택: 촉이(주제)·훅이(제목)·썸네일·구다리(구성)·셜록(리서치)·짠펜(스크립트) 6개. 선택 시 `STANDALONE_DEPS[stage].seeds`로 **필요한 입력칸만 동적 렌더** — 예: 셜록 고르면 '주제'+'구성'만 뜨고 썸네일/제목은 안 뜸. optional 필드는 '(선택)' 표기. facts/assets(짠펜)는 여러 줄 textarea.
- 제출 → 서버 액션으로 `runStandalone(stage, rawInputs)` 호출 → 반환된 runId로 `/runs/[runId]` 리다이렉트(`redirect()` 또는 클라이언트 router.push). 결과(제안·리서치·스크립트)는 기존 상세 화면이 렌더.
- required 입력 미충족 시 제출 막고 안내. (단독 run은 메인 목록엔 안 보임 — step1 필터. 정상.)
- 디자인: TRUS 3색·격동고딕·강렬 직설 카피. 그라데이션·그림자·과한 여백/사색 톤 금지. 안티-슬롭(범용 카드·무의미 아이콘 나열 금지).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 폼이 `STANDALONE_DEPS` 기반으로 크루별 **필요한 입력만** 노출(셜록에 썸네일 입력 없음).
   - 제출이 `runStandalone` 호출 → `/runs/[id]` 이동.
   - TRUS 3색·격동고딕 준수, 그라데이션·그림자 없음.
   - 기존 메인 run 목록 렌더를 깨지 않음(섹션 추가만).
3. `phases/standalone-stages/index.json`의 step 4 갱신.

## 금지사항

- 별도 라우트(`/standalone` 등)를 만들지 마라. 이유: 사용자 결정=메인 화면에 '단독 실행'으로 구분.
- 입력 폼에 그 단계가 안 쓰는 필드를 넣지 마라(예: 셜록에 썸네일). 이유: `STANDALONE_DEPS`가 단일 출처 — 불필요 입력 강제가 이 기능이 없애려는 바로 그 불편함.
- 디자인 시스템 밖 색·그라데이션·그림자 금지. 기존 테스트를 깨뜨리지 마라.
