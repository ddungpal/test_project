# Step 0: run-thumbnail-correction (런 썸네일 단계에서 교정 캡처)

**런 화면 썸네일 단계(ThumbnailStudio)의 각 A/B/C 후보 카드에 '교정 학습' 패널을 붙인다.** 생성된 후보를 기준으로 이상 썸네일을 입력→비교→교정 저장·분석. 백엔드는 기존 것 재사용(무변경).

## 배경 (왜 이렇게 — 캡처 지점 교정)
- 직전 phase(`thumbnail-correction-learning`)가 교정 입력을 `/copy-learn` 수동 붙여넣기 폼으로 뒀으나, **사용자 의도는 런 화면에서 실제 생성된 썸네일을 보고 그 자리에서 '내가 원하는 썸네일'을 입력·비교**하는 것이다.
- ThumbnailStudio는 이미 생성된 A/B/C 후보(`c.payload`의 `thumbnail_main`/`thumbnail_boxes`)를 카드로 보여준다. 여기에 교정 패널을 붙이면 **gen=그 후보의 실제 카피**(붙여넣기 불필요), **ideal=사용자 입력**으로 자연스럽게 교정쌍이 만들어진다.
- 백엔드(`saveCorrection`·`analyzeCorrectionDiff`·학습 합류·`thumbnail_corrections` 테이블)는 **그대로 재사용**. 이 step은 캡처 UI + page 배선만.

## 읽어야 할 파일 (먼저 정독)
- `CLAUDE.md` 디자인 + `DESIGN.md` — **TRUS Create 3색·직각·그림자/그라데이션 금지.**
- `src/components/ThumbnailStudio.tsx` — **주 수정 대상.** 후보 카드 렌더(96-145)·`useTransition`/`router.refresh()`·카드별 사유 입력 패턴(125-140). 교정 패널을 이 카드 패턴에 맞춰 추가.
- `src/components/CandidateBody.tsx` — 썸네일 payload에서 `thumbnail_main`/`thumbnail_boxes`를 읽는 방식(gen 추출 본보기).
- `src/app/actions/copyLearnMap.ts:145` — `CorrectionInput`(componentType·topic·genMain·genBoxes·idealMain·idealBoxes). **시그니처 정확히 사용.**
- `src/app/actions/copyLearn.ts:100,133` — `saveCorrection(input):{id}`·`analyzeCorrectionDiff(correctionId):{diff}`. ('use server' — 클라에서 호출 가능.)
- `src/app/runs/[id]/page.tsx:171` — `<ThumbnailStudio runId proposalId candidates/>` 렌더. **여기에 topic prop 추가** 필요(`content.title || content.topic`, 369행 heading이 쓰는 값). 썸네일 단계 렌더 헬퍼(129~171)가 content 접근 가능한지 확인해 전달.
- `src/lib/dashboard/proposalTypes.ts` — `CandidateView`/payload 타입.

## 작업
### 1) `page.tsx` — ThumbnailStudio에 topic 전달
- `<ThumbnailStudio ... topic={content.title || content.topic || ""} />`. 렌더 헬퍼가 content를 못 받으면 인자로 넘기도록 배선.

### 2) `ThumbnailStudio.tsx` — 후보 카드에 교정 패널
- props에 `topic: string` 추가.
- 각 후보 카드 하단(또는 토글)에 **'교정 학습' 패널**:
  - 이상 메인 2칸 + 이상 박스 2칸 입력(생성 카피는 카드에 이미 보임 — 비교 대상). 프리필=빈칸(또는 생성값 복사해 편집 편의 — 재량).
  - **"이 썸네일 교정"** 버튼 → `useTransition`으로:
    1. gen 추출: `c.payload.thumbnail_main`/`thumbnail_boxes`(배열 안전 추출).
    2. `saveCorrection({ componentType:"thumbnail", topic, genMain, genBoxes, idealMain, idealBoxes })` → `{id}`.
    3. 이어서 `analyzeCorrectionDiff(id)` → `{diff}` → **diff를 카드에 인라인 표시**(summary·tone·hook_angle·added/removed·actionable_rules. 읽기전용).
  - 성공/에러 메시지(카드별·별도 transition). 빈 이상입력이면 버튼 비활성/가드.
- **재생성/확정 동작과 간섭 금지**: 교정은 별도 transition·별도 busy/error. 기존 `runRegen`/`onConfirm`/`startId` 폴링과 섞지 마라(상태 오염). 교정은 상태 전이 없음(저장만) → proposalId 폴링과 무관.

## 주의 (구체)
- **gen은 그 후보의 실제 카피**: 사용자가 다시 입력 안 함. `c.payload`에서 안전 추출(배열 아니면 빈배열). 이유: 캡처 지점의 핵심 — 생성 결과 기준.
- **시그니처 추측 금지**: `CorrectionInput`·`saveCorrection`·`analyzeCorrectionDiff` 실제 export대로. 이유: 드리프트.
- **교정 ≠ 재생성·확정**: 교정은 학습 신호 기록일 뿐, 런 진행(확정)과 무관. 교정해도 후보·상태 안 바뀐다. 이유: 책임 분리·기존 폴링 오염 방지.
- **학습은 별도**: 교정 저장 후 실제 patterns 반영은 `/copy-learn` 재학습 버튼이 한다(기존 합류). 런 화면에서 재학습 트리거 만들지 마라. 이유: 단일 학습 경로(직전 phase 합류 설계).
- **TRUS 3색·직각·기존 인풋 스타일 재사용**. 새 색/그림자/rounded/라이브러리 금지.
- 접근성: 입력·버튼 label/aria-label. `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess`.

## 테스트
- gen 추출 순수 헬퍼(payload→{main,boxes})가 있으면 단위 테스트(배열·더티값·누락 안전). UI 위주라 무리면 typecheck/build로.
- 기존 ThumbnailStudio/런 관련 테스트 보존.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy). 2. (Esther/리드) 체크: 교정 패널이 생성 후보 기준·gen 자동추출·diff 인라인 표시·재생성/확정과 transition 분리·재학습 트리거 없음·TRUS 3색·시그니처 정합. 3. index.json step0 갱신.

## 금지사항
- 교정 저장이 후보·런 상태를 바꾸게 하지 마라. 이유: 책임 분리·폴링 오염.
- 런 화면에서 재학습을 트리거하지 마라. 이유: 학습은 /copy-learn 단일 경로(합류).
- 백엔드(saveCorrection·analyzeCorrectionDiff·테이블·학습)를 수정하지 마라. 이유: 재사용·범위(step1은 copy-learn UI).
- 새 디자인 토큰·외부 라이브러리 금지. 이유: TRUS.
- 기존 테스트를 깨뜨리지 마라.
