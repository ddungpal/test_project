# Step 0: scribe-section-step

## 배경 (자기완결 — 이 phase의 목적)

대본이 너무 짧다(기존 김짠부 평균 12.5분의 절반~63%). 앞선 phase `script-length-target`에서 프롬프트에 목표 분량 지시를 넣고 `maxTokens`를 올렸지만:

- **dev의 claude-p는 `maxTokens`를 아예 안 쓴다**(`src/llm/backends/claudeP.ts:93` — CLI에 출력 상한 플래그 없음). 상향은 운영(API)에서만 효과.
- **API 백엔드는 크레딧 잔액 0**이라 현재 호출 불가. → **지금 유일하게 작동하는 백엔드는 claude-p($0)뿐인데, 여기선 대본이 단발 생성 시 ~5,400자(≈8분)에서 천장**을 친다. 프롬프트를 아무리 조여도(2회 시도) 평탄.

**진단 가설(이 phase가 검증):** claude-p가 8개 섹션을 **한 번에** 쓰면 전체 출력을 배분해 섹션당 ~675자에서 멈춘다. **섹션을 하나씩(격리) 명시적 길이 목표로 생성하면**, 경쟁 섹션이 없어 그 섹션을 더 길게 전개할 여지가 생긴다 → 섹션별 순차 생성으로 총 분량을 늘린다.

이 step은 **"한 섹션의 세그먼트들만 생성하는" 짠펜 스텝**을 만든다(파이프라인 배선은 step 1).

## 읽어야 할 파일

- `src/agents/scribe/schema.ts` — `SCRIBE_SYSTEM`·`SCRIBE_SCHEMA`·`SCRIBE_LENGTH_DIRECTIVE`(전체 대본용)·`SCRIBE_SEGMENT_DIRECTIVE`(단일 세그먼트 재생성용)·`SCRIBE_PERSONA_DIRECTIVE`. **조건부 append 상수 패턴**을 정독.
- `src/agents/scribe/step.ts` — `scribeStep`(full 모드·전체 대본)·`scribeSegmentStep`(단일 세그먼트 재생성). 두 함수의 system 조립·`callLLM` 호출·schema를 그대로 미러할 참고.
- `src/pipeline/scriptCell.ts` — `runScriptStage`가 outline(`structure.outline` 배열: 각 항목 `{ section, goal, why, format }`)·facts·assets를 어떻게 조립해 `scribeStep`에 넘기는지(step 1에서 이걸 섹션 루프로 바꾼다).
- `tests/scribeLengthTarget.test.ts` — 회귀 가드(문구 존재·스코핑) 패턴.

## 작업

### 1) `SCRIBE_SECTION_DIRECTIVE` 상수 추가 (`schema.ts`)

`SCRIBE_SYSTEM` 본문은 건드리지 말고 **신규 별도 상수**로 추가. 의도(문구는 재량):

- **부분 생성 선언**: 이번엔 전체 대본이 아니라 **주어진 이 섹션(section) 하나의 세그먼트들만** 쓴다. 전체를 다시 시작하지 마라.
- **연속성(필수)**: 입력 `prior_tail`(직전까지 작성된 대본의 마지막 부분)에서 **자연스럽게 이어서** 시작한다. 섹션마다 처음부터 다시 시작하듯 끊지 마라. (기존 `■ 자연스러운 연결` 규칙 재사용) 첫 섹션(prior_tail 없음)은 tone의 고정 인사로 오프닝.
- **섹션 분량(핵심)**: 이 섹션을 **900~1,200자로 충분히 전개**한다(구체 수치·상황·예시·되짚기·왜/그래서까지). 단 **오프닝·정리 섹션은 짧아도 된다**(section의 성격을 보고 판단). 억지로 늘리지 말고 깊이로 채운다(중복 금지 유지).
- **규칙 승계**: 말투·쉬운 설명·money-safety·형식 블록(table/case/visual)·lineage(used_fact_idxs/used_asset_idxs)는 전체 모드와 **동일하게** 지킨다. facts/assets 인덱스는 **전역 인덱스**(입력으로 받은 그대로) — 새로 매기지 마라.

