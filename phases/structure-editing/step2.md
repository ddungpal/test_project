# Step 2: selector-integration (선택 화면에 OutlineEditor 통합)

구성 편집 강화 phase의 3단계. 선택 중(확정 전) 구성 편집을 step 1의 `OutlineEditor`로 교체해,
선택 화면에서도 섹션 추가/삭제/드래그 정렬이 되게 한다. **UI 교체만**(백엔드·저장 로직 무변경).
설계 전문: `docs/specs/2026-07-01-structure-editing-design.md`(§C). Esther 투입.

## 읽어야 할 파일

- `docs/specs/2026-07-01-structure-editing-design.md` — §C.
- `src/components/ProposalSelector.tsx` — structure 분기(§ line 205~245: `p.outline` 인라인 렌더 +
  `setSection`). `draft`/`setDraft` 상태, `approach` 인풋, 선택/확정 버튼 흐름은 **유지**.
- `src/components/OutlineEditor.tsx` — step 1 산출. Props `{ outline, onChange }`.
- step 0·1 산출물 요약(index.json summary): `OutlineEditor` 시그니처.

## 작업

### `ProposalSelector.tsx` structure 분기 — 인라인 섹션 렌더를 `OutlineEditor`로 교체

- 현재 `outline.map(...)`로 각 섹션을 직접 그리고 `setSection(i, patch)`로 필드만 수정하는 블록을
  **삭제**하고, 그 자리에:
  ```tsx
  <OutlineEditor
    outline={Array.isArray(p.outline) ? p.outline : []}
    onChange={(next) => setDraft({ ...p, outline: next })}
  />
  ```
  로 교체.
- `approach` 인풋(구성 컨셉)은 **그대로 유지**(OutlineEditor는 섹션만 다룸).
- 이제 안 쓰이는 `setSection` 로컬 헬퍼는 제거. **단, `StructureSection`·`SectionFormat`·
  `SECTION_FORMATS`·`SECTION_FORMAT_LABEL` 등이 다른 분기(있다면)에서도 쓰이는지 확인** 후, 죽은
  import만 정리한다(다른 곳에서 쓰면 남긴다). 죽은 import 사각지대 주의(noUnusedLocals 부재).
- draft·선택 확정(`selectStructure`)·기존 선택 흐름은 무변경. `setDraft({...p, outline: next})`로
  editor 변경이 draft에 반영되어 기존 저장 경로를 그대로 탄다.

## 테스트

- 이 step은 UI 배선 교체라 새 로직이 거의 없다. 기존 테스트 회귀 0이 핵심.
- (선택) ProposalSelector가 structure에서 OutlineEditor를 렌더하는지 얕은 스모크(과하면 생략 — 로직은
  step 1 ops·step 3 통합에서 검증). 무리한 jsdom 드래그 시뮬 금지.

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과(회귀 0)
npm run build       # next build, 에러 0
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - structure 선택 분기가 `OutlineEditor`를 쓰고, 변경이 `setDraft`로 draft에 반영되는가?
   - `approach` 인풋·선택 확정 흐름은 무변경인가?
   - 죽은 `setSection`·죽은 import가 남지 않았는가(다른 분기 사용 여부 확인 후 정리)?
   - 다른 stage(topic·title·thumbnail) 분기는 안 건드렸는가?
3. 결과 반영(step 2): 성공 → `completed`+`summary`(선택 화면 통합 완료 → 남은 건 확정 후 UI) /
   3회 실패 → `error` / 사람 개입 → `blocked`.

## 금지사항

- 백엔드·저장 로직(`selectStructure`·draft 저장 경로)을 바꾸지 마라. 이유: 이 step은 렌더 위젯 교체만.
- topic/title/thumbnail 분기를 건드리지 마라. 이유: 범위 밖(structure만).
- `approach` 인풋을 제거하지 마라. 이유: OutlineEditor는 섹션만 — approach는 별도 필드.
- 죽은 import를 남기지 마라(특히 `type` import). 단, 다른 분기가 쓰는 심볼은 지우지 마라.
- 기존 테스트를 깨뜨리지 마라.
