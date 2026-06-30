# Step 2: scribe-persona (짠펜 — 페르소나 전파)

타겟 페르소나 3단계. 선택된 주제의 `target_persona`를 짠펜(scribe)이 읽어 **그 대상에게 직접
말 걸기·예시·어휘**를 맞추게 한다. **조건부 주입**(없으면 무변경). 말투(tone) 규칙은 불변.
설계 전문: `docs/specs/2026-07-01-target-persona-design.md`(§B).

## 읽어야 할 파일

- `docs/specs/2026-07-01-target-persona-design.md` — §B, "안 깨지는 것" 불변식.
- `src/pipeline/scriptCell.ts` — 짠펜 입력 조립. 현재
  `getSelectedStagePayload(supa, runId, "structure")`로 outline을 읽고(line 54 근처),
  `scribeStep(llm, runId, { tone, outline, facts, assets })`를 호출한다(line 105 근처).
  **현재 topic payload는 안 읽는다** → 여기에 `getSelectedStagePayload("topic")` 한 줄을 더한다.
- `src/agents/scribe/step.ts` — `scribeStep(llm, runId, input: { tone, outline, facts, assets })`.
  input 타입에 `target_persona`를 더해 SCRIBE 입력에 포함시킨다.
- `src/agents/scribe/schema.ts` — `SCRIBE_SYSTEM`(짠펜 시스템 프롬프트). 말투·형식·money-safety
  지시가 여기 있다.
- `src/pipeline/context.ts` — `getSelectedStagePayload`(편집본 `edited_payload` 우선).
- step 0·1 산출물: topic payload에 `target_persona` 보존(step 0), 구다리가 같은 방식으로 읽음(step 1).

## 작업

### 1. `scriptCell.ts` — 선택된 주제에서 `target_persona`를 읽어 짠펜에 전달 (조건부)

- `getSelectedStagePayload(supa, runId, "topic")` 호출을 추가하고 `target_persona`를 꺼낸다
  (타입 `{ target_persona?: string }`).
- `scribeStep(...)` 호출의 input 객체에 `target_persona`를 **있을 때만** 포함한다(없으면 키 미포함).
- outline/facts/assets/tone 조립·검증·lineage·money 게이트는 **불변**(이 step의 diff는 topic 로드
  + scribeStep input 전달에 한정).

### 2. `scribe/step.ts` — input 타입에 `target_persona` 추가

- `input: { tone, outline, facts, assets }` → `target_persona?: string`를 더한다.
- SCRIBE 호출에 넘기는 입력 객체에 `target_persona`를 **있을 때만** 포함(없으면 미포함 = promptHash
  보존).

### 3. `scribe/schema.ts` — `SCRIBE_SYSTEM`에 페르소나 지시 추가

- "입력에 `target_persona`가 주어지면 **그 대상에게 직접 말 걸고** 예시·어휘를 그 맥락에 맞춘다"는
  지시 추가(2030 사회초년생 → 첫 월급·사회초년 맥락 / 부모 → 자녀·증여 맥락).
- **말투(tone) 규칙은 불변** 명시: persona는 *대상 맥락*만 더한다. tone 사양(vocab·persona·
  phrases·banned)·money-safety·형식 블록 규칙을 덮어쓰지 않는다.

## 작업 시 주의 (rules.md 함정)

- **조건부 주입**: persona 없을 때 scribeStep input·SCRIBE_SYSTEM이 바이트 동일해야 한다 →
  promptHash 보존 → 기존 짠펜 픽스처 안 깨짐. "있을 때만" 분기 필수.
- `scribe/schema.ts`의 `SCRIBE_SYSTEM`은 상수 문자열이라, 지시를 *항상* 추가하면(런타임 조건 없이)
  promptHash가 변한다. SYSTEM 문구 추가는 system을 **입력에 persona가 있을 때만 덧붙이는 방식**으로
  하거나(append 헬퍼), 짠펜이 persona 부재 시 무시하도록 하되 **input 미포함이 핵심**이다 —
  구다리(step 1)·`appendStructureStyle`/`structure_style_profile`의 조건부 주입 패턴을 그대로 따른다.
  (즉 SYSTEM 상수 자체를 늘리기보다, persona 있을 때만 system에 한 줄 append하는 방식이 픽스처 보존에
  안전하다. 구현 방식은 재량이되 **persona 없는 런의 promptHash 불변**이 검증 기준이다.)

## 테스트

- persona가 선택 payload에 있으면 scribeStep에 넘어가는 input에 `target_persona`가 포함된다.
- persona가 **없으면** input에 `target_persona` 키가 없다(픽스처 해시 보존 회귀 가드).
- (가능하면) persona 유무에 따라 짠펜에 들어가는 system/input이 바이트 단위로 갈리는지(없을 때 기존과
  동일) 잠근다. fake llm/모킹으로 scribeStep 입력을 캡처.

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과
npm run build       # next build, 에러 0
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - `scriptCell.ts`가 topic payload에서 persona를 읽어 scribeStep에 전달하는가?
   - **조건부 주입**: persona 없을 때 짠펜 input·system 불변(픽스처 해시 보존)인가?
   - `SCRIBE_SYSTEM` 페르소나 지시가 **말투·money-safety·형식 규칙을 덮지 않는가**?
   - outline/facts/assets/lineage/money 게이트 무변경인가? 마이그레이션 0인가?
3. 결과 반영(step 2): 성공 → `completed`+`summary`(persona가 구다리·짠펜 양쪽에 전파됨 — 남은 건
   UI 표시·편집) / 3회 실패 → `error` / 사람 개입 → `blocked`.

## 금지사항

- persona가 없을 때 짠펜 input/system을 바꾸지 마라. 이유: promptHash 변동 → 기존 짠펜 픽스처 전멸.
- 말투(tone)·money-safety·형식 블록·lineage 규칙을 persona 지시로 덮어쓰지 마라. 이유: persona는
  대상 맥락만 더하는 보조 신호. 검증·말투 무결성은 불변식.
- outline/facts/assets 조립 로직을 바꾸지 마라(topic 로드 + input 전달만). 마이그레이션 금지.
- 촉이·구다리·UI를 건드리지 마라. 이유: 이 step은 짠펜 전파만.
- 기존 테스트를 깨뜨리지 마라.
