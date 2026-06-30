# Step 1: case-miner-agent

P4의 **케이스 발굴 레이어**. 새 에이전트 **분기가(`case_miner`)** 를 셈이·유이·비교가의 형제로 추가해, **댓글에서 발굴한 시청자 궁금증(집계 신호) + 검증된 사실**로 케이스 분기 데이터를 생성하고 `explanation_assets(kind='case')`에 저장한다. P3의 `comparator-agent` step과 **구조가 거의 동일**하다.

## ‼️ 거버넌스 (절대 위반 금지)

**댓글 '원문'(`comments_raw.body`)은 LLM에 절대 전송하지 않는다**(governance C안 — `commentSignals.ts` 상단 주석·여러 마이그 주석에 명시). 분기가에게 주는 댓글 정보는 **코드로 집계한 신호만**(질문 댓글 수·키워드 빈도). 시청자 상황(condition)은 그 **집계 신호 + 주제 + 검증된 사실**에서 도출한다 — 원문을 모델에 보여주고 분류시키는 게 아니다.

## 배경

- 리서치 셀(`researchCell.ts`)은 P3에서 셈이∥유이∥**비교가**를 검증 후 형제로 돌린다. 분기가는 **같은 자리**에 들어간다.
- 트리거: outline에 **`format='case'` 섹션이 있을 때만** 분기가 실행(없으면 스킵 → 기존 런·promptHash 영향 0). P3의 `tableSectionsOf`와 대응되는 `caseSectionsOf`.
- 댓글 집계는 이미 있는 `aggregateCommentSignals`(순수·원문 비전송)를 재사용한다.
- step0이 `explanation_assets.kind='case'`와 순수 `normalizeCaseAsset`(branches≥2·grounded)를 깔았다.

## 읽어야 할 파일

- `src/agents/topic_scout/commentSignals.ts` — **`aggregateCommentSignals(rows, {keyword})`**(순수·원문 비전송·질문 카운트·키워드 빈도). 분기가 prep이 이걸 재사용한다. **거버넌스의 핵심 구현 — 정독.**
- `src/agents/topic_scout/prepare.ts` line 50~56 — `comments_raw` 로드 + `aggregateCommentSignals` 호출 패턴(미러 대상).
- `src/pipeline/researchCell.ts` — P3에서 비교가를 어떻게 형제로 wiring했는지(전체 정독). 비교가 패턴을 그대로 분기가로 복제. **검증 로직 불변.**
- `src/agents/comparator/schema.ts`·`step.ts` — **P3의 비교가**. 분기가를 이와 동형(loose·money-safety·tools:[])으로 만든다.
- `src/pipeline/researchReconcile.ts` line 88~ — `buildAssetRows`(P3에서 `comparisonAssets` 4번째 인자 추가됨). 분기가는 **5번째 인자 `caseAssets`** 추가.
- `src/pipeline/comparisonAsset.ts` — `tableSectionsOf`(format='table' 섹션 추출). `caseAsset.ts`의 `caseSectionsOf`(format='case')는 이걸 미러.
- `src/agents/roles.ts` — 분기가 등록.
- step0 산출물: `src/pipeline/caseAsset.ts`(`normalizeCaseAsset`·`CaseAssetPayload`·`CaseBranch`).

## 작업

### 1) 분기가 등록 — `roles.ts`

```ts
case_miner: { roleId: "case_miner", name: "분기가", defaultModel: "opus", tools: [] },
```

`tools: []` — 분기가는 web/fetch 없이 **이미 검증된 사실 + 댓글 집계 신호만** 받아 구조화(새 사실 생성 금지·원문 미수신).

### 2) 분기가 에이전트 — `src/agents/case_miner/schema.ts` + `step.ts`

`schema.ts`:

```ts
export interface CaseAssetOut {
  concept: string;                 // 이 케이스가 다루는 주제/섹션
  intro?: string;                  // 분기 도입(선택)
  branches: { condition: string; outcome: string; grounded: boolean }[]; // ≥2
}
export interface CaseMinerOutput { assets: CaseAssetOut[]; }
```

- `CASE_MINER_SCHEMA`: `assets` 배열(minItems 0 — 케이스로 만들 게 없으면 빈 배열). items·branches items 모두 **loose(additionalProperties:true)**(셜록·비교가 패턴 미러 — claude-p stray 내성). required는 핵심 필드만.
- `CASE_MINER_SYSTEM`(핵심 의도, 반드시):
  - 입력 = 검증된 사실(facts) + 케이스 섹션(case 섹션의 section/goal) + **댓글 집계 신호**(question_comment_count·keyword_signals — 시청자가 자주 묻는 키워드/궁금증의 빈도). **원문 댓글은 받지 않는다.**
  - 집계 신호 + 주제로 **시청자 상황(condition)** 을 도출한다("이런 상황이면…"). 자주 묻히는 키워드일수록 우선.
  - **money-safety(최우선)**: 각 분기의 outcome은 **검증된 사실에 근거할 때만** `grounded=true`. 근거 없거나 미검증이면 outcome에 "확인 필요"를 명시하고 `grounded=false`. 수치·제도·금리를 추측으로 단정하지 마라. 날조 금지.
  - **억지 금지**: 의미 있는 분기가 2개 미만이면 그 섹션은 케이스 자산을 만들지 마라(빈 배열). 억지 분기보다 없는 게 낫다.
  - 한국어.

