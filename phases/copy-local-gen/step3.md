# Step 3: local-gen-ui (UI — 로컬 다시생성 vs LLM 새로써줘)

**제목/썸네일 단계에서 '다시 생성(로컬·$0)'과 '새로 써줘(LLM)'를 구분하고, 후보가 어디서 왔는지 표시.** step2의 `COPY_GEN_MODE`·`forceLlm` 계약에 UI를 연결. (UI step — Esther 투입)

## 배경 (왜 이렇게)
- step0~2로 제목/썸네일 생성·다시생성이 활성 스켈레톤으로 로컬($0) 동작하고, LLM은 폴백이 됐다(`runProposalStage` localCandidates·`forceLlm`).
- 사용자가 **비용 0 로컬**과 **LLM 새 창작**을 의식적으로 고를 수 있어야 함. 기본은 로컬, 품질 원하면 'LLM 새로 써줘'.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md`, `CLAUDE.md`, `DESIGN.md`, `design/design-system/trus-create/trus-create-design-system.md` — TRUS 3색(Black `#121212`/Yellow `#F8F082`/White)·직각·무그림자.
- `src/components/RegenerateButton.tsx` — 제목 등 다시생성 버튼(이유 입력·LiveRefresh). 여기에 '새로 써줘(LLM)' 분기 추가.
- `src/components/ThumbnailStudio.tsx`(또는 썸네일 카드 컴포넌트) — 썸네일 전체/개별 다시생성 UI.
- `src/app/actions/topicRun.ts` 등 다시생성 서버액션 — step2가 받는 `forceLlm`/mode 전달 계약.
- step2 산출: `runProposalStage`의 mode/`forceLlm` 파라미터, candidate.reason("로컬 스켈레톤 생성") — 출처 배지 소스.

## 작업
### 1) 버튼 분기
- 제목·썸네일 다시생성 영역에 **두 버튼**: `다시 생성($0)`(로컬·기본) + `LLM으로 새로 써줘`(forceLlm=true). 이유 입력은 LLM 경로에만 의미(로컬은 슬롯 변주) — 로컬 버튼은 이유 없이 즉시.
- 서버액션 호출 시 step2 계약대로 `forceLlm` 전달.

### 2) 출처 배지
- 후보 카드에 생성 출처 표시: candidate.reason/evidence로 "로컬 생성" vs "LLM" 구분 배지(작게). 활성 스켈레톤 없어 자동 LLM 폴백된 경우도 "LLM"으로.

### 3) (선택) 안내
- 활성 스켈레톤이 없으면 '다시 생성($0)'을 비활성/안내("학습 활성화 후 로컬 생성 가능") — `/copy-learn`에서 스타일 활성화 유도.

## 주의 (구체)
- **TRUS 3색·직각·무그림자**: 기존 RegenerateButton 스타일 클래스 그대로. 새 색·그라데이션·그림자 금지. 이유: 디자인 일관.
- **step0~2 계약 불변**: UI는 `forceLlm`/mode를 전달·표시만. localCopyGen·runProposalStage·스키마 수정 금지. 이유: 범위.
- **로컬=즉시·$0 강조 안전**: 로컬 경로는 LLM 미호출이라 지연 거의 0 — LiveRefresh 폴링이 즉시 끝나도 깨지지 않게(이미 완료 감지=proposalId 변경). 이유: 기존 폴링과 호환.
- 빈 슬롯/스켈레톤 소진으로 로컬 후보가 적거나 0이면 LLM 폴백되었음을 사용자에게 혼동 없이 표시. 이유: 기대 일치.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트
- 순수 분기/표시 로직 있으면 단위테스트. 컴포넌트는 typecheck/build로 검증(헤드리스 클릭검증은 server-only 장벽으로 생략 — 기존 관례).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수). `/`(런 화면)·`/copy-learn` build 포함·typecheck 통과.
2. 체크: 다시생성($0)/새로써줘(LLM) 분기·forceLlm 전달·출처 배지·TRUS 3색·step0~2 계약 불변.
3. (Esther) 디자인 체크: 3색·직각·무그림자·기존 버튼과 일관.
4. `phases/copy-local-gen/index.json` step 3 갱신.

## 금지사항
- step0~2 계약(localCopyGen·runProposalStage·schema) 수정 금지. 이유: 범위.
- 그라데이션·그림자·TRUS 외 색 금지. 이유: 디자인 시스템.
- 백엔드 생성/학습 로직 수정 금지(step1·2). 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
