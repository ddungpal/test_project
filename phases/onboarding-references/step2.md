# Step 2: must-watch-ui

저장된 3개 레퍼런스를 **"필수 시청 유튜브 영상"** 패널로 스크립트 위에 표시한다(UI).

## 읽어야 할 파일

- `docs/specs/2026-07-02-onboarding-references-design.md` — "step2 must-watch-ui".
- `phases/onboarding-references/step1.md` + 산출물 — `loadOnboardingReferences(supa, runId)` 리더(title·url·videoId).
- `src/app/runs/[id]/page.tsx` — **수정 대상.** 스크립트 렌더 지점(`ScriptSection` `:315~`, script_review는 `ScriptReview`, 완료는 `SegmentList`). 상단에 패널을 얹을 위치. `isOnboardingVisible`/기존 조건부 로드 패턴 참고.
- `src/components/FactCard.tsx` — `safeHref`(http/https만 링크·js: 차단·재사용).
- `DESIGN.md` — TRUS Create 3색.

## 작업

- 신규 컴포넌트 `MustWatchReferences`(또는 page.tsx 내 섹션): `{ refs: {title,url,videoId}[] }` — "📺 필수 시청 유튜브 영상" 헤더 + 각 ref를 **제목 + 유튜브 링크**(`safeHref`·target=_blank·rel noopener)로 목록 렌더. 썸네일 `<img>`(`https://i.ytimg.com/vi/{videoId}/mqdefault.jpg`)는 있으면 표시·`onError`로 깨지면 숨김(방어). refs 비었으면 **패널 자체를 렌더 안 함**(null).
- `page.tsx`: 스크립트가 보이는 상태(script_review·approved·published 등 세그먼트 존재 상태)에서 `loadOnboardingReferences(createAdminClient(), run.id)` 로드해 **스크립트 섹션 위**에 `MustWatchReferences` 렌더. (온보딩 안 한 런은 refs [] → 패널 없음.)
- TRUS 3색·기존 border 스타일. 새 색·그라데이션·그림자 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 기존 테스트 전부 통과
npm run build
```

- UI 컴포넌트라 단위 테스트 필수 아님. 순수 헬퍼(예: 썸네일 URL 빌더)가 필요하면 `src/lib/**`에 두고 export(vitest `@/` alias 함정 회피). 기존 테스트 불변.

## 검증 절차
1. AC 실행.
2. 체크리스트: refs 없으면 패널 null(온보딩 안 한 런 영향 0). `safeHref`로 링크(js: 차단). script_review+읽기뷰 양쪽 스크립트 위. TRUS 3색. 백엔드 무변경.
3. `phases/onboarding-references/index.json` step 2 갱신. **UI는 브라우저 수동검증 필요**를 summary에 명시.

## 금지사항
- **백엔드(onboarding.ts·prepare·schema)를 건드리지 마라(step0/1에서 끝냄).**
- **refs 없을 때 빈 패널/에러를 렌더하지 마라 — null(숨김).**
- **링크에 `safeHref` 안 쓰고 raw url을 href로 넣지 마라**(js: 차단).
- 새 색·그라데이션·그림자 금지(TRUS 3색).
- 기존 테스트를 깨뜨리지 마라.
