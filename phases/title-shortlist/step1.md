# Step 1: shortlist-select

제목 선택 화면(`ProposalSelector`)의 **title_thumb 분기에만** "후보로 같이 저장" 체크박스를 추가한다. 대표 지정(라디오) 흐름은 그대로 두고, 확정 시 추가 후보를 `alternates`로 실어 보낸다.

## 읽어야 할 파일

- `/docs/specs/2026-07-06-title-shortlist-design.md` — 전체 설계(§1 선택 화면).
- `/ARCHITECTURE.md`, `/CLAUDE.md`, `/.claude/rules/rules.md`.
- **step 0 산출물**: `src/lib/title/alternates.ts`(`mergeAlternates` 사용) · `src/lib/dashboard/proposalTypes.ts`(`TitlePayload.alternates`).
- `src/components/ProposalSelector.tsx` — 이번에 수정할 컴포넌트. 현재 `title_thumb` 분기의 후보 렌더·`chosenIdx` 라디오·`submit()`(editedPayload 구성)을 꼼꼼히 읽어라.
- `src/app/actions/topicRun.ts`의 `selectTitles`(라인 ~147) — 시그니처 변경 금지. 기존 `SelectInput`(`editedPayload?: unknown`)에 얹는다.
- 디자인 톤: `design/design-system/trus-create/` 또는 컴포넌트 내 기존 Tailwind 클래스(`trus-white/`, `trus-yellow`)를 그대로 따르라(신규 색·그림자·그라데이션 금지).

## 작업

`src/components/ProposalSelector.tsx`, `stage === "title_thumb"`일 때만:

1. **추가 후보 체크 상태**: 대표(`chosenIdx`)가 아닌 후보 카드에 작은 체크박스 "후보로 같이 저장"을 표시. 선택 집합을 컴포넌트 state(예: `Set<number>` 또는 `number[]`)로 관리.
   - 대표로 지정한 카드에는 체크박스를 표시하지 않는다(대표는 자동 포함).
   - 추가 후보 상한 2개(대표 포함 총 3개). 상한 도달 시 나머지 미체크 항목의 체크박스를 비활성화하거나 무시.
   - 대표(`chosenIdx`)를 바꾸면 새 대표가 추가후보 집합에 있었다면 거기서 제거한다(대표=추가후보 중복 방지).
2. **submit 시**: 체크된 후보들의 `payload.title`을 모아
   `mergeAlternates(effectivePrimaryPayload, [체크된 title들])` 로 `editedPayload`를 만든다.
   - `effectivePrimaryPayload`는 기존 로직대로 손편집(editing)이 있으면 그 draft, 없으면 대표 후보의 payload.
   - 기존에 `edited` 여부로 `editedPayload`를 넣던 조건을 확장: **추가 후보가 하나라도 있으면 editedPayload(=merge 결과)를 보낸다.** 추가 후보 0개 + 손편집 없음이면 기존과 동일하게 editedPayload 미포함(불변식).
3. UI 카피는 간결·직설(TRUS 톤). 체크박스 라벨 예: "후보로 같이 저장".

`title_thumb` 외(topic/structure) 분기의 렌더·submit 경로는 **변경 없이 그대로**.

## Acceptance Criteria

```bash
npm run typecheck && npm run test && npm run build
```

전부 exit 0.

## 검증 절차

1. 위 AC 실행.
2. 아키텍처 체크리스트:
   - `selectTitles`/`SelectInput`/gate 시그니처를 바꾸지 않았는가?
   - topic/structure 분기 동작이 그대로인가?
   - 추가 후보 0개일 때 `editedPayload`가 기존과 동일하게 처리되는가(불변식)?
   - 신규 색/그림자/그라데이션 없이 기존 Tailwind 토큰만 썼는가?
3. `phases/title-shortlist/index.json`의 step 1 업데이트(completed+summary / error / blocked).

## 금지사항

- `selectTitles`·`SelectInput`·`gate.ts`·서버 액션의 시그니처를 바꾸지 마라. 이유: 백엔드 무변경이 이 설계의 핵심(마이그·게이트 0). editedPayload(jsonb)에 얹기만 한다.
- topic/structure 분기를 건드리지 마라. 이유: 타 단계 회귀 방지.
- 추가 후보 0개인데 `editedPayload`나 `alternates`를 억지로 넣지 마라. 이유: 불변식(바이트 동일 → 학습 신호·fixture 오염 방지). step0 `mergeAlternates`가 이미 0개면 alternates를 안 넣으니 그 결과를 신뢰하라.
- `PostConfirmTitleEdit.tsx`(확정 후 스왑)는 이 step에서 건드리지 마라. 이유: step 2 담당.
- 기존 테스트를 깨뜨리지 마라.
