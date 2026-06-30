# Step 1: structurer-persona (구다리 — 페르소나 전파)

타겟 페르소나 2단계. 선택된 주제의 `target_persona`(step 0이 payload에 보존)를 구다리
(structurer)가 읽어 **목차를 그 대상에 맞춰** 구성하게 한다. **조건부 주입**(없으면 무변경).
설계 전문: `docs/specs/2026-07-01-target-persona-design.md`(§B).

## 읽어야 할 파일

- `docs/specs/2026-07-01-target-persona-design.md` — §B, "안 깨지는 것" 불변식.
- `src/agents/structurer/prepare.ts` — `prepareStructurer`. **이미
  `getSelectedStagePayload(supa, runId, "topic")`로 주제를 읽어 `.title`을 쓴다**(line 18 근처).
  `StructurerInput` 인터페이스도 이 파일 상단에 있다(topic·title·structure_insights·
  structure_style_profile). 같은 payload에서 `target_persona`를 꺼내면 된다.
- `src/agents/structurer/schema.ts` — `STRUCTURER_SYSTEM`(구다리 시스템 프롬프트·line 63 근처).
- `src/pipeline/context.ts` — `getSelectedStagePayload`(편집본 `edited_payload` 우선 반환 —
  김짠부가 페르소나를 고치면 그 값이 여기로 온다).
- step 0 산출물: topic payload에 `target_persona` 보존됨.

## 작업

### 1. `structurer/prepare.ts` — 선택된 주제에서 `target_persona` 읽어 입력에 추가 (조건부)

- `getSelectedStagePayload("topic")` 결과 타입을 `{ title?: string; target_persona?: string }`로
  넓혀 `target_persona`를 함께 꺼낸다(별도 조회 불필요 — 같은 호출).
- `StructurerInput`에 `target_persona?: string`(옵셔널) 필드를 추가한다.
- **조건부 주입(불변식)**: `target_persona`가 있을 때만 `input.target_persona`를 세팅한다.
  없으면 input을 건드리지 않는다 → persona 없는 옛 주제는 input 바이트 동일 → promptHash 보존 →
  기존 구다리 픽스처 안 깨짐. (`structure_style_profile`의 조건부 주입 패턴과 동일하게.)

### 2. `structurer/schema.ts` — `STRUCTURER_SYSTEM`에 페르소나 지시 추가

- "입력에 `target_persona`가 주어지면 **목차를 그 대상에 맞춰** 구성한다"는 지시 추가.
  예시 톤: 2030 사회초년생 → 기초·통장 쪼개기부터 / 자녀계좌 부모 → 증여세·절차부터.
- **억지 금지** 명시: 페르소나가 없으면 평소대로. 페르소나가 있어도 주제·근거를 왜곡해 끼워맞추지
  말 것(자연스러운 범위에서 대상 맞춤).

## 작업 시 주의 (rules.md 함정)

- 조건부 주입을 어기고 persona 없을 때도 input/system을 바꾸면 promptHash가 변해 기존 픽스처가
  전부 깨진다. **반드시 "있을 때만"** 분기.

## 테스트

`structurer/prepare.ts` 테스트(없으면 신규, 있으면 확장):

- persona가 선택 payload에 있으면 `input.target_persona`에 그 값이 실린다.
- persona가 **없으면** `input`에 `target_persona` 키가 **없다**(바이트 불변 = 픽스처 해시 보존
  회귀 가드). `getSelectedStagePayload`는 fake supa나 모듈 모킹으로 주입.
- (선택) `STRUCTURER_SYSTEM`이 `target_persona` 지시 문구를 `toContain`.

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과
npm run build       # next build, 에러 0
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - 구다리 prepare가 같은 `getSelectedStagePayload("topic")`에서 persona를 꺼내는가(별도 조회 X)?
   - **조건부 주입**: persona 없을 때 input/system 불변(픽스처 해시 보존)인가?
   - `STRUCTURER_SYSTEM`에 페르소나 맞춤 + 억지 금지 지시가 들어갔는가?
   - 마이그레이션 0인가?
3. 결과 반영(step 1): 성공 → `completed`+`summary`(짠펜도 같은 방식으로 topic payload에서 persona를
   읽어야 함을 명시) / 3회 실패 → `error` / 사람 개입 → `blocked`.

## 금지사항

- persona가 없을 때 input/system을 바꾸지 마라. 이유: promptHash 변동 → 기존 구다리 픽스처 전멸.
- 새 조회·새 테이블·마이그레이션을 만들지 마라. 이유: 같은 `getSelectedStagePayload("topic")`로 충분.
- 짠펜·UI·촉이를 건드리지 마라. 이유: 이 step은 구다리 전파만.
- 기존 테스트를 깨뜨리지 마라.