### 2) `scribeSectionStep` 함수 추가 (`step.ts`)

```ts
export async function scribeSectionStep(
  llm: CallLLMDeps,   // 기존 scribeStep과 동일 타입
  runId: string,
  input: {
    tone: unknown;
    section: unknown;        // outline의 섹션 1개 { section, goal, why, format }
    sectionIndex: number;    // 0부터
    totalSections: number;
    prior_tail: string;      // 직전까지 대본의 끝부분(연속성용). 첫 섹션이면 빈 문자열.
    facts: unknown;          // 전역 facts(인덱스 전역 유지)
    assets: unknown;         // 전역 assets(인덱스 전역 유지)
    target_persona?: string;
  },
): Promise<{ segments: ScriptSegmentOut[] }>
```

- system = `SCRIBE_SYSTEM` + `SCRIBE_SECTION_DIRECTIVE` (+ persona 있으면 `SCRIBE_PERSONA_DIRECTIVE`). **`SCRIBE_LENGTH_DIRECTIVE`(전체 대본용)는 붙이지 마라** — 섹션 모드는 섹션 목표를 쓴다(충돌 방지).
- llmInput = { tone, section, sectionIndex, totalSections, prior_tail, facts, assets, (persona 있으면) target_persona }.
- schema = `SCRIBE_SCHEMA` 재사용 가능(segments 배열). 단 이 호출은 **한 섹션분**이라 `minItems`가 부담이면 섹션용 스키마를 별도로 둬도 된다(재량). 출력 세그먼트의 `ord`는 이 호출 안에서의 상대 순번이어도 됨 — **전역 ord는 step 1의 오케스트레이션이 다시 매긴다**.
- `maxTokens`: 6144(섹션 하나라 충분). claude-p는 어차피 무시, API는 섹션당 이 정도면 충분.

### 3) 회귀 가드 테스트

`tests/scribeSectionStep.test.ts`:
- `SCRIBE_SECTION_DIRECTIVE`에 연속성·섹션 분량 문구 존재.
- **스코핑 불변식**: 섹션 모드 system에 `SCRIBE_SECTION_DIRECTIVE` 포함 & `SCRIBE_LENGTH_DIRECTIVE` **미포함**(전체 모드와 구분). persona 있을 때 `SCRIBE_PERSONA_DIRECTIVE`도 포함.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.
- 라이브 생성(claude-p)은 AC 아님 — 문구·스코핑·시그니처는 위 테스트·typecheck로 검증. 실제 길이 검증은 step 1 배선 후 머지 다음 별도.

## 검증 절차

1. AC 실행.
2. `git diff`가 `scribe/schema.ts`·`scribe/step.ts`·신규 테스트만 잡히는지. `scriptCell.ts`는 이 step에서 **미변경**(배선은 step 1).
3. `git status`로 범위 외 untracked(fixtures replay 등) 제외.
4. `phases/script-sectioned-generation/index.json`의 step 0 갱신(완료 → completed + summary / 3회 실패 → error).

## 금지사항

- 이 step에서 `scriptCell.ts`(파이프라인)를 건드리지 마라. 이유: 배선은 step 1. scope 분리.
- `SCRIBE_SYSTEM` 본문·`SCRIBE_SCHEMA`·기존 상수(`LENGTH`/`SEGMENT`/`PERSONA_DIRECTIVE`)를 바꾸지 마라(섹션 지시는 신규 별도 상수).
- 섹션 모드에 `SCRIBE_LENGTH_DIRECTIVE`(전체 대본 목표)를 붙이지 마라. 이유: 섹션 하나에 "10~15분·7,000자" 목표가 걸리면 한 섹션이 비정상적으로 부푼다.
- 마이그레이션·새 의존성 금지. 기존 테스트를 깨뜨리지 마라.
