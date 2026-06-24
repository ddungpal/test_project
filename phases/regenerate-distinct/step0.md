# Step 0: regenerate-prompt-variation

**'다시 생성'이 이전과 똑같은 후보를 내는 버그 수정(백엔드).** 재생성(force=true)이 프롬프트를 변주하지 않아 promptHash가 forward 경로와 같고, callLLM 픽스처 캐시가 바이트 동일한 출력을 돌려준다. force일 때만 prep에 변주 지시를 주입해 promptHash를 달라지게 한다.

## 근본 원인 (이미 확정 — 추측 금지, 아래가 사실)
- `src/llm/callLLM.ts:41` — `promptHash`는 `{ roleId, system, input, schema, model, maxTokens }`의 순수 함수.
- `callLLM`은 그 hash로 픽스처를 캐싱: **replay**(line 44-48)=항상 같은 픽스처 반환 / **record**(line 50-56)=픽스처 있으면 **그대로 재생**(read-through), 없을 때만 라이브 호출 후 녹화.
- `regenerateStage`(`src/app/actions/topicRun.ts:164`) → Inngest 이벤트 `force:true` → `_shared.executeProposalStage` → `runProposalStage(spec, deps, { force:true })` → `decideStageEntry`가 **'run-in-place'**(상태 전이 없이 새 제안 INSERT)로 분기.
- **그러나 `spec.prepare(supa)`가 같은 run·주제·레퍼런스로 동일 system+input을 만든다** → 동일 promptHash → callLLM이 이전과 **바이트 동일한 후보**를 반환. 새 `stage_proposals` 행은 생기지만 내용 불변.
- **증상**: ①재생성 완료 후 자동 새로고침해도 변화 없음 ②강제 새로고침해도 기존 그대로. 둘 다 "내용이 실제로 안 바뀜"이라는 **하나의 원인**. (읽기 최신우선·force 전달·페이지 게이팅·LiveRefresh는 전부 정상으로 검증됨 — 건드리지 마라.)

## 읽어야 할 파일 (먼저 정독)
- `src/pipeline/stageContract.ts` — `runProposalStage`. **여기 한 곳만 고친다**(스테이지 무관). `entry`(`decideStageEntry`)가 `"run-in-place"`인 경로(line 152-160 부근)와 `prep = await spec.prepare(supa)`(line 98), `callLLM`(line 101) 위치 확인. `Candidate` 타입(`{ idx, payload, reason, evidence_ids }`)도 여기 정의(line 19).
- `src/pipeline/regenerateDecision.ts` — `decideStageEntry`가 `"memoized"|"run-forward"|"run-in-place"|"reject"` 반환. force=true & proposedState → `"run-in-place"`.
- `src/llm/callLLM.ts`(36-90)·`src/llm/promptHash.ts` — promptHash가 system을 포함함을 확인(system을 바꾸면 hash가 바뀐다 = 우리가 원하는 것).
- `src/llm/fixtures.ts` — record/replay 의미(replay는 미녹화 시 throw, record는 read-through).
- `src/agents/hook_maker/stage.ts`·`prepare.ts` — `prepare: (supa) => prepareHookMaker(supa, runId)`. prepare는 **supa만** 받는다(force를 모른다) → 그래서 수정은 spec이 아니라 **runProposalStage에서 prep 산출물을 augment**하는 게 맞다(전 스테이지 공통, 각 prepare 미수정).

## 작업
### 1) 순수 헬퍼 `src/pipeline/regenerateVariation.ts`
```ts
import type { Candidate } from "./stageContract.js"; // 또는 Candidate를 별도 타입파일에서 import

// force 재생성 시 base system에 붙일 변주 지시를 만든다(결정적).
//   - attempt(재생성 회차 nonce)로 매 재생성마다 promptHash가 달라진다(1→2→3…).
//   - priorCandidates 요약을 넣어 "이전 안과 뚜렷이 다른 새 안"을 지시(운영 off 모드서도 진짜 대안 유도).
//   base가 비면 그대로(방어). priorCandidates 비면 회차 지시만.
export function buildRegenerateAugmentedSystem(
  baseSystem: string,
  priorCandidates: Pick<Candidate, "payload">[],
  attempt: number,
): string;
```
- 한국어 지시. 예: `\n\n## 다시 생성(N회차)\n아래 이전 제안들과 '뚜렷이 다른' 새 안을 내라(주제 각도·표현·구조를 차별화). 이전 안 반복 금지:\n- {요약1}\n- {요약2}\n`.
- payload 요약은 방어적으로(unknown): title 있으면 title, 아니면 `JSON.stringify` 축약. 길이 상한(예: 항목당 120자).
- **결정적**: 같은 (base, priors, attempt) → 같은 출력. attempt가 다르면 출력이 달라야 한다(nonce 역할).

