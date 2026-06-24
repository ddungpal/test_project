# Step 0: candidate-thumbnail-text

**제목·썸네일 후보 표시를 그래픽 캔버스 → 라벨 텍스트 구조로 바꾼다(프론트엔드·표시 전용).** 데이터·스키마·백엔드는 손대지 않는다 — `CandidateBody`의 `title_thumb` 분기만 교체한다.

## 목표 구조 (사용자 지정)
지금은 `ThumbnailCanvas`(16:9 그래픽)에 메인문구·박스를 그리고 제목은 옆에 표시한다. 이걸 아래 텍스트 구조로 바꾼다:
```
메인문구: {thumbnail_main[0]} / {thumbnail_main[1]}
박스문구1: {thumbnail_boxes[0]}
박스문구2: {thumbnail_boxes[1]}
제목: {title}            ← 그 아래
```
- 라벨("메인문구:"·"박스문구1:"·"박스문구2:"·"제목:")은 흐리게(`text-trus-white/50` 정도), 값은 또렷하게. 제목은 가장 강조(굵게).
- TRUS 3색만(검정/노랑/흰), radius 0, 그림자·그라데이션 금지.

## 읽어야 할 파일 (먼저 정독)
- `src/components/CandidateBody.tsx` — `title_thumb` 분기(현재 `ThumbnailCanvas` + 제목 옆배치, 32~52줄 근방). **이 분기를 위 텍스트 구조로 교체.** topic·structure 분기는 그대로.
- `src/components/ThumbnailCanvas.tsx` — **이 파일에서만** import됨(`grep ThumbnailCanvas src/` 확인: CandidateBody가 유일 사용처). 교체 후 미사용 → 삭제 대상.
- `src/lib/dashboard/proposalTypes.ts` — `TitlePayload`: `title`·`thumbnail_main?: string[]`·`thumbnail_boxes?: string[]`·`thumbnail_copy?: string`(레거시)·`thumbnail_layout?: string`·`ref_similarity?: number`.

## 작업
### 1) CandidateBody `title_thumb` 분기 교체
- `p = payload as Partial<TitlePayload>`. payload는 jsonb→unknown(형태 보장 없음) — **방어적 가드 필수**(누락·undefined에 크래시 금지, `?.`·`?? ""`).
- **신규 구조**(thumbnail_main이 배열일 때):
  - `메인문구:` → `thumbnail_main`을 `" / "`로 join(빈 항목 필터).
  - `박스문구1:` → `thumbnail_boxes?.[0]`, `박스문구2:` → `thumbnail_boxes?.[1]`(없으면 그 줄 생략 또는 "—").
  - `제목:` → `title`(그 아래·가장 강조). 빈 값이면 "—".
- **레거시 폴백**(thumbnail_main 없음 + `thumbnail_copy` 문자열 있음): `썸네일 문구:` 라벨로 `thumbnail_copy`(줄바꿈은 그대로/공백 정리) 표시 후 `제목:`. (옛 제안도 안 깨지게.)
- **레이아웃 유지**(정보 보존): `thumbnail_layout`이 있으면 맨 아래 작은 캡션 `레이아웃: {…}`(흐리게, `text-xs`). 사용자가 명시 구조엔 안 넣었지만 이미지/구도 지시라 버리지 말 것 — 단 시각적으로 약하게.
- **레퍼런스 경고 칩 유지**: 기존 `refFlagged`(`p.ref_similarity >= REFERENCE_SIMILARITY_FLAG`, `@/agents/hook_maker/referenceGuard`)면 `⚠ 레퍼런스와 유사` 칩(기존 그대로).
- 레이아웃은 세로 스택(`flex flex-col gap-1`)으로 — 더 이상 썸네일 가로배치 아님.

### 2) ThumbnailCanvas 삭제(죽은 코드)
- `CandidateBody.tsx`에서 `import { ThumbnailCanvas } ...` 제거.
- `src/components/ThumbnailCanvas.tsx` **삭제**(다른 사용처 0 — git으로 확인). // ponytail: 미사용 컴포넌트 삭제. 시각 캔버스가 다시 필요하면 git 히스토리에 있음.
- 삭제 전 `grep -rn ThumbnailCanvas src/ tests/`로 잔여 참조 0 재확인. 참조 남으면 삭제 말고 정리.

## 주의
- **백엔드·스키마·`hook_maker`·`proposalTypes` 수정 금지.** 이유: 데이터는 그대로(thumbnail_main/boxes/title) — 이번 건 순수 표시 변경.
- **레거시 폴백 제거 금지.** 이유: DB에 `thumbnail_copy` 문자열만 있는 옛 제안이 있다 — 신규 필드 없다고 빈화면/크래시 나면 안 된다.
- payload는 unknown — 모든 접근 `?.`·`?? ""`로 방어(컨트롤드 아님, 읽기 표시).
- TRUS 3색·radius 0·그림자 금지.
- `CandidateBody`는 후보 목록·선택 요약 양쪽에서 쓰인다(page.tsx·ProposalSelector) — 한 곳 고치면 양쪽 반영됨. 다른 컴포넌트 손대지 마라.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0(ThumbnailCanvas 삭제 후 import 잔여·타입 에러 0).
2. `grep -rn ThumbnailCanvas src/ tests/` → 0건.
3. (가능하면) 로컬 `/runs/[id]`에서 title_thumb 후보가 "메인문구/박스문구1/박스문구2/제목" 텍스트로 뜨고, 옛 제안(레거시)도 안 깨지는지 육안. 헤드리스면 타입·빌드로 갈음.
4. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"CandidateBody title_thumb를 라벨 텍스트 구조(메인문구 A/B·박스문구1·박스문구2·제목 아래)로 교체+레이아웃 캡션·ref 경고 유지·레거시 thumbnail_copy 폴백. ThumbnailCanvas 삭제(미사용). 데이터/스키마 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- 스키마·백엔드·proposalTypes 수정 금지(표시 전용).
- 레거시 폴백·ref 경고 칩 제거 금지.
- 기존 테스트를 깨뜨리지 마라.
