# Step 1: copy-learn-correction-readonly (/copy-learn 교정 입력 폼 → 읽기전용 목록)

**`/copy-learn`의 교정 학습 '입력 폼'을 제거하고, 저장된 교정의 읽기전용 목록(diff·learned 상태)만 남긴다.** 캡처는 런 화면(step0)으로 이동했으므로.

## 배경
- 직전 phase가 `/copy-learn`에 교정 입력 폼(컴포넌트 선택·생성/이상 카피 붙여넣기)을 뒀으나, 사용자 의도는 **런 화면 캡처**(step0). → copy-learn의 입력 폼은 더 이상 맞지 않는다.
- 단, 저장된 교정을 **검토**(무엇이 교정됐고·diff·재학습에 반영됐는지)하는 건 학습 허브(`/copy-learn`)에서 유용 — **읽기전용 목록은 유지**. 재학습 버튼(기존)도 그대로(교정 합류 학습).

## 읽어야 할 파일 (먼저 정독)
- `CLAUDE.md` 디자인 + `DESIGN.md` — TRUS 3색.
- `src/components/CopyLearningForm.tsx` — **수정 대상.** 직전 phase가 추가한 **교정 학습 섹션**(입력 카드 + 차이 분석 + 목록). 입력 카드·저장·분석 호출 부분을 제거하고 목록만 남긴다. 기존 `PatternNode` 재귀 렌더러(diff 표시)·`fmtDate` 재사용.
- `src/lib/dashboard/copyLearnView.ts` — `getCorrections()`(읽기·목록용·이미 있음·테이블 부재 시 빈배열 degrade). 그대로 사용.
- `src/app/copy-learn/page.tsx` — corrections를 폼에 전달하는 배선(유지).

## 작업
- `CopyLearningForm`의 교정 섹션에서 **입력 카드(컴포넌트 선택·생성/이상 카피 입력·저장·차이 분석 버튼)를 제거**.
- **읽기전용 교정 목록만 유지**: 각 교정 카드 = 주제 + (생성/이상 카피 요약) + **diff**(있으면, PatternNode 렌더) + **learned 상태**(learned_at 있으면 "학습됨", 없으면 "미반영 — 재학습 시 반영"). created_at.
- 섹션 안내 문구를 캡처 위치로 갱신: "교정은 **런 화면 썸네일 단계**에서 입력합니다. 여기서는 저장된 교정과 차이 분석을 검토하고, 아래/위 '재학습 실행'으로 학습에 반영합니다."
- `saveCorrection`/`analyzeCorrectionDiff` 클라 import가 입력 폼 제거로 안 쓰이면 제거(미사용 import 정리).

## 주의 (구체)
- **목록은 읽기전용**: 편집·저장·분석 트리거 없음(캡처는 런 화면). 이유: 단일 캡처 지점.
- **getCorrections·재학습 버튼·page 배선은 유지**. 이유: 검토 + 학습 합류는 여전히 여기.
- **백엔드 무변경**: saveCorrection/analyzeCorrectionDiff 액션 자체는 런 화면(step0)이 쓰므로 **삭제하지 마라**. copy-learn에서의 호출만 제거. 이유: 액션은 공유.
- TRUS 3색·직각·기존 스타일. 미사용 코드·import 깔끔히 제거(죽은 코드 금지).
- 접근성 유지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy). 2. 체크: 입력 폼 제거·읽기전용 목록 유지·안내문구 갱신·getCorrections/재학습 유지·백엔드 액션 미삭제·미사용 import 정리·TRUS. 3. index.json step1 갱신.

## 금지사항
- `saveCorrection`/`analyzeCorrectionDiff` 서버 액션을 삭제하지 마라. 이유: 런 화면(step0)이 사용.
- 교정 목록에 입력/편집/분석 트리거를 다시 넣지 마라. 이유: 캡처는 런 화면 단일 지점.
- `getCorrections`·재학습 버튼·page 배선을 제거하지 마라. 이유: 검토·학습 합류 유지.
- 기존 테스트를 깨뜨리지 마라.
