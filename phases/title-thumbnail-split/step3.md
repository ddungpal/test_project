# Step 3: title-thumbnail-ui

**프론트엔드 — 제목 단계(3개 중 1개 선택) + 썸네일 단계(3개 카드·개별/전체 다시생성·3개 확정).** 순수 UI 신호 → Esther 투입. step0~2의 데이터·백엔드는 건드리지 마라.

## 선행 (step0~2 산출물)
- step0: `ProposalStage`에 `"thumbnail"`, `ThumbnailPayload`(thumbnail_main[2]·thumbnail_boxes[2]·thumbnail_layout?), 상태 `thumbnails_proposed`/`thumbnails_selected`, `STAGE_DESCRIPTORS.thumbnail`.
- step1: 훅이=제목 전용(후보=title), thumbnail_maker(썸네일 3개), `requestThumbnails`.
- step2: `regenerateThumbnails`(전체)·`regenerateThumbnailSlot(runId, slotIdx)`(개별) 서버액션.

## 읽어야 할 파일 (먼저 정독)
- `src/app/runs/[id]/page.tsx` — `StageSection`(선택됨/제안중/시작/대기 분기), `REGEN_STAGE` 매핑, `RegenerateButton` 렌더. **thumbnail 단계 분기 추가.**
- `src/components/CandidateBody.tsx` — stage별 후보 본문. **title_thumb(이제 제목전용)에서 썸네일 렌더 제거 + thumbnail 단계 본문(메인2·박스2) 추가.** 직전 phase의 ref_similarity 칩·style_conformance 칩 패턴 보존.
- `src/components/ProposalSelector.tsx` — 제목 단계는 이 단일선택 패턴 그대로(stage "title_thumb"). 썸네일은 **별도 컴포넌트**(단일선택 아님).
- `src/components/RegenerateButton.tsx`(직전 fix) — proposalId 변경으로 완료 감지·폴링. 썸네일 전체/개별 버튼이 이 완료감지 패턴을 재사용.
- `src/components/LiveRefresh.tsx` — 생성중 자동 갱신.
- `src/lib/dashboard/runDetail.ts`·`proposalTypes.ts`(STAGE_TITLE 등) — 단계 읽기·표시명.

## 작업
### 1) 제목 단계 정리 (title_thumb = 제목 전용)
- `CandidateBody`의 `title_thumb` 분기: **제목만** 렌더(썸네일 메인/박스 표시 제거 — step1에서 출력이 제목뿐). ref_similarity 경고 칩은 제목에 유지.
- `ProposalSelector`(stage "title_thumb")는 그대로(3개 중 1개 라디오 선택). page.tsx에서 RegenerateButton stage="titles"도 그대로(제목 다시 생성).

### 2) 새 컴포넌트 `src/components/ThumbnailStudio.tsx` (썸네일 3개 작업대)
- props: `runId`, `proposalId`, `candidates: CandidateView[]`(썸네일 3개), (필요시 sources).
- 렌더: **3개 썸네일 카드를 나란히/그리드로**. 각 카드 = 메인문구2·박스2(CandidateBody의 thumbnail 본문 재사용) + **그 카드의 "이 썸네일만 다시 생성"** 버튼(→ `regenerateThumbnailSlot(runId, idx)`). ref_similarity/style_conformance 칩 표시(있으면).
- 하단 액션 2개: **"3개 전체 다시 생성"**(→ `regenerateThumbnails(runId)`) · **"이 3개로 확정"**(→ `confirmThumbnails(runId)` — step3에서 추가하는 액션, 아래 3).
- **완료 감지/자동 갱신**: 개별·전체 다시생성은 상태 전이가 없어 proposalId 변경으로 완료 판정(RegenerateButton의 패턴 재사용). 생성중 LiveRefresh로 자동 갱신. opus는 단계 생성이 3분+ 걸릴 수 있으니 **고정 짧은 cutoff 금지**(proposalId 변경 감지로 종료, 안전상한 넉넉히 5분 — RegenerateButton과 동일 원칙).
- **개별 다시생성 중에는 어느 칸이 갱신중인지** 표시(해당 카드만 "생성 중…"). proposalId가 바뀌면(새 3종 도착) 종료.

