# Step 0: scribe-length-directive

## 배경 (자기완결 — 이 phase의 목적)

짠펜(scribe)이 생성하는 대본이 **너무 짧다**. 진단(systematic-debugging) 결과:

- 최근 완성 대본(`배당` 런)은 프로즈 **3,967자 ≈ 5.8분**. 기존 김짠부 스크립트 8편 평균은 **8,596자 ≈ 12.5분**(발화속도 실측 ~689자/분, 8편 편차 ±4%). → **평균의 46%, 절반 미만.**
- **근본 원인 ①(주)**: `SCRIBE_SYSTEM`/`SCRIBE_SCHEMA` 어디에도 **목표 분량/깊이 지시가 없다**(제약은 `minItems:3`·`minLength:1`뿐). LLM이 "완결" 싶으면 세그먼트당 ~250자로 짧게 끝낸다. 기준이 될 기존 스크립트는 전부 imported(실제 영상)라 생성 파이프라인이 그 길이에 보정된 적이 없다.
- **근본 원인 ②(숨은 천장)**: `scribe/step.ts`의 full-mode 호출이 `maxTokens: 8192`. 현재 3,967자(≈5,700토큰)는 이 안이라 안 걸리지만, **목표를 12분(≈8,500자≈11,000토큰+)으로 올리면 이 캡에서 잘려 JSON이 truncate → 실패**. 캡을 같이 올려야 한다.
- **구성(구다리)은 정상** — outline이 8개 섹션으로 주제를 충실히 커버. 문제는 섹션 수가 아니라 **섹션당 전개 깊이**(기존 ~1,500자/섹션 vs 짠펜 ~500자/섹션 = 약 1/3).

세그먼트 **품질은 정상**(김짠부 목소리·듀얼훅·비유·공감 다 살아있음) — 오직 "양"만 문제다.

## 읽어야 할 파일

- `src/agents/scribe/schema.ts` — `SCRIBE_SYSTEM`(본문 프롬프트)·`SCRIBE_SCHEMA`·`SCRIBE_PERSONA_DIRECTIVE`·`SCRIBE_SEGMENT_DIRECTIVE`(조건부 append 상수 패턴 정독). **최근 추가된 `■ 중복 금지`·`■ 자연스러운 연결` 규칙을 반드시 읽어라** — 새 길이 지시가 이것과 충돌하면 안 된다.
- `src/agents/scribe/step.ts` — `scribeStep`(full 모드·`maxTokens: 8192`)와 `scribeSegmentStep`(단일 세그먼트 재생성·`maxTokens: 4096`). 두 모드가 system을 어떻게 조립하는지(persona/segment directive append) 확인.
- 기존 짠펜 회귀 테스트(`tests/scribeRedundancyFlow.test.ts`·`tests/scribeVoiceEmpathy.test.ts`) — **프롬프트 문구 존재를 잠그는 회귀 가드 패턴**을 그대로 미러해 새 테스트를 쓴다.
- `.claude/rules/rules.md` — 짠펜 관련 규칙(블록 세그먼트 kind별 검사 등).

## 작업

### 1) 길이·깊이 지시 상수 추가 (`schema.ts`)

`SCRIBE_LENGTH_DIRECTIVE`(신규 export 상수)를 추가한다. **`SCRIBE_SYSTEM` 본문은 건드리지 않는다**(persona/segment directive 상수 패턴과 동일 — 별도 상수로). 내용 요지(문구는 재량, 아래 의도는 필수):

- **목표 분량**: 전체 대본은 약 **10~15분(대략 7,000~10,000자)** 분량을 목표로 한다. 최소 7,000자(약 10분) 이상을 지향한다.
- **깊이로 채운다(핵심)**: 분량은 **군더더기·반복이 아니라 각 포인트를 실제로 더 깊이 파고들어** 채운다. outline의 각 섹션을 김짠부가 실제 영상에서 그 꼭지를 다루듯 충분히 전개한다 — 개념 하나 던지고 넘어가지 말고 구체적 수치·상황·예시·되짚기 질문으로 풀어낸다.
- **중복 금지 규칙과 양립(필수 명시)**: 같은 말을 다른 말로 되풀이해 길이를 늘리지 마라(기존 `■ 중복 금지` 유지). 늘리는 방식은 "새 정보·한 걸음 더", "구체 예시 추가", "시청자 상황 묘사"이지 재진술이 아니다.
- **억지 금지**: 내용이 없는데 분량을 위해 늘어지지 마라. 자연스러운 전개로 목표에 닿게 한다.

