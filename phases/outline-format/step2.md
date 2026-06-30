# Step 2: outline-format-ui (Esther)

P2의 **UI 레이어**(순수 프론트엔드). 구다리 구성(outline) 화면에서 각 섹션의 `format`(표/분기/설명)을 **보이게** 하고, 김짠부가 확정 전 형식을 **고를 수 있게**(선택만) 한다. 짠펜 블록 자체의 렌더(표/케이스/시각)는 P1 step2에서 이미 완성됐으므로 추가 작업이 없다 — 이 step은 **구성 단계 화면**만 다룬다.

## 배경

- step 0: 구다리 outline 섹션에 `format?: "table"|"case"|"explain"`(`SectionFormat`) 추가.
- step 1: 짠펜이 그 format으로 블록 emit.
- 프로젝트 핵심 원칙: **"김짠부는 매 단계 '선택'만"** — 따라서 구다리가 제안한 format을 화면에서 보고, 필요하면 바꾸는(선택) 것이 자연스럽다.
- 구성(structure) 후보는 **편집 가능한 제네릭 selector**(`ProposalSelector`)로 렌더된다 — 이미 section/goal/why를 인라인 편집한다. format은 여기에 얹는다.

## 읽어야 할 파일

- `src/components/ProposalSelector.tsx` — 구성 후보 편집 UI. **outline 렌더는 ~204행부터**: `const outline = Array.isArray(p.outline) ? p.outline : []`, `setSection(i, patch)`로 섹션 필드를 패치(`{ ...s, ...patch }`)해 `draft.outline`을 갱신, ~217행 `outline.map(...)`이 각 섹션의 section/goal/why `<input>`을 렌더. **이 패턴을 그대로 따라 format을 추가**한다.
- step 0 산출물: `src/agents/structurer/schema.ts`의 `SectionFormat`·`OutlineSection`.
- `src/components/SegmentList.tsx` — P1 step2의 kind 렌더(table/case/visual). **변경 불필요** — 짠펜 블록은 여기서 이미 렌더된다(확인용).
- `CLAUDE.md`의 TRUS Create 디자인: Black `#121212`/Yellow `#F8F082`/White **3색만**, 그라데이션·그림자 금지, 강렬·직설. 토큰 `trus-white`/`trus-yellow`/`trus-black`.

## 작업

### 1) `ProposalSelector` outline 섹션에 format 선택 추가

각 섹션 편집 행(section/goal/why 옆)에 format 컨트롤을 추가한다:

- **편집 가능 모드**(구성 후보 선택/수정 중): 작은 `<select>` 또는 3버튼 토글로 `format`을 고른다 — 옵션 라벨 한글: **표**(`table`) · **분기**(`case`) · **설명**(`explain`). 선택 시 기존 `setSection(i, { format: 값 })` 패턴으로 `draft.outline`을 갱신(다른 필드와 동일 메커니즘).
- `format`이 없는(레거시) 섹션은 **설명(explain)으로 표시**(기본). 이유: step 0 하위호환 — 미지정=explain.
- 선택값은 제출 시 기존 경로로 `edited_payload`에 담겨 그대로 저장된다(ProposalSelector가 draft 전체를 저장하므로 **별도 백엔드/액션 변경 불필요**) — 동작하는지 확인만.

### 2) 형식 배지(가독성)

각 섹션에 현재 format을 한눈에 보이는 작은 배지로 표시(표/분기/설명). 선택 컨트롤과 중복이면 컨트롤 자체가 현재값을 보여주는 것으로 갈음 가능 — **과설계 금지**(배지 + 셀렉트를 둘 다 무겁게 만들지 말 것).

### 3) 디자인

- **TRUS 3색만**. format별 색 구분이 필요하면 trus-yellow 강조/비강조 정도로(임의 색 금지). 그라데이션·그림자·이모지 금지(직설).
- 기존 section/goal/why 편집 UX·레이아웃을 깨지 마라(회귀 0).

## 금지/범위

- 백엔드(structurer 셀·스키마·액션·`getSelectedStagePayload`)를 건드리지 마라. 이유: 순수 프론트엔드 step. format 저장은 기존 `edited_payload` 경로 재사용.
- `SegmentList.tsx`(짠펜 블록 렌더)를 건드리지 마라. 이유: P1 step2에서 이미 완성.
- 새 npm 의존성(select 라이브러리 등)을 추가하지 마라. 이유: 네이티브 `<select>`/버튼 + Tailwind로 충분(YAGNI).
- TRUS 3색 외 색·그라데이션·그림자·이모지 금지.

## Acceptance Criteria

```bash
npm run typecheck   # 타입 에러 0
npm test            # 전체 통과
npm run build       # 컴파일 에러 0
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 디자인/아키텍처 체크리스트:
   - TRUS 3색만 썼는가(임의 색·그라데이션·그림자·이모지 0)?
   - 백엔드/`SegmentList` 변경이 **0**인가(순수 프론트엔드)?
   - format 미지정 섹션이 '설명'으로 안전하게 표시되는가(하위호환)?
   - 기존 section/goal/why 편집이 그대로 동작하는가(회귀 0)?
3. `phases/outline-format/index.json`의 step 2 갱신(completed+summary / error / blocked).

## 금지사항

- 위 "금지/범위" 전체 준수.
- 명세에 없는 신규 파일(docs·다이어그램·빌드 산출물)을 커밋에 섞지 마라. `git status`로 확인하고 범위 외는 제외(하네스 `git add -A` 떠돌이 함정).
- 기존 테스트를 깨뜨리지 마라.