### 2) `runProposalStage`에서 force 경로만 augment (`stageContract.ts`)
- `const prep = await spec.prepare(supa);` 직후, **`entry === "run-in-place"`일 때만**:
  - 이 (run, stage)의 기존 제안을 조회: `stage_proposals`에서 `run_id`+`stage`로 `candidates, created_at` 가져와 **개수=attempt**(다음 재생성 회차), **가장 최근 candidates=priorCandidates**로 사용.
  - `prep.system = buildRegenerateAugmentedSystem(prep.system, priorCandidates, attempt);`
- 그 외 경로(`run-forward` 등 force=false)는 **prep을 절대 건드리지 마라** → promptHash 불변 → 기존 forward 픽스처·parity 보존.
- callLLM은 변경된 prep.system을 그대로 받는다(이미 그렇게 동작). 나머지(INSERT·run-in-place UPDATE·cost flush)는 손대지 마라.

## 주의
- **forward 경로(force=false) promptHash 절대 불변**: augment는 `entry === "run-in-place"` 안에서만. `git diff`로 forward 경로 prep이 안 바뀌었는지 확인. (기존 `fixtures/parity/*`·`eval` 그대로여야 함.)
- **replay 모드 한계 명시(주석)**: 재생성은 새 promptHash라 replay 전용($0 동결)에선 픽스처 미스로 throw가 정상 — 재생성은 본질적으로 '새 생성'이라 record/off가 필요(dev=claude-p record $0). 이건 버그 아님(설계). // ponytail: replay는 동결 재생용, 재생성은 record로.
- **AC는 라이브 0**: 테스트는 순수 헬퍼 + `promptHash` 직접 비교로만(실 LLM 호출·DB 없음). 절대 라이브/녹화 새로 만들지 마라.
- `Candidate` 타입을 `stageContract.ts`에서 import할 때 순환참조 주의 — 필요하면 `Pick<>`/로컬 최소 타입으로 받아라.
- exactOptionalPropertyTypes·noUncheckedIndexedAccess 준수. tsx top-level await 금지.
- UI·LiveRefresh·읽기쿼리(runDetail)·페이지 게이팅·decideStageEntry는 **범위 밖**(이미 정상). 건드리지 마라.

## 테스트 (`tests/regenerateVariation.test.ts`)
- `buildRegenerateAugmentedSystem("BASE", [{payload:{title:"A안"}}], 1)` → "BASE" 포함 + "A안" 포함 + base와 다름.
- attempt 1 vs 2 → 출력 문자열이 다르다(nonce 보장).
- priors 빈 배열 → throw 없이 회차 지시만(base 포함).
- **promptHash 차등(핵심)**: `promptHash`를 import해, 같은 (roleId,input,schema,model,maxTokens)에서 system만 base vs `buildRegenerateAugmentedSystem(base, priors, n)`로 줬을 때 **hash가 다르다**. 또 attempt 1 vs 2도 hash가 다르다. base 그대로 두 번 = 같은 hash(forward 불변 증명).
- 결정성: 같은 인자 두 번 호출 → 동일 출력.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0. 기존 hook_maker/topic/structure parity·eval 픽스처 불변.
2. `git diff src/pipeline/stageContract.ts`로 augment가 `run-in-place` 분기 안에만 있고 forward 경로 prep은 무변경인지 확인.
3. (가능하면 메모) 라이브 확인은 사용자: dev `LLM_FIXTURES=record`에서 같은 단계 '다시 생성' → 이전과 다른 후보가 화면에 뜸(2회차도 또 다름). [DB/라이브 필요 → 헤드리스면 순수+hash 테스트로 갈음.]
4. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"buildRegenerateAugmentedSystem(이전후보+회차nonce 변주지시·결정적) + runProposalStage가 run-in-place(force)에서만 prep.system augment(이전 제안 조회·attempt=기존 제안수) → 재생성 promptHash가 forward와 차등 = 새 후보 생성. forward 경로 불변(픽스처 보존). promptHash 차등·결정성 테스트. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- forward 경로(force=false)의 prep/promptHash를 바꾸지 마라. 이유: 기존 parity/eval 픽스처가 깨진다.
- callLLM·fixtures·promptHash 내부 로직을 바꾸지 마라(원인은 그게 아니라 재생성이 변주를 안 한 것). 이유: 캐싱은 의도된 $0 메커니즘이다.
- UI·LiveRefresh·runDetail·페이지 게이팅·decideStageEntry 수정 금지(이미 정상·범위 밖).
- 라이브/녹화 픽스처를 새로 만들지 마라(AC는 오프라인 $0).
- 기존 테스트를 깨뜨리지 마라.
