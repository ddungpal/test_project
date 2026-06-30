# Step 1: review-inline-ui (프론트 — 인라인 사실 칩 검수)

완성된 스크립트 본문에 검증/보류 사실을 **인라인 칩**으로 띄우고, 사람이 한 화면에서 한 번에 확인한다. 보류('확인 필요') 사실은 **반려 토글**(기본=승인)을 달고, 반려가 있으면 전체 재작성으로 이어진다(정책 나). 이게 **유일한 사람 접점**이다.

## 읽어야 할 파일

- `docs/specs/2026-07-01-research-autoflow-design.md` ('D. 단일 최종 검수')
- `phases/script-review-inline-facts/index.json` step0 summary — `reviewScriptAction` 시그니처, `SegmentView.facts` 새 필드명(특히 `pending`), 보류 판별 위치.
- `src/components/ScriptReview.tsx` — 현재 `{runId}`만 받아 전체 승인/수정요청 버튼 2개. **여기를 확장**한다.
- `src/components/FactCard.tsx` — `FactCard({ fact, control })`. `control` 슬롯에 토글을 주입할 수 있다(ResearchReview가 쓰는 패턴). 칩에 재사용.
- `src/components/ResearchReview.tsx` — escalated fact별 승인/반려 토글 + 제출 패턴(`decisions` 상태, 기본 approve). **이 UX 패턴을 미러링**한다.
- `src/lib/dashboard/scriptView.ts` — `getScriptView` 반환 형태(step0이 확장한 `SegmentView.facts`).
- `src/app/runs/[id]/page.tsx` — `ScriptSection`에서 `script_review`일 때 `ScriptReview`를 렌더하는 지점(+`SegmentList`). 데이터(`getScriptView`)를 어떻게 로드/전달하는지.

## 작업

### A. ScriptReview 확장

`ScriptReview`가 세그먼트+fact 데이터를 받아 인라인 칩을 그린다:

```tsx
export function ScriptReview({ runId, segments }: { runId: string; segments: SegmentView[] }): JSX.Element;
```

- 각 세그먼트 본문 아래(또는 옆)에 그 세그먼트의 fact를 **칩**으로 표시. `FactCard`(또는 더 작은 칩)로 출처 포함 렌더.
- **보류(`pending`) fact**: `control` 슬롯에 **승인/반려 토글**(기본=승인, `ResearchReview` 패턴). "확인 필요" 표식.
- **비보류 verified fact**: 토글 없이 출처만(가벼운 인용 표시).
- 보류 fact가 하나도 없으면 칩은 출처 표시만, 버튼은 "최종 승인" 하나로 단순.

### B. 제출 동작

- "최종 승인" 클릭 → `reviewScriptAction(runId, { rejectFactIds })` 호출.
  - 반려된 보류 fact가 있으면 → **확인 다이얼로그**("반려한 사실을 뺀 대본으로 다시 씁니다 — 짠펜 재실행, 운영 시 비용. 진행할까요?") 후 호출(반려 시 전체 재작성됨).
  - 반려가 없으면 바로 승인(→approved).
- 성공 시 `router.refresh()`. 에러 표면화(기존 패턴).
- **기존 "수정 요청"(전체 재작성) 버튼은 유지**해도 됨(보류와 무관하게 통째로 다시 쓰고 싶을 때) — 단 주 동선은 인라인 칩 검수.

### C. 페이지 배선

- `runs/[id]/page.tsx`의 `ScriptSection`에서 `script_review`일 때 `getScriptView` 데이터를 `ScriptReview`에 `segments`로 전달. (이미 `SegmentList`에 같은 데이터를 쓰고 있으면 재사용.)

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

- 빌드가 stale `.next`로 `PageNotFoundError`/chunk `MODULE_NOT_FOUND` 나면 `rm -rf .next` 후 재빌드로 판별(코드 무관 캐시 오류).
- UI step이므로 Esther 투입 권장(안티-슬롭·TRUS 3색 준수: Black#121212/Yellow#F8F082/White, 그라데이션·그림자 금지).

## 검증 절차

1. AC 실행(전부 exit 0).
2. 화면 확인(가능하면 dev 서버):
   - 보류 fact에 "확인 필요" + 반려 토글(기본 승인)이 뜨는가?
   - 출처가 칩에 보이는가?
   - 반려 후 승인 시 확인 다이얼로그 → 전체 재작성으로 가는가?
   - 보류 0건이면 "최종 승인" 단일 버튼으로 깔끔한가?
   - TRUS 3색·안티-슬롭 지켰는가?
3. `phases/script-review-inline-facts/index.json` step1을 `completed`+`summary`로 갱신.

## 금지사항

- `reviewScriptAction`의 서버 로직(전이·human_approved 확정)을 UI에서 우회/중복하지 마라. UI는 rejectFactIds만 모아 넘긴다.
- TRUS 외 색·그라데이션·그림자 금지(디자인 시스템 위반).
- 세그먼트 부분 재생성을 새로 만들지 마라(정책 나 — 반려는 전체 재작성).
- 기존 `SegmentList`/스크립트 표시를 깨뜨리지 마라.
- 명세에 없는 신규 파일을 커밋에 섞지 마라(`git status` 확인).
- 기존 테스트를 깨뜨리지 마라.
