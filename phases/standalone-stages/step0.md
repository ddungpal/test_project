# Step 0: standalone-deps-core

## 읽어야 할 파일

먼저 아래를 읽고 단계 간 데이터 의존성·payload 모양을 정확히 파악하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `src/domain/enums.ts` — `Stage`, `RUN_STATES`, `ALLOWED_TRANSITIONS`(전이표 — 인접 순서 확인)
- `src/pipeline/stages.ts` — `PIPELINE`, `STAGE_DESCRIPTORS`(각 단계 `enters`/`fromState`/`proposedState`/`selectedState`)
- `src/pipeline/context.ts` — `getSelectedStagePayload`(소비자가 selection을 어떤 모양으로 읽는지)
- `src/pipeline/researchCell.ts:64-68` — 셜록이 topic/structure/title를 읽는 부분(`as { title?: string }` 등 실제 소비 shape)
- `src/agents/structurer/prepare.ts` + `src/agents/structurer/schema.ts` — 구다리 출력(structure) payload 모양. 셜록·짠펜이 이 structure payload를 그대로 소비한다
- `src/agents/hook_maker/prepare.ts`, `src/agents/thumbnail_maker/prepare.ts` — 제목/썸네일이 topic·title selection을 읽는 모양

## 목표

단독 실행이 "각 목표 단계가 진짜로 필요로 하는 시드 입력"만 알도록, **순수(DB 없음) 의존성 맵 + selection payload shaping 헬퍼**를 만든다. 이후 step의 단일 출처가 된다.

## 작업

`src/pipeline/standalone/deps.ts` 신규(순수 모듈, import는 타입·enums만):

- 단독 실행 가능 타깃 = `topic | title_thumb | thumbnail | structure | research | script`.
- 시드 종류 타입: `type SeedKind = "selection" | "research_facts" | "explanation_assets"`.
- 시드 스펙: 어떤 입력을 요구하는지 선언적으로. 예:
  ```ts
  export interface SeedSpec {
    kind: SeedKind;
    stage?: Stage;       // kind==="selection"일 때: 어느 단계의 selection을 시드할지(topic/title_thumb/structure)
    field: string;       // UI 입력 식별자(예: "topic", "title", "structure", "facts", "assets")
    label: string;       // 한글 라벨(예: "주제", "구성", "검증된 사실")
    required: boolean;
  }
  export interface StandaloneTarget {
    target: Stage;
    enters: RunState;    // 시드가 walk로 도달해야 하는 상태(PIPELINE[target] 기준)
    seeds: SeedSpec[];
  }
  export const STANDALONE_DEPS: Record<Stage, StandaloneTarget>;
  ```
- 맵 내용(데이터 진실 반영 — 안 쓰는 입력은 넣지 마라):
  - `topic`: seeds=[]
  - `title_thumb`: [주제(required)]
  - `thumbnail`: [주제(required), 제목(required)]
  - `structure`: [주제(required), 제목(optional)]  ← 썸네일 안 넣음
  - `research`: [주제(required), 구성(required), 제목(optional)]  ← 썸네일 안 넣음
  - `script`: [구성(required), 검증된 사실 facts(kind="research_facts", required), 예시자산 assets(kind="explanation_assets", optional)]
- selection payload shaping 순수 헬퍼(이 step에서 구현하는 건 selection 종류만):
  - `topicSelectionPayload(text: string): unknown` → 소비자(`researchCell`)가 읽는 `{ title }` 모양.
  - `titleSelectionPayload(text: string): unknown` → 동일하게 `{ title }` 모양.
  - `structureSelectionPayload(text: string): unknown` → 셜록·짠펜이 소비하는 structure payload **최소 유효 모양**으로 변환(structurer/schema.ts·researchCell의 scopeStep 입력을 보고 결정; 자유텍스트를 그 모양에 담는다). 모양이 안 맞으면 다운스트림이 깨지므로 실제 소비 코드 기준으로 맞춰라.
- `research_facts`/`explanation_assets` 종류의 **행(row) 빌더는 이 step에서 구현하지 마라** — money-safety(DB CHECK·human_approved) 결정이 얽혀 step3 몫. 여기선 `SeedKind`로 분류만 한다.

## Acceptance Criteria

```bash
npm run typecheck
npm test
```

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - `STANDALONE_DEPS`가 위 표와 정확히 일치(특히 structure·research에 썸네일이 **없다**).
   - `structureSelectionPayload`가 실제 소비 코드(researchCell/scriptCell가 읽는 structure 모양)와 합치(추측 금지).
   - 순수 — DB/Supabase/콜LLM import 없음. 테스트가 헬퍼·맵을 직접 검증.
3. `phases/standalone-stages/index.json`의 step 0 갱신(status=completed, summary 한 줄). index.json 유효 JSON.

## 금지사항

- DB 조회·Supabase·callLLM을 import하지 마라. 이유: 이 모듈은 순수 단일 출처(테스트·UI·seeder가 공유). 부수효과가 들어가면 UI(step4)에서 못 쓴다.
- research_facts/explanation_assets 행 빌더를 만들지 마라. 이유: human_approved·DB CHECK 결정이 step3에 격리돼야 money-safety 검수를 집중할 수 있다.
- 기존 파일을 수정하지 마라(이 step은 신규 모듈만). 기존 테스트를 깨뜨리지 마라.
