# Step 2: research-context

타겟 페르소나(`target_persona`)와 온보딩 금맥(`OnboardingGold`)을 **셜록(리서치 scope·`sherlock_lead`)** 입력에 **소프트 주입**한다. 방식 = **A (input 키만·system 무변경)**. 리서치는 이미 구다리 목차 기반으로 범위가 잡히므로, persona/금맥은 "어느 깊이로·무슨 혼란을 풀지"의 소프트 힌트로만.

## 읽어야 할 파일

먼저 아래를 읽고 설계 의도·패턴을 파악하라:

- `docs/specs/2026-07-02-downstream-context-injection-design.md` — phase 전체 설계. 특히 "금맥 → 셜록 필드"·"A(소프트)".
- `src/agents/structurer/prepare.ts` (L26/L29/L51-52 persona 조건부 input · L8/L56-64 `loadOnboardingGold`로 `onboardingGold` 4필드 조건부 input) — **핵심 참조.** 구다리가 persona·금맥을 input에 조건부 주입하는 방식. 셜록에도 같은 shape·같은 조회를 쓴다.
- `src/pipeline/onboarding.ts` `loadOnboardingGold(supa, runId)` — 금맥 조회(없으면 null·throw 0). 구다리와 같은 함수 재사용.
- `src/pipeline/researchScope.ts` — **수정 대상.** `runResearchScope(...)`가 topic.title·outline(구다리 목차)를 로드해 `scopeStep(llm, runId, {topic, title, outline, budget})`를 호출하는 지점(대략 L101-109). `regenerateResearchScope(...)`(대략 L141~)도 같은 컨텍스트를 조립하니 **두 경로 모두** 적용.
- `src/agents/sherlock_lead/step.ts` (`scopeStep(llm, runId, input)` L5 부근) + `src/agents/sherlock_lead/schema.ts` — **수정 대상.** scope input 타입에 optional 필드 추가.

## 작업

### 1) `src/agents/sherlock_lead/schema.ts` (+ step.ts input 타입)

- `scopeStep`의 input 타입에 optional `target_persona?: string` + `onboardingGold?`(구다리 `StructurerInput.onboardingGold`와 **동일 shape**: `{ confusionPoints: string[]; ahaPoints: string[]; coreAngle: string; calibratedLevel: string }`) 추가.
- **`SHERLOCK_SCOPE_SYSTEM` 본문은 수정하지 마라(A=소프트·system 무변경). 이유: system을 늘리면 persona/금맥 없는 런의 promptHash가 깨진다.** 이 step은 input JSON에만 필드를 얹는다(LLM이 input에서 자연히 활용).

### 2) `src/pipeline/researchScope.ts` — `runResearchScope` + `regenerateResearchScope`

- topic payload에서 `target_persona` 읽기(구다리와 동일 경로·edited_payload 우선). `loadOnboardingGold(supa, runId)`로 금맥 읽기.
- persona/금맥이 **있을 때만** `scopeStep` input에 각 키를 추가(구다리 `prepare.ts`의 4필드 명시 주입 미러). **없으면 키 생략 → 바이트 동일 → promptHash 보존.**
- 기존 컨텍스트(`topic`·`title`·`outline`·`budget`·재생성 시 `reason`/`existing`)의 조립·동작은 **그대로 보존.**

## Acceptance Criteria

```bash
npm run typecheck   # 컴파일 에러 없음
npm test            # 신규 회귀 테스트 포함 전부 통과
npm run build       # 빌드 성공
```

신규 `tests/researchScopeContext.test.ts`:
- persona/금맥 있으면 `scopeStep`에 전달되는 input에 `target_persona`·`onboardingGold`(4필드) 키 존재.
- 둘 다 없으면 input에 키 부재(바이트 불변). 기존 `topic`/`title`/`outline`/`budget` 조립 불변.
- (단위 테스트가 어려우면 순수하게 "input 조립 결과"를 검증하도록 조립 로직을 테스트 가능한 형태로 분리 — 단, `researchScope`의 전이/실행 로직은 바꾸지 마라.)

## 검증 절차

1. 위 AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - A 방식 준수(input만·`SHERLOCK_SCOPE_SYSTEM` 무변경).
   - 조건부 불변식(있을 때만·없으면 바이트 동일).
   - `runResearchScope`·`regenerateResearchScope` **양쪽** 적용.
   - 새 의존성·마이그레이션 없음.
3. 결과에 따라 `phases/downstream-context-injection/index.json`의 step 2를 갱신:
   - 성공 → `"completed"` + `"summary"`.
   - 3회 시도 실패 → `"error"` + `"error_message"`.

## 금지사항

- **`SHERLOCK_SCOPE_SYSTEM` 본문을 수정하지 마라. 이유: A(소프트)라 system 무변경이 원칙이고, 늘리면 promptHash가 깨진다.**
- **`regenerateResearchScope`를 빠뜨리지 마라. 이유: 재생성 경로도 같은 scope 컨텍스트를 조립하므로 한쪽만 하면 재생성 시 컨텍스트가 누락된다.**
- **리서치 검증 로직(researchCell·fan-out 에이전트·budget 계산·전이)을 바꾸지 마라. 이유: 이 step은 scope 입력 컨텍스트 확장만.**
- **금맥 shape을 구다리와 다르게 만들지 마라. 이유: 두 곳이 같은 `loadOnboardingGold` 출력을 쓰므로 shape 일치가 유지보수를 단순화한다.**
- 기존 테스트를 깨뜨리지 마라.
