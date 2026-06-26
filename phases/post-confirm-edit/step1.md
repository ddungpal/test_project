# Step 1: post-confirm-edit-ui

## 읽어야 할 파일

먼저 아래를 읽고 확정 후 화면 렌더링과 기존 인라인 편집 패턴을 이해하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일·TRUS 디자인(검정#121212/노랑#F8F082/흰색 3색·그라데이션/그림자 금지)
- **step 0 산출물**: `src/pipeline/gate.ts`(`editSelectedTitle`/`editSelectedThumbnails`), `src/app/actions/topicRun.ts`(`editTitle`/`editThumbnails`) — 이 액션을 UI에서 호출한다
- `src/components/ProposalSelector.tsx` — 확정 **전** 인라인 수정(`EditFields`, `editing` 플래그, `draft`) 패턴. **이 패턴을 확정 후로 재사용·미러링**하라
- `src/components/ThumbnailStudio.tsx` — 썸네일 단계 UI(A/B/C 카드, `confirmThumbnails`, 교정 학습 패널). 확정 후 렌더 분기 확인
- `src/app/runs/[id]/page.tsx` — 제목/썸네일 단계 렌더링(확정된 값 표시 위치), props 배선

## 작업

확정(selected)된 제목·썸네일 문구를 화면에서 **손편집**할 수 있는 UI를 추가한다.

### 제목
- 확정된 제목이 표시되는 곳(page.tsx의 title_thumb selected 분기)에 "수정" 버튼 → 인라인 입력(기존 `EditFields`의 title 입력 재사용) → "저장" → `editTitle(runId, payload)` → `router.refresh()`.

### 썸네일
- 확정된 A/B/C 3카드 각각에 "수정" 버튼 → 카드별 `thumbnail_main`(2개)·`thumbnail_boxes`(2개) 인라인 입력 → "저장" → 3개 payload 배열로 `editThumbnails(runId, payloads)` → `router.refresh()`.
- 한 카드만 고쳐도 **나머지 2개는 현재 값 그대로** 배열에 담아 보낸다(전체 세트가 selection 한 행이므로).

공통:
- 저장 중 busy/disabled·에러 표시(기존 ThumbnailStudio `busy`/`error` 패턴 참고).
- TRUS 3색만. 그라데이션·그림자 금지.
- 교정 학습 패널과 **섞지 마라** — 교정은 독립 경로(상태·busy 별도). 수정 버튼은 별도 transition/state로 키잉한다.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드로 판별.)

## 검증 절차

1. 위 AC 커맨드 실행(전부 exit 0).
2. 아키텍처 체크리스트:
   - step 0 액션(`editTitle`/`editThumbnails`)만 호출하고 `selectProposal`/`confirmThumbnails`(전이 동반)를 재호출하지 않는가.
   - TRUS 3색·격동고딕 톤 준수, 그라데이션/그림자 없음.
   - 한 썸네일 카드 수정 시 나머지 2개 값이 보존되는가.
3. `phases/post-confirm-edit/index.json`의 step 1을 갱신(completed+summary / error / blocked).

## 금지사항

- un-confirm(확정→proposed 역전이) 버튼을 만들지 마라. 이유: 상태를 되돌리지 않는 게 이 phase의 설계(손편집은 selection만 갱신).
- 다운스트림(구성·대본) 재생성을 트리거하지 마라. 이유: 제목 수정은 수동 보정용이며, 이미 생성된 하위 단계 자동 전파는 이 phase 범위 밖이다(필요 시 사용자가 해당 단계에서 직접 다시 생성).
- 교정 학습 패널의 transition/state를 재사용하거나 섞지 마라(독립 경로 유지).
- 새 서버 액션·gate 함수를 추가로 만들지 마라(step 0 것을 쓴다).
- 기존 테스트를 깨뜨리지 마라.
