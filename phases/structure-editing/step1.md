# Step 1: outline-editor (섹션 편집 위젯 — 수정/삭제/추가/드래그 정렬)

구성 편집 강화 phase의 2단계. 섹션(1~9번)을 **개별 수정·삭제·추가·드래그 정렬**하는 재사용 위젯
`OutlineEditor`와 순수 조작 헬퍼를 만든다. 선택 중·확정 후 양쪽(step 2·3)이 이 위젯을 쓴다.
설계 전문: `docs/specs/2026-07-01-structure-editing-design.md`(§B). UI·디자인 step → Esther 투입.

## 읽어야 할 파일

- `docs/specs/2026-07-01-structure-editing-design.md` — §B(OutlineEditor·드래그 안정성), 불변식.
- `src/lib/dashboard/proposalTypes.ts` — `StructureSection`(`{ section, goal, why, format? }`),
  `SectionFormat`, `StructurePayload`.
- `src/components/ProposalSelector.tsx` — 현재 structure 섹션을 인라인으로 그리는 부분(line 205~245).
  인풋 클래스(`inputCls`)·format select(`SECTION_FORMATS`/`SECTION_FORMAT_LABEL`)·필드(section/goal/why)
  렌더 방식을 **이 위젯이 흡수·재현**한다. (step 2가 이 인라인 렌더를 OutlineEditor로 교체.)
- 기존 클라이언트 컴포넌트(`PostConfirmTitleEdit.tsx` 등)의 'use client'·TRUS 3색·안티슬롭 스타일.

## 작업

### 1. 순수 조작 헬퍼 — `src/lib/outline/ops.ts` (신규)

섹션 배열 조작을 순수 함수로(테스트 가능·컴포넌트에서 재사용):
```ts
export function addSection(list: StructureSection[]): StructureSection[]        // 빈 섹션 append
export function removeSection(list: StructureSection[], i: number): StructureSection[]
export function moveSection(list: StructureSection[], from: number, to: number): StructureSection[]
export function patchSection(list: StructureSection[], i: number, patch: Partial<StructureSection>): StructureSection[]
```
- 전부 **입력 배열 비변형**(새 배열 반환). `addSection`의 빈 섹션 =
  `{ section: "", goal: "", why: "", format: "explain" }`. 범위 밖 인덱스는 원본 그대로 반환(방어).

### 2. `OutlineEditor` — `src/components/OutlineEditor.tsx` (신규·'use client')

- **Props**: `{ outline: StructureSection[]; onChange: (next: StructureSection[]) => void }`
  (제어 컴포넌트 — 상태는 부모 소유. 순수하게 outline을 받아 편집 결과를 onChange로 올린다).
- **드래그 안정 id (중요)**: @dnd-kit sortable은 드래그 내내 각 item id가 **안정**이어야 한다.
  인덱스 id는 재정렬 시 깨진다 → 내부 상태를 `Array<{ id: string; section: StructureSection }>`로 들되
  `id`는 **클라이언트 전용 임시 id**(`crypto.randomUUID()`·payload 저장 안 함). @dnd-kit엔 이 안정
  id를 주고, **`onChange`로 올릴 때는 `id`를 벗겨 순수 `StructureSection[]`만** 전달(payload 불변).
  부모 `outline` prop이 외부에서 바뀌면(재생성 로드 등) 내부 id 배열을 재동기화(길이/내용 변화 감지).
- **렌더**: `@dnd-kit/core`의 `DndContext` + `@dnd-kit/sortable`의 `SortableContext`(items=id들)로
  섹션 리스트. 각 행(`useSortable`):
  - **드래그 핸들**(핸들에만 listeners — 인풋 클릭이 드래그로 안 먹히게).
  - 필드: `section`(제목)·`format`(select 설명/표/분기)·`goal`(목표)·`why`(textarea) — 값 변경 시
    `onChange(patchSection(outline, i, patch))`.
  - **✕ 삭제** 버튼 → `onChange(removeSection(outline, i))`.
  - 드래그 종료(`onDragEnd`) → `onChange(moveSection(outline, fromIdx, toIdx))`.
  - 하단 **"+ 섹션 추가"** → `onChange(addSection(outline))`.
- **의존성 추가**(package.json): `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
  `npm install`(또는 pnpm add) 후 lock 파일 커밋. (**주의**: pnpm 빌드스크립트 승인 게이트에 안 걸리는
  순수 JS 패키지들 — sharp류 아님.)
- TRUS 3색만. 그라데이션·그림자·라운딩·이모지 남발 금지. 드래그 핸들 아이콘은 최소(예: ≡ 문자/보더).
  접근성: @dnd-kit 키보드 센서 활성(키보드로도 정렬 가능), 삭제/추가 버튼 aria-label.

## 테스트

- `tests/outlineOps.test.ts`: add(빈 섹션 append·format=explain), remove(경계·원본 비변형),
  move(정상 이동·같은 위치·범위 밖 방어), patch(해당 인덱스만·비변형). 순수 함수라 DOM 불필요.
- (OutlineEditor 컴포넌트 자체는 @dnd-kit DOM 상호작용이라 단위 테스트 과함 — 순수 ops 테스트로 로직을
  잠그고, 렌더/드래그는 step 3 통합·라이브에서 확인. 무리하게 jsdom 드래그 시뮬레이션 만들지 말 것.)

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과
npm run build       # next build, 에러 0 (@dnd-kit 번들 포함)
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - `outline/ops` 4함수가 순수(입력 비변형)이고 테스트로 잠겼는가?
   - `OutlineEditor`가 제어 컴포넌트이고, **드래그 id가 클라이언트 임시 id**(payload 미저장)인가?
   - `onChange`가 순수 `StructureSection[]`(id 없는)만 올리는가?
   - @dnd-kit 3패키지만 추가했는가(다른 새 의존성 없음)? TRUS 3색·접근성(키보드 정렬·aria) 지켰는가?
3. 결과 반영(step 1): 성공 → `completed`+`summary`(`OutlineEditor` props 시그니처·ops 위치를 명시 →
   step 2·3이 소비) / 3회 실패 → `error` / 사람 개입(예: 패키지 설치 실패) → `blocked`.

## 금지사항

- 섹션에 **영구 id를 payload에 저장하지 마라**. 이유: 스키마·payload 불변 유지(다운스트림·픽스처 영향).
  드래그 id는 클라이언트 전용 임시값.
- @dnd-kit 외 새 의존성을 추가하지 마라. 이유: lean 유지(현재 deps 9개). 드래그만 @dnd-kit.
- `OutlineEditor`를 상태 소유(비제어)로 만들지 마라. 이유: 선택 중(draft)·확정 후(로컬) 부모가 payload를
  소유해야 저장·전파가 일관된다.
- 백엔드(gate·action·stage)를 건드리지 마라. 이유: step 0에서 끝났다. 이 step은 위젯만.
- 기존 테스트를 깨뜨리지 마라. `npm run build`가 `MODULE_NOT_FOUND`(`./xxx.js`)로 깨지면 stale `.next`
  의심 — `rm -rf .next` 후 재빌드로 판별.
