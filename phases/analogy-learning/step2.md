# Step 2: /copy-learn — 비유 재학습 트리거 + draft 검토·활성화 UI

> owner가 mp4를 넣고 → 버튼 눌러 학습 → draft 확인 → **활성화**까지 할 수 있게. 유이·fixture **무영향**(활성화해도 주입은 step3에서 배선).

## 읽어야 할 파일

- `docs/specs/2026-07-03-analogy-learning-design.md` — §4.5 트리거.
- `src/app/copy-learn/page.tsx`, `src/components/CopyLearningForm.tsx` — 기존 학습 허브 UI(재학습 버튼·draft 목록·활성화 버튼 패턴을 **미러**).
- `src/lib/dashboard/copyLearnView.ts` — draft 조회 뷰(스타일 draft 읽는 법). analogy draft 조회 추가.
- `src/app/actions/copyLearn.ts` — `requestAnalogyRelearn`(step1)·`activateCopyStyle`(step1에서 'analogy' 매핑 추가됨) 호출.

## 작업

1. **재학습 버튼** — "비유 레퍼런스 재학습"(기존 스타일 재학습 버튼 미러). 클릭 → `requestAnalogyRelearn()`.
   - 폴링/로딩 카피는 기존 재학습 버튼과 동일 패턴. 결과(`{ transcribed, drafted }`) 안내.
   - 폴더가 비었으면 "learning/analogy-reels/ 에 mp4를 먼저 넣으세요" 안내.
2. **analogy draft 표시** — `component_type='analogy_style'`의 draft를 조회해 `AnalogyStylePatterns` 요약 렌더(techniques/do/banned 등 리스트). 기존 스타일 draft 카드 미러.
3. **활성화 버튼** — `activateCopyStyle('analogy', version)` 호출(step1에서 매핑 완료). active 1개 유지(기존 로직). "활성화됨" 표기.
4. `/copy-learn` 페이지에 위 섹션을 기존 폼 흐름에 자연스럽게 편입(별도 페이지 신설 금지 — 학습 허브 재사용).

> ⚠️ 클라이언트 컴포넌트에서 단위테스트할 순수 헬퍼가 생기면 컴포넌트 파일이 아니라 `src/lib/**`에 두고 export(rules.md: vitest `@/` alias 부재로 컴포넌트 import 시 스위트 로드 실패).

## 테스트

- draft 요약 렌더용 순수 헬퍼(예: patterns → 표시용 라인 배열)를 `src/lib/**`에 두고 단위테스트(빈 patterns·정상 patterns).
- (버튼 상호작용/폴링은 기존 재학습 버튼과 동일 패턴이라 수동 검증 범위. 브라우저 라이브 검증은 phase 후 사용자.)

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 전부 exit 0. stale `.next` 의심 시 `rm -rf .next` 후 재빌드.
2. 체크리스트: 버튼이 `requestAnalogyRelearn` 부르나? draft가 화면에 요약되나? 활성화가 active 1개를 유지하나? 유이·제작 파이프라인 코드 무변경인가?
3. `git status`로 범위 외 파일 점검.
