# Step 0: outline-format-field

스크립트 품질 로드맵 **P2(`outline-format`)의 구다리(structurer) 레이어**. 구다리가 각 목차 섹션에 "이 섹션은 어떤 형식이어야 하는가"(`format`)를 지정하도록 outline 스키마를 확장한다. 이 신호를 step 1에서 짠펜이 받아 실제 형식 블록(table/case)을 emit하고, P1이 깐 레일(`script_segments.kind`/`payload` → 렌더)에 첫 실데이터가 흐른다.

## 배경 (P1에서 이어짐)

- P1(`script-format-model`)이 이미 완료됐다: `script_segments`에 `kind`/`payload` 컬럼(마이그29·적용됨), 순수 `normalizeSegmentPayload`(깨진 payload→prose 폴백), `SegmentList`의 kind별 렌더(table/case/visual), scribe `ScriptSegmentOut`의 optional `kind?`/`payload?`. **즉 레일은 이미 완성** — P2는 구다리·짠펜이 그 레일에 데이터를 흘려보내게만 하면 된다.
- 이 step은 **구다리(structurer) 한 레이어만** 다룬다. 짠펜은 step 1, UI는 step 2.

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·크루 정의(구다리=구성).
- `src/agents/structurer/schema.ts` — `OutlineSection`/`StructureCandidateOut`/`StructurerOutput` 타입 + `STRUCTURER_SCHEMA`(JSON Schema) + `STRUCTURER_SYSTEM`. **이 step의 주 변경 대상.**
- `src/agents/structurer/prepare.ts` — 구다리 prep(입력 빌드). **outline은 출력이라 prepare는 변경 불필요** — 읽어서 확인만.
- `tests/structurerPrepareWiring.test.ts` — `STRUCTURER_SYSTEM` 상수를 import해 주입을 검사한다(하드코딩 문자열 비교 아님). 따라서 SYSTEM 내용을 추가해도 이 테스트는 그린이어야 한다 — 깨지면 잘못 건드린 것.
- `tests/eval.test.ts` — 골든셋 품질 eval. **fixture 파일을 읽어** invariant만 검사하며(form-agnostic, `withArray`로 이형 skip) promptHash replay가 아니다. 즉 스키마/SYSTEM 변경으로 깨지지 않는다(확인용).
- `src/llm/promptHash.ts`(개념만) — promptHash는 system+input+schema+model+maxTokens로 계산. 스키마/SYSTEM이 바뀌면 hash가 바뀐다(아래 "fixture" 주의 참조).

## 작업

### 1) `OutlineSection`에 optional `format`

```ts
export type SectionFormat = "table" | "case" | "explain";

export interface OutlineSection {
  section: string;
  goal: string;
  why: string;
  format?: SectionFormat;  // P2: 이 섹션의 권장 형식(없으면 explain=prose, 하위호환)
}
```

`SectionFormat`을 export한다(step 1·2에서 재사용).

### 2) `STRUCTURER_SCHEMA` 확장 (하위호환 필수)

outline items의 `properties`에 `format`을 **optional**(required에 넣지 않음)으로 추가:

```ts
format: { type: "string", enum: ["table", "case", "explain"] }
```

- `required`는 기존 `["section","goal","why"]` **그대로**(format 미포함) — 이유: 기존 후보/픽스처가 format 없이도 유효해야 한다(하위호환).
- outline item의 `additionalProperties: false`는 유지(format이 이제 알려진 prop이므로 문제없음).

### 3) `STRUCTURER_SYSTEM`에 형식 지정 지침 추가

기존 문장은 보존하고, 형식 지정 규칙을 덧붙인다. 핵심 의도(반드시 반영):

