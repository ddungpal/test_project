# Step 1: edit-title-ui (영상 카드 인라인 제목 편집)

**`/copy-learn`의 각 영상 카드에서 영상 이름(`contents.title`)을 인라인으로 수정한다.** step0의 `updateContentTitle` 사용. (Esther — UI.)

## 배경
- step0이 `updateContentTitle(contentId, title) → {updated}` 액션을 제공한다.
- 카드 헤더는 `video.title ?? "(제목 없음)"`을 보여준다(`CopyLearningForm.tsx`). 이름을 고칠 입력을 펼친 영역에 추가한다.

## 읽어야 할 파일 (먼저 정독)
- `CLAUDE.md` 디자인 + `DESIGN.md` — **TRUS Create: 검정#121212/노랑#F8F082/흰 3색·직각·그림자/그라데이션 금지.**
- `src/components/CopyLearningForm.tsx` — **주 수정 대상.** `VideoCard`(122)·`INPUT_CLS`(114)·`useTransition`+`router.refresh()`(154 onSave)·헤더의 `video.title ?? "(제목 없음)"`(191). 직전 phase의 "학습 영상 추가" 카드도 같은 패턴(참고).
- `src/app/actions/copyLearn.ts` — step0의 `updateContentTitle` 실제 시그니처(추측 금지).

## 작업
- `VideoCard`의 펼친 영역(`open && ...`) 안, "영상 CTR/조회수" 근처에 **영상 이름 편집 칸** 추가: 텍스트 input(프리필=`video.title ?? ""`) + "이름 저장" 버튼.
- 버튼 → `useTransition`으로 `updateContentTitle(video.id, 입력값)` 호출 → 성공 시 `router.refresh()`(헤더 제목 갱신) + 성공 메시지. 실패 시 에러 메시지(기존 onSave 에러 표기 패턴 재사용).
- 빈 입력이면 버튼 비활성 또는 가드(step0도 빈 값 거부).
- 기존 "이 영상 저장"(카피·CTR)과 **별도 버튼**으로 둔다 — 이름 저장과 카피 저장은 다른 액션이다(섞지 마라).
- TRUS 3색·직각·`INPUT_CLS` 재사용. 새 색/그림자/rounded/라이브러리 금지.

## 주의 (구체)
- **이름 편집 ≠ 제목 카피 편집**: 카드엔 이미 "제목" 섹션(제목 A/B 카피)이 있다. 이번 칸은 **영상 이름(contents.title)** 으로, 라벨을 명확히("영상 이름") 구분하라. 이유: 둘이 다른 것(혼동 시 사용자 오입력).
- **updateContentTitle 시그니처 추측 금지**: step0 export를 읽고 맞춰라. 이유: 드리프트.
- **router.refresh로 헤더 반영**: 저장 후 새로고침해야 `video.title`이 갱신돼 "(제목 없음)"이 사라진다. 로컬 state만 바꾸지 마라(서버 데이터가 진실). 이유: 일관성.
- TRUS 위반·새 의존 금지.
- 접근성: input에 label/aria-label.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy가 직접 실행해 exit code 확보).
2. (Esther/리드) 체크: 이름 칸이 "제목 카피"와 명확히 구분·빈값 가드·router.refresh로 헤더 갱신·updateContentTitle 시그니처 정합·TRUS 3색.
3. `phases/copy-learn-edit-title/index.json` step 1 갱신(성공→completed+summary 등).

## 금지사항
- 이름 저장을 기존 "이 영상 저장"(카피·CTR) 버튼에 합치지 마라. 이유: 다른 액션·책임 분리.
- 새 디자인 토큰(색·그림자·rounded·외부 라이브러리)을 도입하지 마라. 이유: TRUS Create.
- step0(백엔드)을 수정하지 마라. 이유: 범위(UI만).
- 기존 테스트를 깨뜨리지 마라.
