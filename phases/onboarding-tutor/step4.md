# Step 4: structure-gold-injection

쏙이의 금맥(`OnboardingGold`)을 **구다리(structurer)에 조건부 주입**한다 — 금맥이 있으면 목차를 그 방향으로(헷갈린 지점 풀기·아하 훅·핵심 앵글·추론 수준), 없으면 **바이트 동일**(promptHash 보존·기존 픽스처 무회귀). target-persona 주입 패턴을 그대로 미러한다.

## 읽어야 할 파일

- `docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md` — 설계 단일 출처. 특히 "D. 금맥 → 구다리 주입"과 불변식.
- `docs/specs/2026-07-01-target-persona-design.md` — **조건부 주입 패턴의 검증된 선례.** "B. 전파" 절(있을 때만 주입·없으면 바이트 동일→promptHash 보존).
- `src/agents/structurer/prepare.ts` — 구다리 입력 조립. 이미 `getSelectedStagePayload("topic")`로 페르소나 등을 조건부 주입 중 — **같은 자리에 금맥 주입.**
- `src/agents/structurer/schema.ts` — `StructurerInput` 타입 + `STRUCTURER_SYSTEM`.
- `src/lib/onboarding/arc.ts`(step 0) — `OnboardingGold` 타입.
- step 3에서 금맥을 저장한 위치(run 스코프 payload) — 그 읽기 함수.

## 작업

### 1) `src/agents/structurer/prepare.ts`

- step 3이 저장한 **금맥 payload를 로드**(없을 수 있음 → `OnboardingGold | null`).
- `StructurerInput`에 optional 필드 추가:

```ts
onboardingGold?: {
  confusionPoints: string[];
  ahaPoints: string[];
  coreAngle: string;
  calibratedLevel: string;
};
```

- **금맥이 있을 때만** 세팅. 없으면 필드 자체를 넣지 마라(undefined) — target-persona처럼.

### 2) `STRUCTURER_SYSTEM` (schema.ts)

- 지시 추가: 금맥이 주어지면
  - `confusionPoints` → 목차에 **그 지점을 풀어주는 섹션**을 우선 배치(시청자도 헷갈릴 것).
  - `ahaPoints` → **훅/도입** 후보로 활용.
  - `coreAngle` → 영상의 **핵심 앵글**로 목차 전체를 정렬.
  - `calibratedLevel` → 그 수준에 맞춰 깊이 조절(기존 `audience_level` 지침과 병존·모순 없이).
  - 억지 금지: 금맥이 빈약하면 평소대로 구성.

### 3) 불변식 (반드시 준수)

- **금맥이 없으면 `StructurerInput`·`STRUCTURER_SYSTEM` 렌더 결과가 바이트 동일**이어야 한다 → promptHash 보존 → 기존 구다리 픽스처 안 깨짐. (조건부 주입: 금맥 있을 때만 문자열이 추가되고, 없을 때는 기존과 완전히 동일.)

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 tests/structureGoldInjection.test.ts 포함
npm run build
```

신규 `tests/structureGoldInjection.test.ts`:
- 금맥 있음 → `StructurerInput`/system에 confusion/aha/coreAngle/level 주입됨.
- **금맥 없음 → prepare 입력·system 문자열이 주입 전과 바이트 불변**(promptHash 보존 회귀 가드 — target-persona 테스트 미러).

## 검증 절차

1. AC 실행.
2. 아키텍처 체크리스트:
   - 조건부 주입 불변식(없으면 바이트 동일) 테스트로 증명됐는가.
   - 기존 `audience_level`/`target_persona` 주입과 **모순 없이 병존**하는가(같은 prepare 안).
   - 마이그레이션 0·새 의존성 0.
3. `phases/onboarding-tutor/index.json` step 4 갱신(summary: 주입 필드·불변식 테스트·structurer promptHash가 금맥 경로에서만 변함).

## 금지사항

- **금맥 없는 경로에서 `StructurerInput`/system을 한 바이트라도 바꾸지 마라.** 이유: promptHash가 변하면 금맥과 무관한 모든 기존 구다리 픽스처가 깨지고 재기록을 유발한다(조건부 주입 규칙).
- **`OnboardingGold` 타입을 재정의하지 마라.** step 0에서 import. 이유: 단일 출처.
- **구다리의 상태전이·스키마 구조(섹션 형식 등)를 바꾸지 마라.** 이유: 이 step은 입력/지침 주입만. 형식·상태는 기존 것.
- 죽은 import(추출·이동 후 남은 `type X`)를 남기지 마라 — `noUnusedLocals`가 없어 typecheck가 안 잡는 사각지대(실전 함정).
- 기존 테스트를 깨뜨리지 마라.