- 각 섹션에 어울리는 형식을 `format`으로 지정한다:
  - **`table`** — 2개 이상 대상을 **나란히 비교**하는 섹션(예: 상품 A vs B, 조건별 차이). 비교 축이 분명할 때만.
  - **`case`** — 시청자 **상황에 따라 답이 갈리는** 섹션(예: "이런 분은 A, 저런 분은 B"). 분기 조건이 분명할 때만.
  - **`explain`**(기본) — 개념 설명·서사·도입 등 그 외 전부. **확신이 없으면 explain.**
- **억지 금지**: 비교/분기가 실제로 없는 섹션을 표·케이스로 만들지 마라. 형식은 내용에서 자연히 나올 때만 — 형식을 위한 형식은 김짠부답지 않다.
- 형식 미지정(생략)은 explain과 동일하게 취급된다.

### 4) 테스트 `tests/structureFormat.test.ts`

`STRUCTURER_SCHEMA`에 대한 검증(스키마 검증 유틸은 기존 테스트에서 쓰는 것을 따른다 — 예: `src/llm/schema.ts`의 검증 함수):

- format 있는 outline(table/case/explain) → 통과.
- **format 없는 outline → 통과**(하위호환 — 핵심 케이스).
- 잘못된 format 값(예 `"chart"`) → 거부.
- (선택) `OutlineSection`/`SectionFormat` 타입이 export되는지 import로 확인.

## fixture 주의 (반드시 이해)

`STRUCTURER_SCHEMA`/`STRUCTURER_SYSTEM` 변경 → structurer promptHash 변경 → 기존 structurer fixture는 다음 **라이브/dev 런에서 자동 재기록**된다(claude-p 백엔드, **$0**). 이것은 **런타임 동작**이며, **AC(`npm test`)와 무관**하다:

- `eval.test.ts`는 디스크의 fixture 파일을 읽어 invariant만 본다(기존 파일 그대로 남음·form-agnostic) → 통과 유지.
- promptHash 기반 replay 테스트는 fake driver/모킹을 쓰므로(`parity.test.ts`·`callLlmRecord.test.ts`) 실 agent 스키마 변경에 영향받지 않는다.

→ **이 step에서 fixture를 손으로 재기록하지 마라.** 다음 라이브 런이 자동 처리한다.

## Acceptance Criteria

```bash
npm run typecheck   # 타입 에러 0
npm test            # 전체 통과(기존 725 + structureFormat 신규). eval·wiring 회귀 없음
npm run build       # 컴파일 에러 0
```

## 검증 절차

1. AC 실행(빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - `STRUCTURER_SCHEMA`의 `required`에 `format`이 **들어가지 않았는가**(하위호환)?
   - `structurerPrepareWiring.test.ts`·`eval.test.ts`가 그린인가(SYSTEM 상수 참조·fixture 파일 읽기라 그린이어야 정상)?
   - `prepare.ts`를 불필요하게 건드리지 않았는가(outline은 출력)?
3. `phases/outline-format/index.json`의 step 0 갱신(completed+summary / error / blocked).

## 금지사항

- `STRUCTURER_SCHEMA`의 `required` 배열에 `format`을 넣지 마라. 이유: 기존 후보·픽스처가 format 없이 무효화돼 하위호환 깨짐.
- fixture를 손으로 재기록하거나 삭제하지 마라. 이유: 다음 라이브 런이 자동·$0로 처리. 손대면 stray·오염 위험(rules.md).
- 짠펜(scribe)·scriptCell·UI를 건드리지 마라. 이유: 각각 step 1·step 2의 범위. 이 step은 구다리 한 레이어.
- 형식을 강제(required)하거나 "모든 섹션에 형식 지정" 같은 지침을 넣지 마라. 이유: 억지 표/케이스 유발 — 형식은 내용에서 나올 때만.
- 명세에 없는 신규 파일(docs·다이어그램·빌드 산출물)을 커밋에 섞지 마라. `git status`로 확인하고 범위 외는 제외(하네스 `git add -A`가 떠돌이를 쓸어담는 알려진 함정).
- 기존 테스트를 깨뜨리지 마라.
