# Step 1: comparator-agent

P3의 **비교 데이터 생성 레이어**. 새 에이전트 **비교가(`comparator`)** 를 셈이·유이의 형제로 추가해, 구다리가 `format='table'`로 표시한 섹션에 대해 **검증된 사실에 근거한 구조화 비교 데이터**(엔티티×차원×셀)를 생성하고 `explanation_assets(kind='comparison')`에 저장한다.

## 배경

- 리서치 셀(`researchCell.ts`)은 이미: scope(셜록) → fact 검증(병렬) → 리콘실(7무결성가드·삼각검증) → **셈이∥유이(검증된 사실로 예시 생성)** → critic → 저장. 비교가는 **셈이·유이와 같은 자리**(검증 *후* 형제 자산 생성)에 들어간다.
- 트리거: 리서치 셀은 line 87에서 선택된 구성(`structure`)을 이미 로드한다. 그 outline에 **`format='table'` 섹션이 있을 때만** 비교가를 실행한다(없으면 스킵 → 기존 런·promptHash 영향 0).
- step0이 `explanation_assets.kind='comparison'`+`payload jsonb`와 순수 `normalizeComparison`을 깔았다.

## 읽어야 할 파일

- `src/pipeline/researchCell.ts` — **전체 정독**. 특히 line 87(structure 로드), line 110~127(셈이∥유이 fan-out + `buildAssetRows`), line 135~144(저장). 비교가는 이 패턴을 미러한다. **검증 로직(reconcileFacts·삼각검증·critic)은 절대 건드리지 않는다.**
- `src/agents/numbers/step.ts`·`src/agents/numbers/schema.ts` — 형제 에이전트(step 시그니처·스키마·SYSTEM)의 정확한 형태. 비교가를 이와 동형으로 만든다.
- `src/agents/analogist/schema.ts` — `distortion_note` 같은 자기점검 필드 패턴.
- `src/agents/sherlock_lead/schema.ts` — `ScopeClaim`/`ScopeConcept`·`SHERLOCK_SCOPE_SCHEMA`의 **loose(additionalProperties:true) 패턴**(claude-p stray 내성). 비교가 스키마도 이 내성을 따른다.
- `src/pipeline/researchReconcile.ts` — `buildAssetRows`(line 99~)·`ResearchFactContext`. 여기 또는 인접에 comparison asset row 빌드를 추가한다.
- `src/agents/roles.ts` — 에이전트 레지스트리(line 19~38). 비교가 등록.
- step0 산출물: `src/pipeline/comparisonAsset.ts`(`normalizeComparison`·`ComparisonPayload`).
- `src/agents/structurer/schema.ts` — `SectionFormat`·`OutlineSection`(format 필드).

## 작업

### 1) 비교가 등록 — `roles.ts`

```ts
comparator: { roleId: "comparator", name: "비교가", defaultModel: "opus", tools: [] },
```

`tools: []` — 비교가는 web/fetch 없이 **이미 검증된 사실만** 받아 구조화한다(새 사실 생성 금지·§10 인젝션 방어).

### 2) 비교가 에이전트 — `src/agents/comparator/schema.ts` + `step.ts`

`schema.ts`:

```ts
export interface ComparisonAssetOut {
  concept: string;               // 이 비교가 다루는 주제/섹션(예: "청년도약계좌 vs 청년미래적금")
  entities: string[];            // 비교 대상 ≥2
  dimensions: string[];          // 비교 차원 ≥1 (가입조건·금리·혜택·중도해지…)
  cells: { dimension: string; entity: string; value: string; grounded: boolean }[];
}
export interface ComparatorOutput { assets: ComparisonAssetOut[]; }
```

- `COMPARATOR_SCHEMA`: `assets` 배열(minItems 0 허용 — 비교할 게 없으면 빈 배열). items는 **loose(additionalProperties:true)** + cells items도 loose(셜록 패턴 미러 — claude-p stray로 결정적 실패 방지). required는 핵심 필드만.
- `COMPARATOR_SYSTEM`(핵심 의도, 반드시):
  - 입력 = 검증된 사실(facts: claim·verification_status·quote) + 비교가 필요한 섹션들(table 섹션의 section/goal). 각 섹션에 대해 비교 대상(entities)과 차원(dimensions)을 정하고, **검증된 사실에서만 셀 값을 채운다**.
  - **money-safety(최우선)**: 검증된 사실로 뒷받침되는 값만 `grounded=true`. 근거가 없거나 미검증이면 값에 "확인 필요"라 쓰고 `grounded=false`. **수치·금리·제도 값을 추측으로 단정하지 마라.** 날조 금지.
  - **억지 금지**: 비교 대상이 1개뿐이거나 차원이 안 잡히면 그 섹션은 비교 자산을 만들지 마라(빈 배열). 빈 표보다 없는 게 낫다.
  - 한국어.

