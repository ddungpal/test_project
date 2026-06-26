# Step 1: regen-postconfirm-ui

## 읽어야 할 파일

먼저 아래를 읽고 손편집 패널·폴링 패턴을 이해하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·TRUS 3색(검정#121212/노랑#F8F082/흰색·그라데이션/그림자 금지)
- **step 0 산출물**: `src/app/actions/topicRun.ts`(`regenerateAfterConfirm(runId, component, reason?)`) — 이 액션을 호출한다
- `src/components/PostConfirmTitleEdit.tsx` — 확정 후 제목 손편집(현재: 수정 토글→input→editTitle 저장). 여기에 'AI로 다시 생성' 추가
- `src/components/PostConfirmThumbnailsEdit.tsx` — 확정 후 썸네일 3카드 손편집(현재: 카드별 main2·box2 input→editThumbnails 저장). 여기에 'AI로 다시 생성' 추가
- `src/components/RegenerateButton.tsx` — **재생성 폴링 패턴의 정본**: `proposalId` prop이 제출 시점 `startId`와 달라지면 완료 감지, `POLL_LIMIT_MS`(5분) 안전망, `LiveRefresh`로 새로고침. 이 패턴을 그대로 미러링하라
- `src/app/runs/[id]/page.tsx` — 위 두 컴포넌트에 props 배선(여기서 latest proposalId를 넘겨야 폴링 완료를 감지한다)
- `src/lib/dashboard/proposalTypes.ts` — `TitlePayload`/`ThumbnailPayload`

## 작업

손편집 패널에 'AI로 다시 생성'을 추가한다. 흐름: 버튼 클릭 → `regenerateAfterConfirm` 호출 → 폴링으로 새 proposal 도착 감지 → 새 후보를 **편집 draft에 채움**(자동 저장 아님) → 사용자가 검토·수정 → 기존 저장 버튼(editTitle/editThumbnails).

### page.tsx 배선
- 제목(title_thumb)·썸네일(thumbnail) 각 stage의 **최신 proposalId**를 조회해 두 컴포넌트에 prop으로 전달한다(폴링 완료 감지용 — RegenerateButton과 동일 원리). 이미 proposal을 읽고 있으면 그 id를 넘기면 된다.

### PostConfirmTitleEdit
- 수정 패널에 'AI로 다시 생성' 버튼 + 이유 입력(optional, RegenerateButton의 reason 패턴).
- 클릭 → `regenerateAfterConfirm(runId, "titles", reason)` → 폴링 시작(`proposalId` 변경 감지·`POLL_LIMIT_MS` 안전망·생성 중 `LiveRefresh`/스피너).
- 새 proposal 도착 시 그 후보로 **title input(draft)을 채운다**(예: candidate[0]의 title). 사용자가 검토 후 기존 '저장'(editTitle)로 확정.

### PostConfirmThumbnailsEdit
- 수정 패널에 'AI로 다시 생성' 버튼 + 이유 입력(optional).
- 클릭 → `regenerateAfterConfirm(runId, "thumbnail", reason)` → 폴링.
- 새 proposal 도착 시 A/B/C 후보로 **3카드 draft(main2·box2)를 채운다**. 사용자 검토 후 기존 '저장'(editThumbnails)로 확정.

공통:
- 생성 중 busy/disabled·스피너·에러 표시(RegenerateButton·ThumbnailStudio 패턴).
- TRUS 3색·focus-visible 노란 아웃라인·sr-only 라벨(기존 패널과 일관).
- 교정 학습 패널의 transition/state와 섞지 마라(독립).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 완료 감지를 **proposalId 변경**으로 하는가(고정 cutoff을 완료 판정으로 쓰지 마라 — opus 185s).
   - 재생성 결과를 **자동 저장하지 않고** draft에만 채우는가(사용자 검토 후 기존 저장 버튼).
   - step 0의 `regenerateAfterConfirm`만 부르고, 상태를 되돌리는 UI(un-confirm)나 다운스트림 트리거가 없는가.
   - TRUS 3색·접근성(focus-visible·sr-only) 일관.
3. `phases/post-confirm-regenerate/index.json`의 step 1 갱신.

## 금지사항

- 고정 시간 cutoff을 '완료 판정'으로 쓰지 마라. 이유: opus 단계 생성은 3분+(실측 185s) 걸려 짧은 cutoff이면 새 후보 도착 전에 폴링이 끊긴다. 완료는 proposalId 변경으로 감지한다(RegenerateButton 주석 참조).
- 재생성 결과를 자동 저장하지 마라. 이유: 사용자가 검토·수정 후 저장하는 게 이 기능의 설계(손편집 패널 위에 얹는다).
- un-confirm(상태 역전이) UI나 다운스트림(구성·대본) 재생성 트리거를 만들지 마라.
- 새 서버 액션/저장 경로를 만들지 마라(재생성=step0 액션, 저장=기존 editTitle/editThumbnails).
- 기존 테스트를 깨뜨리지 마라.
