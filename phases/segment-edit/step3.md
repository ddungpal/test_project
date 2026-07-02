# Step 3: segment-regen-ui

파트별 **"재생성(사유 입력)"** 버튼 UI + staleness 경고 배너. step2의 `requestSegmentRegen` 발동.

## 읽어야 할 파일

- `docs/specs/2026-07-02-segment-edit-design.md` — "step3"·"결정"(충돌=경고만).
- `phases/segment-edit/step2.md` + 산출물 — `requestSegmentRegen(runId, segmentId, reason)` 액션·`run/segment.regen.requested` 이벤트.
- `phases/segment-edit/step0.md`·`step1.md` + 산출물 — `isScriptDownstreamStarted`(staleness)·세그먼트 편집 UI(같은 컴포넌트에 재생성 버튼 추가).
- `src/components/SegmentList.tsx`·`ScriptReview.tsx` — 세그먼트 렌더(step1에서 편집 버튼 추가됨).
- `src/components/PostConfirmStructureEdit.tsx` — **staleness 경고 배너 패턴 미러**(`isStructureDownstreamStarted`면 노란 보더 경고·차단 X)·재생성 완료 폴링(startId≠현재면 완료) 패턴.
- `src/components/RequestOnboardingButton.tsx` / `RequestStageButton.tsx` — 발행+폴링(LiveRefresh) 패턴.

## 작업

- 각 세그먼트(프로즈·블록 모두)에 **"재생성" 버튼** → 사유 textarea → `requestSegmentRegen(runId, segment.id, reason)` 발행 → 폴링("짠펜이 이 파트 다시 쓰는 중… 잠시 후 새로고침"·해당 세그먼트 갱신 감지). script_review+approved.
- **staleness 경고 배너**: `isScriptDownstreamStarted(runState)`면(approved/published) 세그먼트 편집/재생성 영역 상단에 노란 보더 경고 — "개별 수정·재생성분은 이후 대본 전체 재작성(사실 반려 등) 시 사라집니다." **차단·자동재실행 없음, 경고만**(구성편집 staleness 미러).
- 프로즈는 "수정"(step1) + "재생성" 둘 다, 블록은 "재생성"만(직접 수정 미지원). TRUS 3색.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 기존 테스트 전부 통과
npm run build
```

- UI라 단위 테스트 필수 아님. 순수 로직은 `src/lib/**`. 기존 테스트 불변.

## 검증 절차
1. AC 실행.
2. 체크리스트: 재생성 버튼→사유→`requestSegmentRegen`. staleness 배너 경고만(차단 X). 프로즈=수정+재생성·블록=재생성만. script_review+approved. TRUS 3색.
3. `phases/segment-edit/index.json` step 3 갱신(**브라우저 수동검증 필요**·재생성은 라이브 Inngest 명시).

## 금지사항
- **staleness를 차단으로 만들지 마라 — 경고 배너만**(설계: 허용+경고).
- **사유 없이 재생성 발동 가능하게 두지 마라 — 사유 입력 필수(빈 사유 거부 or 기본값 방어).**
- **백엔드(regenerateSegment·이벤트)를 UI에서 중복 구현하지 마라 — step2 액션 호출만.**
- published 상태에서 편집/재생성 노출하지 마라(설계: review+approved).
- 새 색·그라데이션·그림자 금지(TRUS 3색).
- 기존 테스트를 깨뜨리지 마라.
