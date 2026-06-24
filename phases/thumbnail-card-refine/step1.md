# Step 1: candidate-display-trim

**제목·썸네일 카드 표시 다듬기(#1·#2, 프론트엔드).** ① title_thumb 카드에서 레이아웃·왜(이유)·근거칩·출처를 삭제(제목까지만) ② 썸네일 문구(메인/박스)와 제목 사이 간격을 띄워 구분. **title_thumb 단계에만** 적용 — topic·structure 카드는 그대로.

## 읽어야 할 파일 (먼저 정독)
- `src/components/CandidateBody.tsx` — `title_thumb` 분기. 현재 `메인문구/박스문구1/박스문구2` → `제목` → **레이아웃 캡션(line 88~89: `레이아웃: {layout}`)**. 레이아웃을 **삭제**하고 제목 위 간격을 넣는다.
- `src/components/ProposalSelector.tsx` — 후보 렌더(85~120줄). `<CandidateBody/>` 다음에 **`왜: {c.reason}`(103줄)** + **evidence_ids 칩(104~112줄)** + 하단 **`SourceLinks`(116~120줄·candSources)**. 이걸 **title_thumb일 때만 숨긴다**.
- `src/lib/dashboard/proposalTypes.ts` — `ProposalStage`(topic|title_thumb|structure). `stage` 비교에 사용.

## 작업
### 1) 레이아웃 삭제 + 제목 간격 (`CandidateBody.tsx` title_thumb 분기)
- **레이아웃 캡션 블록 제거**(`{layout && (<p>레이아웃: …</p>)}`). `layout` 변수도 미사용이면 정리(`thumbnail_layout` 자체는 payload에 남겨둔다 — 표시만 제거).
- **#2 간격**: `제목` 블록 위에 명확한 구분 간격을 준다 — 박스문구 그룹과 제목 사이에 더 큰 여백(예: 제목 `div`에 `mt-3`) + (선택) 얇은 hairline 구분선(`border-t border-trus-white/10 pt-2`). "한눈에 구분"되게(현재 `gap-1`보다 확실히 띄움). TRUS 3색·radius 0·그림자 금지.
- ref 경고 칩(⚠ 레퍼런스와 유사)은 **유지**(제목 옆/아래 기존대로).
- 레거시 폴백(`썸네일 문구: thumbnail_copy`)도 유지.

### 2) 왜·근거칩·출처 숨김 (`ProposalSelector.tsx`, title_thumb 한정)
- `왜: {c.reason}`·evidence_ids 칩·`SourceLinks(candSources)`를 **`stage !== "title_thumb"`일 때만 렌더**한다(조건부). topic·structure 카드는 지금처럼 왜·근거·출처 표시.
- 라디오 선택 버튼·`CandidateBody`·테두리/활성표시는 그대로.

## 주의
- **title_thumb에만 적용.** 이유: 왜(이유)·근거는 topic·structure 선택 판단에 필요하다 — 거기선 유지. title_thumb 카드만 사용자가 정리 요청.
- `thumbnail_layout` 데이터·스키마는 건드리지 마라 — **표시만** 제거(다른 곳[회고 등]이 payload를 읽을 수 있음).
- page.tsx의 '선택 요약' 뷰(선택 후 `이유: {selection.reason}`·SourceLinks, 80~81줄)는 **이번 범위 아님**(후보 카드가 아니라 선택 결과) — 건드리지 마라.
- payload는 unknown — 접근 `?.`·`?? ""` 방어 유지.
- TRUS 3색·radius 0·그림자 금지. 백엔드·프롬프트(step0)는 건드리지 마라.
- 이 step은 **UI 신호** → 팀 리드는 Esther 투입.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. (가능하면) 로컬 `/runs/[id]` title_thumb 후보: 레이아웃·왜·근거칩·출처가 안 보이고 제목까지만, 박스문구↔제목 간격이 확실히 구분되는지 육안. topic·structure 카드는 왜·근거 그대로인지 확인. 헤드리스면 타입·빌드로 갈음.
3. step 1 갱신: 성공 → `"status":"completed"` + `"summary":"title_thumb 카드: CandidateBody 레이아웃 삭제+박스↔제목 간격 구분(mt-3/hairline), ProposalSelector 왜·근거칩·SourceLinks를 stage!==title_thumb 조건부로 숨김(topic/structure 유지). ref 경고·레거시 폴백 유지. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- topic·structure 카드의 왜·근거 숨김 금지(title_thumb만).
- `thumbnail_layout` 데이터/스키마 변경 금지(표시만 제거).
- page.tsx 선택 요약 뷰 수정 금지(범위 밖).
- 기존 테스트를 깨뜨리지 마라.