### 3) 확정 액션 + 게이트 (`confirmThumbnails`)
- `src/app/actions/topicRun.ts`에 `confirmThumbnails(runId): Promise<{state:string}>`: requireOwner + 게이트로 `thumbnails_proposed → thumbnails_selected` 전이 + **3개를 최종으로 기록**.
- 기록 방식: `stage_selections` 재사용(단일 chosen_idx 모델과 안 맞음) → **확정은 3개 전부 보존**이므로 `edited_payload`에 확정된 3개 payload 배열을 담고 `chosen_idx`는 센티넬(예 0)로(컬럼 NOT NULL 여부 확인). 또는 전용 경량 게이트 함수(`src/pipeline/gate.ts` 옆에 `confirmThumbnailSet`)로 전이+기록. **AI 0회**(사람 게이트 — 컨펌=상태전환만).
- 가드: 현재 state가 thumbnails_proposed가 아니면 거부. proposal이 이 run·"thumbnail"에 속하는지 검증(gate.ts selectProposal의 스코프 검증 미러).

### 4) page.tsx — thumbnail 단계 분기
- `StageSection`에 thumbnail 처리:
  - `sv.selection`(확정됨): 확정된 썸네일 **3개 요약** 표시("3개 확정 — A/B/C").
  - `runState==="thumbnails_proposed" && sv.proposal`: **`<ThumbnailStudio …/>`** 렌더(3카드+버튼).
  - `runState==="titles_selected"`(=썸네일 시작 전): "썸네일 만들기" 버튼(→ `requestThumbnails`) — RequestStageButton 패턴 재사용(next는 thumbnail 의미).
- `REGEN_STAGE`/RequestStageButton의 next 매핑에 thumbnail 추가(타입 확장). 제목 단계 selected 요약은 제목만.

## 주의
- **표시/조작 전용**: 썸네일은 자동 거부·필터 없음(전부 보이고 선택은 사람). step0~2 백엔드·데이터 수정 금지.
- TRUS Create: Black `#121212`/Yellow `#F8F082`/White 3색만, radius 0, 그라데이션·그림자 금지. 3카드 그리드도 이 톤.
- 완료감지 = proposalId 변경(상태 전이 없음). **60초 같은 고정 cutoff로 폴링을 끊지 마라**(opus 3분+ — 직전 regenerate fix의 교훈). 안전상한만 넉넉히.
- 개별 다시생성 버튼은 카드별 idx를 정확히 넘겨라(0,1,2). 잘못된 idx 방지.
- `CandidateBody` title_thumb에서 썸네일 제거해도 **레거시 데이터(옛 title_thumb에 thumbnail 있던 것)에 크래시 금지**(옵셔널·`?? []` 가드).
- exactOptionalPropertyTypes·noUncheckedIndexedAccess.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. (가능하면 로컬·DB 적용된 경우) 제목 3개→1개 선택→썸네일 3개 생성→개별/전체 다시생성→3개 확정 흐름 육안. **DB 마이그레이션 미적용이면** 라이브 썸네일 단계는 안 도므로 타입·빌드·컴포넌트 렌더로 갈음(헤드리스).
3. step 3 갱신: 성공 → `"status":"completed"` + `"summary":"제목 단계 제목전용 정리(CandidateBody title_thumb 썸네일 제거) + ThumbnailStudio(썸네일3카드·카드별 개별 다시생성·전체 다시생성·3개 확정, proposalId 완료감지·고정cutoff 없음) + confirmThumbnails 게이트(thumbnails_proposed→selected·3개 기록·AI0) + page.tsx thumbnail 분기. TRUS 3색·radius0. tc/test/build 그린. ⚠️라이브는 마이그레이션 적용 후"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- step0~2(상태·에이전트·재생성 백엔드) 수정 금지.
- 자동 거부/필터 금지(표시·사람선택만).
- 고정 짧은 폴링 cutoff 금지(proposalId 변경으로 완료 감지·안전상한 넉넉히).
- 썸네일 확정에서 AI 호출 금지(컨펌=상태전환만).
- 기존 테스트·직전 phase UI(ref 칩·재생성 완료감지)를 깨뜨리지 마라.