### 2) full 모드에만 배선 + 토큰 상한 상향 (`step.ts`)

- `scribeStep`(full 모드)에서만 `SCRIBE_LENGTH_DIRECTIVE`를 system에 **항상** append한다. 조립 순서 예: `SCRIBE_SYSTEM` + `SCRIBE_LENGTH_DIRECTIVE` (+ persona 있으면 `SCRIBE_PERSONA_DIRECTIVE`).
- **`scribeSegmentStep`(단일 세그먼트 재생성 모드)에는 길이 지시를 append하지 마라.** 이유: 그 모드는 세그먼트 1개만 다시 쓰는 것이라 "10분 분량" 목표가 걸리면 한 세그먼트가 비정상적으로 부풀어 앞뒤 흐름을 깬다.
- `scribeStep`의 `maxTokens: 8192` → **`16384`** 로 올린다(풀 길이 헤드룸 — 한국어 8,500자+JSON 오버헤드가 8192를 넘김). `scribeSegmentStep`의 `maxTokens: 4096`은 **그대로** 둔다.

### 3) 회귀 가드 테스트 (신규)

`tests/scribeLengthTarget.test.ts`(또는 기존 스위트 확장) — 다음을 잠근다:
- `SCRIBE_LENGTH_DIRECTIVE`에 목표 분량/깊이 문구가 존재.
- **full 모드 system에는 길이 지시가 포함되고, 단일 세그먼트 모드 system에는 포함되지 않는다**(스코핑 불변식). step.ts에서 system을 조립하는 경로를 검사하거나, 두 모드가 쓰는 상수 조합을 검증.

**핵심 규칙:**
- `SCRIBE_SYSTEM` 본문 문자열을 늘리지 마라(별도 상수로). 이유: 단일 세그먼트 모드·persona 조건부 조립이 `SCRIBE_SYSTEM` 바이트에 의존하지 않게, 그리고 스코핑을 명확히 하기 위해.
- full 모드 promptHash는 바뀐다(길이 지시 추가) → 짠펜 골든/replay fixture가 재기록된다. **이건 의도된 것**(기존 짠펜 프롬프트 강화 때와 동일). 단일 세그먼트 모드 promptHash는 **불변**이어야 한다(길이 지시 미포함).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

- 빌드가 stale `.next` 캐시(`PageNotFoundError`/chunk `MODULE_NOT_FOUND`)로 깨지면 `rm -rf .next` 후 재판별.
- 실제 "대본이 길어졌는지"는 라이브 짠펜 재생성이라 AC가 아니다(하네스는 LLM 라이브 호출을 결정적 검증에 안 씀). 문구 존재·스코핑은 회귀 테스트로, 나머지는 typecheck/build로 검증. 라이브 길이 검증은 머지 후 별도.

## 검증 절차

1. AC 실행.
2. 스코핑 확인: full 모드 system에 길이 지시 포함 / 단일 세그먼트 모드 미포함. `git diff`가 `scribe/schema.ts`·`scribe/step.ts`·신규 테스트만 잡히는지.
3. `git status`로 범위 외 untracked(fixtures replay 등) 제외.
4. `phases/script-length-target/index.json`의 step 0을 갱신(성공 → completed + summary / 3회 실패 → error).

## 금지사항

- `SCRIBE_SYSTEM` 본문·`SCRIBE_SCHEMA`·`SCRIBE_SEGMENT_DIRECTIVE`·`SCRIBE_PERSONA_DIRECTIVE`를 늘리거나 바꾸지 마라(길이 지시는 신규 별도 상수). 이유: 스코핑·회귀 최소화.
- `scribeSegmentStep`(단일 세그먼트)에 길이 지시나 maxTokens 상향을 적용하지 마라. 이유: 한 세그먼트만 비정상적으로 부풀어 흐름이 깨진다.
- 구조(structurer)·outline·리서치·tone 관련 파일을 건드리지 마라. 이유: 근본 원인은 짠펜 stage(전개 깊이 + 토큰 캡)이지 구성이 아니다.
- 마이그레이션·새 의존성 추가 금지. 기존 테스트를 깨뜨리지 마라.
