# Step 1: onboarder-agent

쏙이(onboarder) LLM 에이전트를 만든다 — `OnboarderInput`을 받아 "궁금증 아크"(`OnboardingArc`)를 한 번에 생성. 인터랙티브 분기 엔진 없음(고정 아크). step 0의 스키마·타입을 소비한다.

## 읽어야 할 파일

- `docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md` — 설계 단일 출처. 특히 "A. 생성 — 쏙이" 절과 결정(듀얼 훅·프리테스트·미검증 플래그).
- `src/agents/onboarder/schema.ts` — **step 0 산출물**(`OnboardingArc`·`OnboarderInput`·`ONBOARDER_SCHEMA`·`normalizeArc`).
- `src/agents/roles.ts` — 크루 role 레지스트리(촉이·비교가·분기가 정의 방식).
- `src/agents/comparator/step.ts` — LLM 1콜 에이전트 step 패턴(schema·maxTokens·callLLM 어댑터) **미러 대상**.
- `src/agents/comparator/schema.ts` 상단의 `COMPARATOR_SYSTEM` — money-safety SYSTEM 작성 스타일(미검증=플래그·억지 금지) 참고.
- `tests/copyQuestionRegister.test.ts` — SYSTEM 규칙을 `toContain`으로 잠그는 회귀 가드 스타일 참고.

## 작업

### 1) `src/agents/roles.ts`

`onboarder` role 추가:

```ts
onboarder: { roleId: "onboarder", name: "쏙이", defaultModel: "opus", tools: [] },
```

- `tools: []` — 쏙이는 자체 웹검색 안 함(입력은 step 2 prepare가 자막·사실로 공급). 이유: §10 도구 경계·프롬프트 결정성.

### 2) `src/agents/onboarder/step.ts` — LLM 콜

comparator/step.ts 미러:
- `onboarderStep(input: OnboarderInput, ...deps): Promise<OnboardingArc>` — `callLLM` 어댑터로 `ONBOARDER_SCHEMA` forced tool_use 호출 → `normalizeArc`로 방어 → 반환.
- `maxTokens`는 아크(문항 3~6개 + 해설)를 담을 여유값(comparator 4096 참고, 필요시 상향).
- fixtures 리플레이 경로를 그대로 타야 함(callLLM 어댑터 사용 = 개발 $0).

### 3) `ONBOARDER_SYSTEM` (step.ts 또는 schema.ts에, 프로젝트 관례 따라)

설계의 결정을 SYSTEM에 박는다 — **아래는 반드시 포함(핵심 규칙)**:

1. **듀얼 훅 (사실 성격이 결정)**: 위험·손해 사실 → `hookMode:"reversal"`("좋아 보이는데 사실 손해" 반전). 숨은 혜택 사실 → `hookMode:"practical"`("이거 알면 개이득" 실용템). 각 문항이 어느 쪽인지 hookMode로 표기.
2. **클리프행어 아크**: 문항은 랜덤 나열이 아니라 **한 편의 이야기**. 각 `ahaReveal`이 다음 문항을 여는 `cliffhanger`로 이어져 "풀면서 관심이 계속 가게" 만든다. 마지막 문항의 아하가 `coreAngle`(영상 핵심 앵글=갈림길)로 수렴.
3. **프리테스트 프레이밍**: "시험"이 아니라 "호기심 체크". 직관적 답이 틀리는(반전) 문항을 환영 — 틀려도 좋다는 톤.
4. **난이도 태그**: 각 문항 `difficulty`(basic/mid/deep)를 정직하게 — 사후 수준 추론에 쓰인다.
5. **money-safety**: 아하는 입력 `transcript`·`videoFacts`에 근거. **검증 안 된 수치는 단정하지 말고 `unverifiedNumbers`에 넣어라**(진짜 팩트체크는 나중에 셜록). 억지 문항·날조 금지 — 소재 부족하면 문항 수를 줄여라.
6. **말투**: 김짠부 채널 톤(직설·단정). 정중-탐문 종결(~까요?/~셨나요?) 금지는 이 채널 공통 규칙 — `src/agents/hook_maker` 계열 SYSTEM의 어투 규칙을 확인해 정렬. (단, 문항 prompt는 질문형이 자연스러우므로 **도발·단정형 질문**은 허용.)

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 tests/onboarderAgent.test.ts 포함
npm run build
```

신규 `tests/onboarderAgent.test.ts`:
- `ONBOARDER_SYSTEM`이 핵심 규칙을 담는지 `toContain` 잠금(듀얼훅 reversal/practical·클리프행어·미검증/unverifiedNumbers·억지 금지).
- role `onboarder`가 roles 레지스트리에 존재하고 `name:"쏙이"`.

## 검증 절차

1. AC 실행.
2. 아키텍처 체크리스트: roles.ts 컨벤션 준수 · comparator 골격과 정합 · callLLM 어댑터 경유(직접 SDK 호출 금지) · 새 의존성 0.
3. `phases/onboarding-tutor/index.json` step 1 갱신(성공 → completed+summary: role·step 시그니처·SYSTEM 핵심규칙·promptHash 신규).

## 금지사항

- **step 0의 타입·`normalizeArc`를 재정의하지 마라.** import해서 써라. 이유: 단일 출처.
- **prepare(입력 수집)·스테이지 등록·UI를 건드리지 마라.** 이유: 각각 step 2·3·5. 이 step은 에이전트 생성만.
- **callLLM 어댑터를 우회해 Anthropic SDK를 직접 호출하지 마라.** 이유: 개발=claude-p $0 / 운영=API 스위치가 어댑터에 있음(비용·픽스처 리플레이 깨짐).
- **JSON 스키마 required에 빈 배열 넣지 마라**(step 0과 동일 함정).
- 기존 테스트를 깨뜨리지 마라.
