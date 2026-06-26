# Step 3: correction-ui (/copy-learn 교정 학습 섹션)

**`/copy-learn`에 "교정 학습" 섹션을 추가 — 생성 카피 + 이상 카피 입력 → 차이 보기 → 저장 → (기존 재학습).** (Esther — UI.)

## 배경
- step0 `saveCorrection(input)`·step1 `analyzeCorrectionDiff(correctionId)`·step2(재학습 합류·기존 "재학습 실행" 버튼이 교정도 학습).
- 흐름: 주제/제목 + AI 생성 카피(붙여넣기 또는 후보에서) + 이상 카피 입력 → 저장 → 차이 분석 표시 → 기존 "재학습 실행"으로 학습 → draft 활성화.

## 읽어야 할 파일 (먼저 정독)
- `CLAUDE.md` 디자인 + `DESIGN.md` — **TRUS Create 3색·직각·그림자/그라데이션 금지.**
- `src/components/CopyLearningForm.tsx` — **수정/확장 대상.** `INPUT_CLS`·`VideoCard` 입력 패턴·`useTransition`+`router.refresh()`·`StylePanel`(재학습 버튼). 직전 phase들의 "추가/이름/업로드일" 입력 카드 패턴 미러.
- `src/app/actions/copyLearn.ts`(또는 corrections.ts) — step0 `saveCorrection`·step1 `analyzeCorrectionDiff` 실제 시그니처(추측 금지).
- `src/lib/dashboard/copyLearnView.ts` — 페이지가 데이터를 읽어 폼에 넘기는 방식(기존 교정 목록·diff를 보여주려면 여기 read 함수 추가).
- `src/app/copy-learn/page.tsx` — 서버 컴포넌트가 view 데이터를 폼에 전달하는 구조.

## 작업
### 1) 읽기 — 교정 목록 (copyLearnView.ts)
- `getCorrections(component?): CorrectionRow[]`(최신순) — topic·gen/ideal 카피·diff·learned_at. page.tsx가 폼에 전달.

### 2) UI — 교정 학습 섹션 (CopyLearningForm.tsx, 또는 분리 컴포넌트)
- **입력 카드**: 컴포넌트 선택(썸네일/제목) + 주제/제목 + **AI 생성 카피**(썸네일=메인2/박스2, 제목=텍스트) + **이상 카피**(같은 칸) → "저장" → step0 `saveCorrection`.
- 저장 직후 또는 "차이 분석" 버튼 → step1 `analyzeCorrectionDiff` → **diff 표시**(summary·tone·hook_angle·added/removed·actionable_rules를 읽기 쉽게 — 기존 `PatternNode` 재귀 렌더러 재사용 가능).
- **교정 목록**: 저장된 교정들(주제·diff 요약·learned_at) 카드 리스트.
- 학습은 기존 **"재학습 실행"** 버튼이 교정까지 포함(step2). 별도 학습 버튼 만들지 말 것 — 안내 문구만("교정 저장 후 재학습 실행 시 함께 학습됩니다").
- 각 동작 별도 `useTransition`·별도 ok/error(기존 패턴).

## 주의 (구체)
- **시그니처 추측 금지**: step0/1 export를 읽고 맞춰라. 이유: 드리프트.
- **학습 버튼 중복 금지**: 재학습은 기존 StylePanel 버튼 하나. 교정은 거기에 합류(step2)되므로 별도 학습 트리거 만들지 마라. 이유: 단일 학습 경로.
- **router.refresh로 반영**: 저장·분석 후 목록/표시 갱신. 이유: 서버 데이터 일관성.
- **TRUS 3색·직각·INPUT_CLS 재사용**. 새 색/그림자/rounded/라이브러리 금지.
- diff 표시는 읽기 전용(편집 불가). 접근성: label/aria-label.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy). 2. (Esther/리드) 체크: 입력→저장→차이표시→목록·시그니처 정합·재학습 버튼 중복 없음·TRUS 3색·router.refresh. 3. index.json step3 갱신.

## 금지사항
- 별도 "교정 학습" 버튼으로 학습을 또 트리거하지 마라. 이유: 기존 재학습에 합류(단일 경로).
- 새 디자인 토큰(색·그림자·rounded·외부 라이브러리)을 도입하지 마라. 이유: TRUS Create.
- step0/1/2 백엔드를 수정하지 마라(UI만). 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
