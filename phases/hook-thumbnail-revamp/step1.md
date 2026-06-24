# Step 1: thumbnail-render-ui

**썸네일 렌더 + 수정 UI를 "메인문구 2개 + 작은 박스 2개" 구조로(프론트엔드).** step0이 데이터 계약(payload에 `thumbnail_main[2]`·`thumbnail_boxes[2]`·`ref_similarity`)을 만들었다. 이 step은 그걸 화면에 그리고, 수정 입력칸을 나누고, 레퍼런스 유사 경고를 보여준다.

## 읽어야 할 파일 (먼저 정독)
- `src/lib/dashboard/proposalTypes.ts` (step0 갱신) — `TitlePayload`에 `thumbnail_main?`·`thumbnail_boxes?`·`thumbnail_copy?`·`ref_similarity?`. **이 필드들을 UI가 소비한다.**
- `src/components/ThumbnailCanvas.tsx` — 현재 `{copy: string, layout?}` 받아 줄바꿈 분리 렌더. **메인2+박스2 구조 렌더로 확장하되 레거시 string도 계속 받게.**
- `src/components/CandidateBody.tsx` (16~24줄 `title_thumb` 분기) — ThumbnailCanvas 호출부.
- `src/components/ProposalSelector.tsx` (`EditFields`의 `title_thumb` 분기, 136~151줄) — 현재 썸네일 문구 textarea 1개. 메인2·박스2 개별 입력으로 바꾼다.
- `design/design-system/trus-create/trus-create-design-system.md` 또는 기존 컴포넌트의 TRUS 색 토큰(`trus-black`·`trus-yellow`·`trus-white`) — 3색·radius 0·그림자/그라데이션 금지 규칙 준수.
- 참고 이미지의 레이아웃: **메인문구 2줄(큰 글씨)** 위, **작은 박스 2개**(작은 글씨, 박스 테두리/배경 구분) 아래.

## 작업
### 1) ThumbnailCanvas (`ThumbnailCanvas.tsx`) — 구조 렌더 + 레거시 호환
Props를 확장(하위호환 필수):
```ts
export function ThumbnailCanvas(props: {
  main?: string[]; boxes?: string[];   // 신규 구조
  copy?: string;                        // 레거시(구 데이터·없으면 무시)
  layout?: string;
})
```
- **신규 우선**: `main`/`boxes`가 있으면 구조 렌더 — 메인문구 2개는 **큰 글씨(font-black, 기존 큰 사이즈)**, 작은 박스 2개는 **작은 박스**(테두리 또는 노랑/검정 배경 칩, `text-xs`~`text-sm`)로 메인 아래 배치. 참고 이미지 느낌(메인 위·박스 아래).
- **레거시 폴백**: `main`/`boxes`가 없고 `copy`(string)만 있으면 **기존 렌더 그대로**(줄바꿈 분리 + `[강조]` 하이라이트). 기존 `splitEmphasis` 재사용.
- 인물 슬롯(좌 38%)·노랑 코너바·16:9·3색 규칙은 유지.
- 빈 입력(main/boxes/copy 전부 없음) → 기존 "카피 없음" placeholder.
- `layout` 캡션은 기존대로 캔버스 아래 작게.

### 2) 호출부 (`CandidateBody.tsx`)
`title_thumb` 분기에서 payload의 신규 필드를 넘긴다:
```tsx
<ThumbnailCanvas main={p.thumbnail_main} boxes={p.thumbnail_boxes} copy={p.thumbnail_copy} layout={p.thumbnail_layout} />
```
- **#3 경고 배지**: `p.ref_similarity != null && p.ref_similarity >= 0.6`이면 제목 옆/아래에 작은 경고 칩 `⚠ 레퍼런스와 유사`(노랑 텍스트). 임계값 상수는 step0의 `REFERENCE_SIMILARITY_FLAG`를 import해 쓴다(하드코딩 0.6 중복 금지).

### 3) 수정 UI (`ProposalSelector.tsx` EditFields의 title_thumb)
현재 썸네일 문구 textarea 1개를 → 개별 입력으로:
- 제목 input(기존 유지)
- 메인문구 1, 메인문구 2 (input 2개) → `thumbnail_main: [m1, m2]`
- 작은 박스 1, 작은 박스 2 (input 2개) → `thumbnail_boxes: [b1, b2]`
- 레이아웃 설명 textarea(기존 유지)
- `set(...)`로 draft 갱신 시 `thumbnail_main`/`thumbnail_boxes` 배열로 저장. **레거시 draft(구 thumbnail_copy만 있는 경우)** 열어도 크래시 없게 옵셔널 가드(`p.thumbnail_main?.[0] ?? ""`).
- (수정본은 `edited_payload`로 저장 — 기존 흐름. 파생 `thumbnail_copy`는 굳이 재계산 안 해도 됨; 다운스트림은 main/boxes 우선, 없으면 copy.)

## 주의
- **레거시 데이터 하위호환 필수.** 이유: DB에 이미 저장된 옛 제안은 `thumbnail_copy` 문자열만 있다 — 구조 필드 없다고 크래시/빈화면 나면 안 된다(마이그레이션 없이 옛 데이터도 보여야 함).
- 컨트롤드 입력은 항상 `value={... ?? ""}` (uncontrolled 경고·undefined 크래시 방지).
- TRUS 3색·radius 0·그림자/그라데이션 금지. 새 색/그림자 추가 금지.
- 백엔드(schema·stage·prepare)·step2 파일(RequestStageButton)은 건드리지 마라.
- 이 step은 **UI 신호** → 팀 리드는 Esther를 투입한다(렌더·레이아웃·디자인 토큰).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. `npm run build` 후 `/runs/[id]`에서 title_thumb 후보가 메인2+박스2로 렌더되는지(가능하면 로컬 육안). 헤드리스/데이터 없으면 컴포넌트 타입·빌드로 갈음.
3. 레거시 호환 자가확인: `thumbnail_copy`만 있는 payload로 ThumbnailCanvas가 기존처럼 렌더되는지(props 분기) 코드로 확인.
4. step 1 갱신: 성공 → `"status":"completed"` + `"summary":"ThumbnailCanvas 메인2+박스2 구조 렌더(레거시 copy 폴백)+CandidateBody 배선+ref_similarity 경고배지+EditFields 개별입력(main/boxes). TRUS 3색 유지. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- 백엔드/스키마 수정 금지(step0에서 끝). 이유: 레이어 분리.
- 레거시 `copy` 폴백 제거 금지. 이유: 기존 DB 데이터 화면이 깨진다.
- 기존 테스트를 깨뜨리지 마라.
