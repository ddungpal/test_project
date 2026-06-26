# Step 1: manage-videos-ui (영상 삭제 버튼 + 업로드일 수정 UI)

**`/copy-learn` 영상 카드에 ① 삭제 버튼(확인 후) ② 업로드일 수정 칸을 추가한다.** step0의 `deleteLearningVideo`·`updateContentUploadDate` 사용. (Esther — UI.)

## 배경
- step0이 `deleteLearningVideo(contentId) → {deleted}`·`updateContentUploadDate(contentId, uploadDate) → {updated}` 액션을 제공한다.
- 카드 헤더는 `업로드 {fmtDate(video.uploadDate)}`를 표시(없으면 "—"). 직전 phase에서 "영상 이름" 인라인 편집을 추가한 패턴이 있다 — 그 패턴 미러.

## 읽어야 할 파일 (먼저 정독)
- `CLAUDE.md` 디자인 + `DESIGN.md` — **TRUS Create: 검정/노랑/흰 3색·직각·그림자/그라데이션 금지.**
- `src/components/CopyLearningForm.tsx` — **주 수정 대상.** `VideoCard`·`INPUT_CLS`·`useTransition`+`router.refresh()`·직전 phase의 "영상 이름" 편집 칸(같은 카드)·헤더 `fmtDate`(업로드일 표시).
- `src/app/actions/copyLearn.ts` — step0의 `deleteLearningVideo`·`updateContentUploadDate` 실제 시그니처(추측 금지).

## 작업
### 1) 업로드일 수정 칸
- VideoCard 펼친 영역(영상 이름 칸 근처)에 **업로드일** 입력 추가: 네이티브 `<input type="date">`(프리필=`video.uploadDate?.slice(0,10) ?? ""`) + "업로드일 저장" 버튼.
- 버튼 → `useTransition`으로 `updateContentUploadDate(video.id, 값)` → 성공 시 `router.refresh()` + 메시지. 빈값이면 가드.

### 2) 삭제 버튼
- VideoCard 펼친 영역 하단에 **"이 영상 삭제"** 버튼(위험 동작이므로 시각적으로 구분 — 예: 테두리만/덜 강조, TRUS 3색 내에서).
- 클릭 → `window.confirm`으로 **명확한 경고**: "이 영상과 관련 데이터(썸네일·제목·성과·회고·런)가 모두 삭제됩니다. 되돌릴 수 없습니다." → 확인 시 `useTransition`으로 `deleteLearningVideo(video.id)` → 성공 시 `router.refresh()`(목록에서 사라짐). 실패 시 에러 메시지.

## 주의 (구체)
- **삭제는 되돌릴 수 없음 → 반드시 confirm**. 이유: 캐스케이드로 run·자식까지 삭제(실수 방지).
- **시그니처 추측 금지**: step0 export를 읽고 맞춰라(반환 `{deleted}`/`{updated}`). 이유: 드리프트.
- **router.refresh로 반영**: 삭제 후 목록·업로드일 수정 후 헤더가 서버 데이터로 갱신돼야 한다. 로컬 state만 바꾸지 마라. 이유: 일관성.
- **각 동작 별도 transition·별도 ok/error**: 이름/업로드일/카피 저장/삭제가 서로 간섭 안 하게(직전 phase 영상 이름 패턴 동일). 이유: 책임 분리.
- **TRUS 위반·새 의존 금지**: 빨강 같은 새 색 추가 금지 — 삭제 강조는 3색 내에서(테두리·텍스트). 이유: 디자인 시스템.
- 접근성: input·버튼에 label/aria-label.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy가 직접 실행해 exit code 확보).
2. (Esther/리드) 체크: 삭제 confirm 경고 명확·각 동작 별도 transition·router.refresh 반영·시그니처 정합·TRUS 3색·`<input type="date">` 네이티브.
3. `phases/copy-learn-manage-videos/index.json` step 1 갱신(성공→completed+summary 등).

## 금지사항
- 삭제를 confirm 없이 즉시 실행하지 마라. 이유: 비가역·캐스케이드.
- 새 색(빨강 등)·그림자·rounded·외부 라이브러리를 도입하지 마라. 이유: TRUS Create.
- step0(백엔드)을 수정하지 마라. 이유: 범위(UI만).
- 기존 테스트를 깨뜨리지 마라.
