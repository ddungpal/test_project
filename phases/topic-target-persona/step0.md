# Step 0: persona-generate (촉이 — target_persona 생성)

타겟 페르소나 기능의 1단계. 촉이(topic_scout)가 주제 후보마다 **한 줄 타겟 페르소나**
(`target_persona`)를 생성하고, 그것이 후보 payload에 실려 선택 시 저장되게 한다.
설계 전문: `docs/specs/2026-07-01-target-persona-design.md`(§A 생성).

## 배경 (왜 이 작업인가)

콘텐츠에 "누구를 위한 영상인지"(예: "2030 사회초년생, 첫 월급 목돈 굴리기 막막한 사람")가
없어 스크립트가 구체화되지 못한다. 기존 `audience_level`(전문성 수준)·`audience_need`(욕구 한 줄)는
있으나 **대상 사람의 정의(페르소나)**가 아니다. 이 step은 페르소나를 **생성·payload 보존**까지만
한다(다운스트림 전파·UI는 step 1~3).

## 읽어야 할 파일

- `docs/specs/2026-07-01-target-persona-design.md` — §A, 불변식.
- `src/agents/topic_scout/schema.ts` — `TopicCandidateOut` 타입 + `TOPIC_SCOUT_SCHEMA`
  (candidate `required`/`properties`에 audience_level/audience_need가 어떻게 들어가 있는지).
  같은 파일에 `TOPIC_SCOUT_SYSTEM`(촉이 시스템 프롬프트)도 있다.
- `src/agents/topic_scout/stage.ts` — `toCandidates`가 LLM 출력을 proposal candidate로 매핑한다.
  **현재 `payload: { title, audience_level, audience_need }`** (line 18 근처) — 전파의 핵심 배선.

## 작업

### 1. `topic_scout/schema.ts` — 스키마에 `target_persona` 추가

- `TopicCandidateOut` 인터페이스에 `target_persona: string` 추가(audience_need 옆).
- `TOPIC_SCOUT_SCHEMA`의 candidate `required` 배열에 `"target_persona"` 추가 +
  `properties.target_persona = { type: "string", minLength: 1 }`.
  (audience_need와 **동일 등급** — required string. 배열이 아니므로 "빈 배열 required 금지" 함정
  비해당. forced tool_use에서 required string은 안전.)

### 2. `topic_scout/schema.ts` — `TOPIC_SCOUT_SYSTEM`에 생성 지시

페르소나를 후보마다 한 줄로 쓰라는 지시 추가. 반드시 포함할 내용:

- 형태: **누구 + 상황 + 막막함/욕구**를 한 문장으로.
- 예시 2개(그대로 또는 유사하게):
  `"2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람"` /
  `"자녀계좌 만들려는 30·40대 부모, 증여세·절차 헷갈리는 사람"`.
- `audience_need`와의 **차이 명시**: `target_persona`=대상 *사람*의 정의(누구), `audience_need`=그
  사람의 *욕구* 한 줄. 둘 다 채운다(중복 아님).

### 3. `topic_scout/stage.ts` — `toCandidates` payload에 `target_persona` 추가 (핵심 배선)

현재:
```ts
payload: { title: c.title, audience_level: c.audience_level, audience_need: c.audience_need },
```
→ `target_persona: c.target_persona`를 payload에 추가한다. **이 줄이 없으면 LLM이 생성해도
payload에 안 실려 step 1~3의 전파가 끊긴다.** audience_level/need가 이미 이 방식으로 보존된다.

### 테스트

- `TOPIC_SCOUT_SCHEMA`가 `target_persona`를 candidate required로 요구하는지(스키마 객체 단언:
  candidate.required에 `"target_persona"` 포함, properties에 정의됨).
- `toCandidates`가 출력의 `target_persona`를 payload에 보존하는지(가짜 출력 → 매핑 결과 payload에
  `target_persona` 존재 + audience_level/need/title도 그대로). 기존 topic_scout 테스트 패턴을 따른다.

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과(기존 + 신규)
npm run build       # next build, 에러 0
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - `target_persona`가 schema required + properties(minLength 1)에 들어갔는가?
   - `TOPIC_SCOUT_SYSTEM`에 페르소나 생성 지시 + 예시 2개 + audience_need와의 차이가 들어갔는가?
   - `toCandidates` payload에 `target_persona`가 보존되는가? (핵심 — 빠지면 전파 끊김)
   - 기존 `audience_level`/`audience_need` 생성·payload 보존은 **불변**인가?
   - 마이그레이션 0인가(JSON payload만)?
3. 결과 반영(`phases/topic-target-persona/index.json` step 0): 성공 → `completed`+`summary`(다음
   step이 알 것: persona가 topic payload에 보존됨 → `getSelectedStagePayload("topic")`로 읽기 가능) /
   3회 실패 → `error`+`error_message` / 사람 개입 → `blocked`+`blocked_reason`.

## 금지사항

- `toCandidates` payload에 `target_persona`를 빠뜨리지 마라. 이유: 생성돼도 선택 payload에 안 실려
  step 1~3 전파가 전부 무력화된다.
- 기존 `audience_level`/`audience_need`를 제거·변경하지 마라(병존). 이유: 전문성 축과 사람 축은 다른 축.
- 마이그레이션·새 컬럼을 만들지 마라. 이유: persona는 proposal candidates(JSON) payload 안.
- UI·구다리·짠펜은 건드리지 마라. 이유: 이 step은 생성·payload 보존만. 전파/표시는 step 1~3.
- 기존 테스트를 깨뜨리지 마라.
- 참고: topic_scout promptHash 변경 → 다음 라이브 런에서 픽스처 자동 재기록(claude-p $0). AC와 무관.