`step.ts`: `comparatorStep` 미러 — `caseMinerStep(llm, runId, input): Promise<CaseMinerOutput["assets"]>`. maxTokens 넉넉히(예: 4096).

### 3) `buildAssetRows`에 case 합류 — `researchReconcile.ts`

`buildAssetRows`에 **5번째 인자 `caseAssets: CaseMinerOutput["assets"] = []`**(optional·기본 [] — 기존 호출부 불변) 추가. comparison 패턴 미러:

- 각 case asset → `normalizeCaseAsset({intro, branches})`(branches의 grounded 그대로). null이면 **드랍**.
- `kind: 'case'`, `concept`, `payload: <normalized> as Json`, `created_by: 'case_miner'`.
- number/analogy/comparison row 빌드는 **불변**.

### 4) 리서치 셀 wiring — `researchCell.ts` (full 경로만)

- `caseAsset.ts`에 `caseSectionsOf(structure)`(format='case' 섹션만·깨진 structure 빈 배열 방어) 추가(comparisonAsset.tableSectionsOf 미러).
- 댓글 집계: P3 비교가 wiring 근처에서, case 섹션이 있을 때 `comments_raw`를 로드(topic_scout/prepare 패턴) → 주제(`getSelectedStagePayload(supa, runId, "topic")`)를 keyword로 `aggregateCommentSignals` → 신호 산출. **원문은 분기가에 넘기지 않는다 — 집계만.**
- case 섹션이 **1개 이상일 때만** `caseMinerStep` 실행 — 셈이·유이·비교가와 **병렬**(같은 `Promise.allSettled`/`throwIfCapRejected`·캡 에러만 전파).
- 결과를 `buildAssetRows`의 5번째 인자로 합쳐 `explanation_assets`에 함께 저장.
- **case 섹션 없으면 분기가·댓글 로드 안 함** → 기존 런·비용·promptHash 영향 0.
- ⚠️ **`runExamplesReentry`(examples 재진입)는 이번에도 제외**(full 경로만 — P3와 일관). summary에 명시.

### 5) 테스트 `tests/caseMiner.test.ts`

- `CASE_MINER_SCHEMA` 정상 출력 통과 + loose stray 통과 + 빈 assets 통과.
- `buildAssetRows`가 case asset → kind='case' row(normalizeCaseAsset 통과분만·null 드랍·branches<2 드랍).
- `caseSectionsOf`가 format='case' 섹션만 추출·깨진 structure에 빈 배열.
- (가능하면) fake driver로 researchCell이 case 섹션 있을 때만 분기가 호출 + **원문이 분기가 입력에 없음**(집계만) 배선 1건.

## fixture 주의

새 역할 `case_miner`만 신규 promptHash(다음 라이브 런 자동 기록·$0). 기존 역할 promptHash 불변. **AC 무관**(eval은 fixture 파일 읽기). 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - **댓글 원문이 분기가 입력에 들어가지 않는가**(집계 신호만 — 거버넌스)? `tools: []`인가?
   - 리콘실·삼각검증·critic·기존 자산 저장이 **불변**이고, case 섹션 없으면 분기가/댓글 로드가 **안 되는가**?
   - money-safety(미검증=grounded:false+"확인 필요")가 SYSTEM에 명시됐는가? branches<2 자산은 normalizeCaseAsset가 드랍하는가?
3. `phases/case-branching/index.json`의 step 1 갱신(completed+summary / error / blocked). examples 재진입 미포함 명시.

## 금지사항

- **댓글 원문(`comments_raw.body`)을 LLM(분기가)에 전송하지 마라.** 이유: governance C안 위반(프라이버시) — `aggregateCommentSignals`의 집계 신호만 전달.
- `reconcileFacts`·삼각검증·7무결성가드·critic·기존 자산 저장을 수정하지 마라. 이유: 검증 무결성 회귀.
- 분기가에 web/fetch 도구를 주지 마라. 이유: 새 사실 생성·미검증 정보 유입 방지(§10).
- 미검증 outcome을 `grounded=true`로 단정하는 지침을 만들지 마라. 이유: money-safety.
- case 섹션이 없을 때 분기가·댓글 로드를 실행하지 마라. 이유: 불필요 비용·기존 런/픽스처 변경.
- scriptCell·짠펜·UI를 건드리지 마라. 이유: step2·step3 범위.
- fixture를 손으로 기록·삭제하지 마라. 범위 외 신규 파일을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
