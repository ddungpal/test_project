# Step 1: scribe-emit-blocks

P2의 **짠펜(scribe) 레이어**. 짠펜이 구다리 outline의 `format`(step 0 추가)을 받아, 해당 섹션을 **형식 블록**(`kind='table'`/`'case'` + `payload`)으로 emit하도록 출력 스키마와 SYSTEM을 확장한다. 적재·렌더는 P1 레일이 이미 처리하므로 **scriptCell·UI는 건드리지 않는다**.

## 배경

- step 0에서 구다리 outline 각 섹션에 `format?: "table"|"case"|"explain"`이 생겼다(`src/agents/structurer/schema.ts`의 `SectionFormat`). 이 outline은 `getSelectedStagePayload(supa, runId, "structure")`로 짠펜 셀(`scriptCell.ts`)에 `outline`으로 전달되고, `scribeStep`이 `input.outline`으로 받는다 → **format 신호는 이미 짠펜 입력에 흐르고 있다**. 남은 건 짠펜이 그걸 보고 블록을 emit하는 것뿐.
- P1에서 `ScriptSegmentOut`에 optional `kind?`/`payload?`가 이미 있고, `scriptCell.ts`가 `normalizeSegmentPayload(s.kind, s.payload)`로 정규화 적재한다 → **scribe가 블록을 emit하면 적재·렌더가 자동으로 동작**한다(P1 옵션 A의 보상).

## 읽어야 할 파일

- `src/agents/scribe/schema.ts` — `ScriptSegmentOut`(P1에서 `kind?`/`payload?` 있음) + `SCRIBE_SCHEMA`(**이 step의 주 변경 대상**) + `SCRIBE_SYSTEM`(주 변경 대상).
- `src/agents/scribe/step.ts` — `scribeStep`(callLLM 1회, `input.outline`에 format 포함).
- `src/pipeline/scriptCell.ts` — 짠펜 셀. **120행 부근 segRows가 `normalizeSegmentPayload`를 이미 통과**(P1). **변경 금지** — 읽어서 레일이 이미 있음을 확인만.
- `src/pipeline/segmentBlock.ts` — `normalizeSegmentPayload`·`SegmentKind`·`TablePayload`/`CasePayload`/`VisualPayload` 타입(P1). 짠펜 payload는 이 형태에 맞춰야 normalize를 통과한다.
- step 0 산출물: `src/agents/structurer/schema.ts`의 `SectionFormat`.
- `src/llm/schema.ts` — 스키마 검증 함수(테스트에서 사용).

## 작업

### 1) `SCRIBE_SCHEMA`의 segment item에 optional `kind`/`payload`

segments items의 `properties`에 추가(둘 다 **optional** — `required`엔 넣지 않음, 하위호환):

```ts
kind: { type: "string", enum: ["prose", "table", "case", "visual"] },
payload: { type: "object" },   // loose: payload 내부는 additionalProperties 허용(블록별 형태 다양·stray 내성)
```

- segment item의 `required`는 기존 `["ord","text","used_fact_idxs","used_asset_idxs"]` **그대로**(kind/payload 미포함).
- **payload 객체는 `additionalProperties`를 막지 마라**(loose). 이유: table/case/visual payload 형태가 제각각이고, claude-p가 여분 필드를 붙이는 알려진 함정(`style-extract-fold-stray` 클래스)에서 **결정적 검증 실패를 피하기 위함**. 실제 형태 검증·정제는 런타임의 `normalizeSegmentPayload`(P1)가 담당한다(깨지면 prose 폴백).
- segment item 레벨의 `additionalProperties: false`는 유지(kind/payload가 이제 알려진 prop).

### 2) `SCRIBE_SYSTEM`에 형식 emit 지침 추가

기존 문장 보존하고 덧붙인다. 핵심 의도(반드시 반영):

- outline의 각 섹션에 `format`이 있으면 그 형식으로 해당 부분을 emit한다:
  - **`format: "table"`** — 그 비교 내용을 `kind: "table"` segment로. `payload = { columns: string[], rows: string[][], caption?: string }`. columns=비교 축(헤더), rows=각 대상의 값. **표 안의 수치/사실은 facts·assets 근거에 충실**하게(없으면 표를 만들지 말고 prose로). 표 앞뒤 설명은 별도 prose segment로 둬도 된다.
  - **`format: "case"`** — `kind: "case"` segment로. `payload = { intro?: string, branches: { condition: string, outcome: string }[] }`. 각 branch=상황→권장.
  - **`format: "explain"` 또는 없음** — 기존처럼 `kind: "prose"`(또는 kind 생략) prose segment.
