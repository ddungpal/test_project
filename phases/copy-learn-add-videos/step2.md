# Step 2: add-video-ui (학습 영상 추가 UI — CopyLearningForm)

**`/copy-learn`에 "학습 영상 추가" 카드를 붙여, step1의 `createLearningVideo`로 새 영상을 만들고 목록에 나타나게 한다.** (Esther — UI/디자인.)

## 배경
- 현재 `CopyLearningForm`(`src/components/CopyLearningForm.tsx`)은 서버에서 받은 기존 `videos`만 `VideoCard`로 렌더한다 — 새 영상 추가 입력이 없다.
- step1이 `createLearningVideo({title, youtubeVideoId?, uploadDate?, thumbnailUrl?}) → {contentId, created}` 액션을 제공한다.
- 흐름: 추가 카드에서 제목(+선택 메타) 입력 → `createLearningVideo` → `router.refresh()` → 새 `VideoCard`가 목록에 나타남 → 거기서 기존처럼 썸네일/제목 카피·CTR 입력·저장. **생성과 카피 저장은 2단계**(기존 per-video 저장 모델 유지).

## 읽어야 할 파일 (먼저 정독)
- `CLAUDE.md` 디자인 결정 + `DESIGN.md` — **TRUS Create: 검정#121212/노랑#F8F082/흰 3색만·직각(rounded 없음)·그림자/그라데이션 금지.**
- `src/components/CopyLearningForm.tsx` — **주 수정 대상.** `INPUT_CLS`(114, 공용 인풋 스타일)·`VideoCard`·`useTransition`+`router.refresh()` 패턴(154 onSave)·하단 `CopyLearningForm`(602, "영상별 입력" 섹션). 새 추가 카드는 이 패턴을 그대로 미러.
- `src/app/actions/copyLearn.ts` — step1의 `createLearningVideo` 시그니처(추측 금지·실제 시그니처에 맞춤).
- `src/components/copyViewsParse.ts` — 숫자 파싱 헬퍼(필요 시 재사용).

## 작업
- `CopyLearningForm`의 "영상별 입력" 섹션 헤더 옆 또는 목록 위에 **"➕ 학습 영상 추가"** 토글/카드 추가.
- 추가 카드 입력: **제목(필수)** + 선택(유튜브 video id, 업로드일 `date` 입력, 썸네일 URL). 네이티브 `<input type="date">` 사용(라이브러리 금지).
- 제출 버튼 → `useTransition`으로 `createLearningVideo` 호출 → 성공 시 `router.refresh()`(새 카드가 서버 데이터로 나타남) + 입력 초기화 + 성공 메시지. 실패 시 에러 메시지(기존 onSave 에러 표기 패턴).
- 제목 빈값이면 버튼 비활성 또는 가드.
- TRUS 3색·직각·`INPUT_CLS` 재사용. 새 색·그림자·rounded 금지.

## 주의 (구체)
- **생성 후 카피 입력은 기존 VideoCard에서**: 추가 카드는 "영상 행을 만들기"만 한다. 만든 뒤 router.refresh로 나타난 VideoCard에서 썸네일/제목/CTR을 입력·저장한다. 추가 카드에 카피 입력을 다 넣지 마라. 이유: 책임 단순화·기존 저장 경로 재사용(중복 구현 금지).
- **createLearningVideo 시그니처를 추측하지 마라**: step1 실제 export를 읽고 맞춰라(옵셔널 필드 포함). 이유: 드리프트.
- **TRUS 위반 금지**: 새 색상 토큰·그림자·그라데이션·rounded 추가 금지. 이유: 디자인 시스템.
- 빈 youtube id/날짜/URL은 액션에 보내지 마라(빈 문자열 대신 생략) — step1 빌더가 값 있을 때만 키 추가하므로 폼도 빈 문자열은 undefined로. 이유: 빈 값 누출.
- 접근성: 입력에 label/aria-label(기존 카드 패턴).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy가 직접 실행해 exit code 확보).
2. (Esther/리드) 체크: TRUS 3색·직각·`INPUT_CLS` 재사용·제목 필수 가드·router.refresh로 새 카드 노출·createLearningVideo 시그니처 정합.
3. `phases/copy-learn-add-videos/index.json` step 2 갱신(성공→completed+summary 등).

## 금지사항
- 추가 카드에서 썸네일/제목 카피 전체 입력·저장을 중복 구현하지 마라. 이유: VideoCard·saveCopyAbResults 재사용.
- 새 디자인 토큰(색·그림자·rounded·외부 UI 라이브러리)을 도입하지 마라. 이유: TRUS Create.
- step0/step1 백엔드를 수정하지 마라. 이유: 범위(UI만).
- 기존 테스트를 깨뜨리지 마라.
