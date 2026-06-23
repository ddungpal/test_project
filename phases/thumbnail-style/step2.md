# Step 2: canvas-template

**썸네일 미리보기를 '초안 박스' → 김짠부 스타일 HTML/CSS 템플릿으로.** 인물 슬롯 + 카피 자동 배치 + 강조어 하이라이트. UI step이므로 **Esther(UI/UX)**가 주도한다.

> 이미지 생성 모델은 한글·인물 일관성에 약하다 → 이 step은 **HTML/CSS 템플릿**(결정적·일관)이다. 실사진은 인물 슬롯(placeholder)으로 둔다.

## 읽어야 할 파일 (먼저 정독)
- `src/components/ThumbnailCanvas.tsx` — 현재 정적 mockup(검정+노랑+카피). 리워크 대상.
- `src/agents/hook_maker/schema.ts` — 훅이 출력의 썸네일 필드(`thumbnail_layout`/`thumbnail_copy` 구조) — 이 컴포넌트의 props 계약.
- `ThumbnailCanvas`가 쓰이는 곳(예: `src/app/runs/[id]/` 하위 컴포넌트) — props 깨지지 않게.
- `DESIGN.md` + `design/design-system/trus-create/trus-create-design-system.md` — **TRUS Create**: Black `#121212` / Yellow `#F8F082` / White **3색만**, 산돌 격동고딕2, **그라데이션·그림자 금지**, 강렬·직설.
- `tailwind`/글로벌 CSS의 trus 색 토큰(`text-trus-yellow` 등 기존 사용처).

## 작업
1. `ThumbnailCanvas.tsx`를 HTML/CSS 템플릿으로 리워크:
   - **16:9** 비율 고정.
   - **인물 슬롯**: 좌측(또는 레이아웃별) 인물 이미지 영역 placeholder(이미지 없으면 비워두되 자리 유지).
   - **메인 카피 + 작은 박스 카피** 자동 배치(훅이 출력 구조 반영). 줄바꿈·크기 자동.
   - **강조어 하이라이트**(노랑 배경/테두리 등 TRUS 범위 내).
   - TRUS **3색만**, 격동고딕2, **그라데이션·그림자 없음**.
2. props로 구동되는 **순수 표현 컴포넌트**로 유지(서버 호출 없음). 기존 사용처 props 호환(깨지면 그 호출부도 맞춰 최소 수정).
3. 샘플 카피로 렌더되어 `next build` 통과.

## 주의
- 기존 `ThumbnailCanvas` props를 바꾸면 **사용처를 같이 고쳐라**(빌드 깨짐 방지). 가능하면 props 하위호환.
- 3색·무그림자 규칙 위반 금지(디자인 시스템 가드).
- 이 step은 `ThumbnailCanvas.tsx`(+사용처 최소 수정)만. 에이전트·파이프라인·DB 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm run build
```

## 검증 절차
1. 위 AC 실행, exit 0. (`next build`가 컴포넌트 타입/렌더 검증.)
2. 디자인 체크: 3색만 사용, 그라데이션·그림자 없음, 격동고딕2, 16:9.
3. `git status`로 변경 범위 확인(ThumbnailCanvas.tsx + 사용처 최소).
4. `phases/thumbnail-style/index.json` step 2 갱신: 성공 → `"status":"completed"`, `"summary":"ThumbnailCanvas HTML/CSS 템플릿(인물 슬롯+카피 자동배치+강조, TRUS 3색·무그림자). build 그린"`. 실패(3회) → `"status":"error"` + `error_message`.
