# Step 0: title-edit-cleanup

**제목(A안) 확정/수정 화면에서 썸네일 입력 필드 5개를 제거한다.** 제목·썸네일 단계가 분리됐는데 제목 확정 폼에 썸네일 필드(메인문구 1·2, 작은 박스 1·2, 레이아웃 설명)가 남아 있다. 제목 + "선택 이유 한 줄"만 남기고 썸네일은 thumbnail 단계(ThumbnailStudio)에서만 다룬다.

## 배경 (왜 이렇게)
- 화면: "A안 확정"에 [제목] + [메인문구 1][메인문구 2][작은 박스 1][작은 박스 2][레이아웃 설명] + [선택 이유 한 줄] + [이 안으로 확정].
- 읽기 컴포넌트(`CandidateBody`)는 title-thumbnail-split에서 이미 제목 전용으로 정리됨. **하지만 편집 폼(`EditFields`)의 `title_thumb` 분기는 구형 `TitlePayload`(thumbnail_main/boxes/layout)를 그대로 편집하게 둠 — 이게 누락분.**
- `title_thumb` 분기는 **완전 고립**(topic·structure 분기와 분리)이라 다른 단계 회귀 위험 없음.

## 읽어야 할 파일 (먼저 정독)
- `src/components/ProposalSelector.tsx` — `EditFields`(173~254). **`stage === "title_thumb"` 분기(187~230)**: 현재 제목 input + 썸네일 5필드(setMain/setBox/thumbnail_layout textarea). 여기서 **썸네일 5필드만 제거**, 제목 input은 유지. "선택 이유 한 줄"(150~156)·저장(67~84)·`selectionReason`은 **건드리지 마라**.
- `src/lib/dashboard/proposalTypes.ts` — `TitlePayload`(21~29). **타입은 그대로 둔다**(레거시 payload·CandidateBody 방어적 읽기 호환).
- `src/components/CandidateBody.tsx` — title_thumb 읽기(30~66)는 이미 제목 전용(참고만).
- `src/pipeline/gate.ts` — `selectProposal`(23~60). edited_payload 조건부 저장(45~55). 폼이 제목만 보내면 thumbnail 필드는 draft에 안 들어감 → 안전.

## 작업
`ProposalSelector.tsx`의 `EditFields` `title_thumb` 분기(187~230)를 제목 input만 남기게 정리:
```tsx
if (stage === "title_thumb") {
  const p = (draft ?? {}) as Partial<TitlePayload>;
  const set = (patch: Partial<TitlePayload>) => setDraft({ ...p, ...patch });
  return (
    <div className="flex flex-col gap-2">
      <input value={p.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="제목" className={inputCls} />
      {/* 썸네일 필드(메인문구·박스·레이아웃)는 제거 — 썸네일은 thumbnail 단계(ThumbnailStudio)에서. */}
    </div>
  );
}
```
- `setMain`/`setBox` 헬퍼와 thumbnail_main/boxes/layout input·textarea 5개를 삭제. 미사용 import/변수 정리(lint).

## 주의 (구체)
- **"선택 이유 한 줄"(selectionReason) 입력·저장을 제거하지 마라.** 이유: 학습 신호 — 유지 필수(별도 필드).
- **`TitlePayload` 타입을 바꾸지 마라.** 이유: 과거 title_thumb로 만든 레거시 payload에 thumbnail_* 가 있을 수 있고 CandidateBody가 `?.`로 방어적으로 읽는다. 타입 좁히면 회귀.
- **topic·structure 분기를 건드리지 마라.** 이유: 단일 분기 수정 범위.
- 백엔드·게이트·thumbnail_maker는 범위 밖(step1·2).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. 위 AC 실행(Joy가 git diff + AC로 검수).
2. 체크: 제목 폼에 썸네일 필드 부재·제목+선택이유만, 다른 단계 폼 무변경, lint 통과(미사용 변수 없음).
3. `phases/thumbnail-quality-fixes/index.json` step 0 갱신(completed+summary / error / blocked).

## 금지사항
- selectionReason(선택 이유) 제거 금지. 이유: 학습 신호 유지.
- TitlePayload 타입 변경 금지. 이유: 레거시 호환.
- topic/structure 분기 변경 금지. 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
