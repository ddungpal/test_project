# Step 3: onboarding-stage-wiring

쏙이를 파이프라인에 **온디맨드**로 배선한다 — 강제 게이트 아님. 두 접점: (1) 버튼이 발행하는 `run/onboarding.requested`가 아크를 생성·저장, (2) 김짠부 응답을 받는 `submitOnboarding` 액션이 금맥을 저장. **구다리의 선형 상태전이는 절대 바꾸지 않는다.**

## 읽어야 할 파일

- `docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md` — 설계 단일 출처. 특히 "C. 배선 — 온디맨드"와 불변식("구다리 fromState 불변").
- `src/pipeline/stages.ts` — `PIPELINE`/`STAGE_DESCRIPTORS` 선형 상태머신. 구다리는 `thumbnails_selected`에서 진입 — **이 값을 바꾸지 마라.**
- `src/pipeline/standalone/deps.ts`·`src/pipeline/standalone/seed.ts` — **on-demand/선형 밖 스테이지 패턴.** 온보딩은 여기에 맞춰 등록(선형 PIPELINE의 `Record<Stage,...>`에 넣어 구다리 enters/produces를 흔들지 마라).
- `src/domain/enums.ts`(또는 `enums.js` 소스) — `Stage`·`RunState` 유니온. 온보딩 스테이지/이벤트가 필요로 하는 최소 추가만.
- Inngest 함수 등록부(예: `src/inngest/` 또는 `researchStageFn`/`scriptStage` 정의 파일) — 이벤트→durable 실행 배선 패턴. `run/*.requested` 핸들러 등록 방식 확인.
- `src/app/actions/topicRun.ts` — `requireOwner`·`auditLog`·액션 시그니처 패턴(예: `reviewScriptAction`·`editTopicPersona`). `submitOnboarding`을 여기 미러.
- `src/agents/onboarder/{prepare,step}.ts`(step 1·2) — 아크 생성 체인.
- `src/lib/onboarding/arc.ts`(step 0) — `extractGold`.

## 작업

### 1) 온디맨드 스테이지 등록 (선형 밖)

- `onboarding` 스테이지/이벤트 `run/onboarding.requested`를 **standalone 패턴**으로 등록. 필요한 만큼만 `Stage`/`RunState` enum에 추가하되, **구다리(structure)의 `fromState:"thumbnails_selected"`·`enters`·`produces`를 바꾸지 마라**(구다리는 온보딩과 독립적으로 기존대로 진입).
- 이벤트 핸들러: `prepareOnboarder` → `onboarderStep` → 결과 `OnboardingArc`를 **run 스코프 payload로 저장**(다른 스테이지 산출물 저장 방식 미러 — 새 테이블/컬럼 없이 기존 stage_proposals/payload 저장소 재사용). 멱등: 같은 run에 재요청 시 재생성 or 기존 반환(기존 스테이지 멱등 패턴 따르라).

### 2) `submitOnboarding` 액션

`src/app/actions/topicRun.ts`(또는 관례상 액션 파일)에:

```ts
export async function submitOnboarding(runId: string, answers: ArcAnswer[]): Promise<...>;
```

- `requireOwner` 게이트.
- 저장된 `OnboardingArc` 로드 → `extractGold(arc, answers)`(순수·step 0) → **금맥 `OnboardingGold`를 run 스코프 payload로 저장**(구다리 prepare가 step 4에서 읽음).
- `auditLog`에 `onboarding_submitted` 기록(기존 audit 패턴).

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 tests/onboardingWiring.test.ts 포함
npm run build
```

신규 `tests/onboardingWiring.test.ts`:
- 온보딩 스테이지 등록이 **구다리 진입 상태를 바꾸지 않음**(PIPELINE.structure.enters === "thumbnails_selected" 회귀 가드).
- `submitOnboarding`: 아크+응답 → `extractGold` 결과가 run payload로 저장됨(fake supa 라운드트립·requireOwner 경유).
- (가능하면) 이벤트 핸들러가 prepare→step→저장 체인을 부르는지 얇은 단위 테스트.

## 검증 절차

1. AC 실행.
2. 아키텍처 체크리스트:
   - **enum/CHECK 제약을 넓혔다면 같은 커밋에서 `src/lib/supabase/database.types.ts`의 해당 Row 유니온 타입도 함께 넓혔는가**(스키마-타입 드리프트가 다음 step typecheck를 깨뜨린 실전 함정).
   - 구다리 선형 전이 불변 확인.
   - 새 마이그레이션을 추가했다면 순번·적용 여부를 summary에 명시(설계는 마이그 0 목표 — payload 재사용으로 피할 수 있으면 피하라).
3. `phases/onboarding-tutor/index.json` step 3 갱신(summary: 스테이지 등록 방식·이벤트·액션 시그니처·저장 위치·마이그 유무).

## 금지사항

- **구다리(structure)의 `fromState`/`enters`/`produces`를 바꾸지 마라.** 이유: 온보딩은 온디맨드(선형 밖). 구다리는 온보딩 여부와 무관하게 기존대로 진입해야 하고, 바꾸면 기존 런·자동흐름이 깨진다.
- **강제 게이트(온보딩을 안 하면 구다리 못 감)를 만들지 마라.** 이유: 최근 research-autoflow가 게이트를 줄인 방향과 정면 충돌. 온보딩은 건너뛸 수 있어야 한다.
- **callLLM 어댑터 우회 금지 · 셜록 검증 파이프라인 신설 금지**(step 1·2와 동일 이유).
- enum을 넓혔는데 `database.types.ts` 유니온을 안 넓히는 드리프트를 남기지 마라(실전 함정).
- 기존 테스트를 깨뜨리지 마라.