`step.ts`: `numbersStep` 미러 — `comparatorStep(llm, runId, input): Promise<ComparatorOutput["assets"]>`. maxTokens는 표 데이터라 넉넉히(예: 4096).

### 3) `buildAssetRows`에 comparison 합류 — `researchReconcile.ts`

`buildAssetRows`(또는 인접 신규 헬퍼)가 comparison asset을 `explanation_assets` row로 변환:

- `kind: 'comparison'`, `concept`, `payload: normalizeComparison({entities, dimensions, cells})`, `created_by: 'comparator'`.
- **`normalizeComparison`이 null을 반환하면 그 자산은 드랍**(적재 안 함 — money-safety).
- number/analogy row 빌드는 **불변**.

### 4) 리서치 셀 wiring — `researchCell.ts` (full 경로만)

- line 87에서 로드한 `structure`에서 `format==='table'`인 outline 섹션을 추출하는 순수 헬퍼(예: `comparisonAsset.ts`에 `tableSectionsOf(structure)` 또는 셀 안 인라인). **structure 형태가 깨졌어도 안전하게 빈 배열**(방어).
- table 섹션이 **1개 이상일 때만** `comparatorStep` 실행 — 셈이·유이와 **병렬**(같은 `Promise.allSettled`/`throwIfCapRejected` 패턴, 캡 에러만 전파·그 외 빈 배열 강등).
- 결과를 `buildAssetRows` 경로로 합쳐 `explanation_assets`에 함께 저장(line 141~144 INSERT에 포함).
- **table 섹션이 없으면 비교가를 호출하지 마라** — 기존 런 동작·비용·promptHash 영향 0(조건부 실행).
- ⚠️ **`runExamplesReentry`(examples 재진입)에도 동일하게** 비교가를 추가할지: 이 step에선 **full 경로만** 한다(examples 재진입은 explanation_assets만 재생성하므로 일관성을 위해 추가하는 게 이상적이나, 범위·회귀를 줄이기 위해 full만. examples 재진입 추가는 후속 — 산출물 summary에 명시).

### 5) 테스트 `tests/comparator.test.ts`

- `COMPARATOR_SCHEMA`가 정상 출력 통과 + loose stray 통과 + 빈 assets 통과.
- `buildAssetRows`(또는 헬퍼)가 comparison asset → kind='comparison' row(payload normalize 통과분만, null이면 드랍).
- `tableSectionsOf`(또는 셀 헬퍼)가 format='table' 섹션만 추출하고 깨진 structure에 빈 배열.
- 가능하면 fake driver로 researchCell이 table 섹션 있을 때만 비교가를 호출하는 배선 1건(numbers/analogist 테스트 패턴 참고).

## fixture 주의

새 역할 `comparator`는 **신규 promptHash** → fixture 없음 → 다음 라이브 런에서 자동 기록(claude-p $0). 기존 역할(셜록·셈이·유이·짠펜) promptHash는 이 step에서 **불변**(그들 schema/SYSTEM 안 건드림). **AC 무관**(eval은 fixture 파일 읽기). 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - 리콘실·삼각검증·critic·기존 fact/asset 저장 로직이 **불변**인가?
   - 비교가가 **검증 후** 형제로만 들어가고, table 섹션 없으면 **호출 안 되는가**(조건부)?
   - money-safety(미검증=grounded:false+"확인 필요")가 SYSTEM에 명시됐는가? `tools: []`인가?
   - `normalizeComparison` null → 드랍 경로가 있는가?
3. `phases/comparison-table/index.json`의 step 1 갱신(completed+summary / error / blocked). examples 재진입 미포함을 summary에 명시.

## 금지사항

- `reconcileFacts`·삼각검증·7무결성가드·critic·기존 fact/asset 저장을 수정하지 마라. 이유: 검증 무결성 회귀 — 비교가는 검증 *후* 형제일 뿐.
- 비교가에 web/fetch 도구를 주지 마라. 이유: 비교가는 새 사실을 만들지 않는다(검증된 사실만 구조화) — 인젝션·미검증 정보 유입 방지.
- 미검증 값을 `grounded=true`로 단정하는 지침을 만들지 마라. 이유: money-safety(잘못된 금융 비교 박제).
- table 섹션이 없을 때도 비교가를 호출하지 마라. 이유: 불필요 비용·기존 런 동작/픽스처 변경.
- scriptCell·짠펜·UI를 건드리지 마라. 이유: step2·step3 범위.
- fixture를 손으로 기록·삭제하지 마라(다음 라이브 런 자동·$0).
- 범위 외 신규 파일을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