- **money-safety(불변)**: 미검증 fact(caution 라벨)는 표/케이스에서도 단정하지 마라. 검증 안 된 수치를 표 칸에 박지 마라 — 그런 칸은 비우거나 "확인 필요"로 두거나 prose로 설명한다.
- **억지 금지**: format이 table이어도 비교 데이터가 부족하면 prose로 풀어라. 빈 표/억지 분기보다 정확한 설명이 낫다.
- prose segment는 기존 출력과 동일하게(말투·쉬운 설명·lineage 링크 규칙 전부 유지). kind/payload는 **형식 섹션에서만** 채운다.

### 3) (타입) `ScriptSegmentOut`

P1에서 `kind?: string`/`payload?: unknown`이 이미 있다. 필요하면 `kind?: SegmentKind`로 좁혀도 되나 **필수는 아니다**(런타임 normalize가 방어). 무리한 타입 변경은 피하라.

### 4) 테스트 `tests/scribeBlocks.test.ts`

- `SCRIBE_SCHEMA`가 **블록 segment를 허용**: `kind: "table"` + payload 있는 segment 통과, `kind: "case"` 통과.
- `SCRIBE_SCHEMA`가 **기존 prose segment(kind/payload 없음)도 통과**(하위호환 — 핵심).
- (연결) 블록 형태의 scribe 출력 segment를 `normalizeSegmentPayload`에 통과시키면 기대한 kind/payload가 나오고, 깨진 payload는 prose로 떨어진다(P1 함수 재사용 — end-to-end 흐름 1건 못박기).

## fixture 주의 (step 0과 동일)

`SCRIBE_SCHEMA`/`SCRIBE_SYSTEM` 변경 → scribe promptHash 변경 → 기존 scribe fixture는 다음 **라이브/dev 런에서 자동 재기록**(claude-p $0). **AC와 무관**(`eval.test.ts`는 fixture 파일 읽기·form-agnostic). **이 step에서 fixture를 손으로 재기록·삭제하지 마라.**

## Acceptance Criteria

```bash
npm run typecheck   # 타입 에러 0
npm test            # 전체 통과(기존 + scribeBlocks 신규). eval 회귀 없음
npm run build       # 컴파일 에러 0
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - `SCRIBE_SCHEMA`의 segment `required`에 kind/payload가 **안 들어갔는가**(하위호환)? payload가 loose(내부 additionalProperties 허용)인가?
   - `scriptCell.ts` diff가 **0줄**인가(P1 normalize 레일 재사용 — 건드리면 안 됨)?
   - money-safety 지침(미검증 fact 표에 단정 금지)이 SYSTEM에 명시됐는가?
3. `phases/outline-format/index.json`의 step 1 갱신(completed+summary / error / blocked).

## 금지사항

- `scriptCell.ts`를 수정하지 마라. 이유: P1의 `normalizeSegmentPayload` 적재 레일이 이미 블록을 처리한다. 건드리면 검증·lineage·money 게이트 회귀 위험.
- `SCRIBE_SCHEMA` segment `required`에 kind/payload를 넣지 마라. 이유: 기존 prose 출력·픽스처가 무효화돼 하위호환 깨짐.
- payload 객체에 `additionalProperties: false`를 걸지 마라. 이유: claude-p stray 필드로 결정적 검증 실패(style-extract-fold-stray 클래스) — 형태 정제는 런타임 normalize 담당.
- 미검증 fact의 수치를 표/케이스 칸에 단정으로 넣는 지침을 만들지 마라. 이유: money-safety 위반(잘못된 금융 정보 박제).
- fixture를 손으로 재기록·삭제하지 마라(다음 라이브 런 자동·$0).
- UI(SegmentList 등)를 건드리지 마라. 이유: step 2 범위(+P1에서 이미 렌더 완성).
- 범위 외 신규 파일을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
