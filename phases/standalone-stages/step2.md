# Step 2: standalone-seeder

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `src/pipeline/standalone/deps.ts` — step0 산출물(`STANDALONE_DEPS`, selection payload shaping). 이 step의 입력 단일 출처
- `src/app/actions/topicRun.ts:33-37` — content+production_run 생성 패턴(insert 모양) + 단계 Inngest 이벤트를 어떻게 발사하는지(미러 대상)
- `src/pipeline/runState.ts:26-54` — `getRun`, `transitionRun`(전이는 반드시 이걸로), `Supa` 타입
- `src/pipeline/context.ts:8-35` — `getSelectedStagePayload`(시드한 selection이 이 함수로 읽혀야 함 → stage_proposals.candidates[idx].payload + stage_selections.chosen_idx 구조 정확히 맞추기)
- `src/pipeline/stages.ts` — `PIPELINE`(각 단계 `event`, `enters`), `STAGE_DESCRIPTORS`(proposal 단계 fromState/proposedState/selectedState)
- `src/domain/enums.ts` — `RUN_STATES`(인접 walk 순서), `ALLOWED_TRANSITIONS`
- `src/inngest/functions/` 중 기존 단계 트리거(예: title/research 이벤트 send) — 이벤트 발사 방법 미러

## 목표

임시 run을 만들어 목표 단계의 `enters`/`fromState`까지 **시드하고**, 그 단계 하나만 평소처럼 실행하는 진입점을 만든다. **이 step은 제안단계 타깃(topic·title_thumb·thumbnail·structure)과 research까지 다룬다. script는 step3.**

## 작업

`src/app/actions/standaloneRun.ts`(서버 액션) 또는 `src/pipeline/standalone/seed.ts`(순수에 가까운 코어) — 구조는 재량. 시그니처:

```ts
// 임시 run 생성 + created → target.enters까지 walk하며 deps 시드. runId 반환.
export async function seedStandaloneRun(
  supa: Supa,
  target: Stage,
  rawInputs: Record<string, string>,   // field → 사용자 텍스트(STANDALONE_DEPS의 field 키)
): Promise<string>;

// 시드 + 목표 단계 Inngest 이벤트 발사. 단독 실행의 단일 진입점.
export async function runStandalone(
  target: Stage,
  rawInputs: Record<string, string>,
): Promise<{ runId: string }>;
```

구현 핵심:

1. **content+run 생성**: topicRun.ts 패턴으로 content 1개 + production_run insert. run은 `is_standalone: true`(step1 컬럼)로 insert. 트리거가 state='created' 강제하므로 state는 넣지 마라.
2. **walk + 시드**: `RUN_STATES`의 인접 쌍을 `created`부터 `STANDALONE_DEPS[target].enters`까지 순서대로 `transitionRun(supa, runId, from, to)`로 전진한다.
   - 어떤 `*_selected` 상태에 **도달하기 직전/직후**, 그 단계가 `STANDALONE_DEPS[target].seeds`의 `kind==="selection"` 대상이고 rawInputs에 값이 있으면, 그 단계에 대해 `stage_proposals`(candidates=`[{ idx:0, payload: <shaping된 값>, reason:"단독 시드", evidence_ids:[] }]`) + `stage_selections`(chosen_idx:0) 를 insert한다 → `getSelectedStagePayload`가 정확히 그 payload를 읽도록.
   - 시드 안 하는 통과 상태(예: research 타깃의 thumbnail)는 proposal 없이 그냥 transition만 — `getSelectedStagePayload`가 null 반환해도 그 단계는 그 입력을 안 읽으므로 무해.
   - optional 입력(예: structure/research의 제목)은 rawInputs에 있으면 시드, 없으면 생략.
3. **목표 단계 실행**: `runStandalone`이 시드 후 `PIPELINE[target].event`를 기존 UI가 단계 트리거하는 방식 그대로 Inngest로 발사(force 없음·정상 forward). 결과는 비동기로 채워지고 사용자는 `/runs/[runId]`에서 본다.
4. **script 타깃**: 이 step에선 `throw new Error("script 단독 실행은 step3에서 구현")`. 이유: facts/assets 시드는 money-safety라 격리.

핵심 규칙(반드시 준수):
- 시딩은 **callLLM 0회·비용 0**(claude-p든 api든 단 한 번도 호출 금지). 시드는 사용자 입력을 DB에 박는 결정적 작업.
- 상태 전이는 **오직 `transitionRun`**. raw `update({state})`나 트리거 우회 금지(이유: 전이표 안전망 보존·낙관잠금).
- 시드한 selection은 `getSelectedStagePayload` 계약(candidates[idx].payload + chosen_idx 일치)을 정확히 만족(이유: idx 불일치면 그 함수가 throw).

## Acceptance Criteria

```bash
npm run typecheck
npm test
```

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 테스트(신규): mock/통합 Supa로 — research 타깃 시드 후 run.state가 `structure_selected`이고, `getSelectedStagePayload(runId,"topic")`·`("structure")`가 시드값을 정확히 반환, 시드 안 한 `("thumbnail")`은 null. title_thumb 타깃은 `topic_selected`까지. 시드 경로에서 callLLM 미호출(스파이/모드 확인).
3. 체크리스트:
   - 전이가 전부 `transitionRun` 경유(ALLOWED_TRANSITIONS 합법 경로).
   - run에 `is_standalone=true`.
   - script 타깃은 명시적 throw.
4. `phases/standalone-stages/index.json`의 step 2 갱신.

## 금지사항

- 시드 중 callLLM을 호출하지 마라. 이유: 단독 실행의 핵심 가치=앞단계 재생성 없이 $0 즉시.
- `transitionRun`을 우회해 state를 직접 update하지 마라. 이유: 전이 트리거·낙관잠금 안전망 파괴.
- script facts/assets를 여기서 시드하지 마라(step3). 기존 테스트를 깨뜨리지 마라.
