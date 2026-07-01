# Step 0: onboarding-arc-schema

새 크루원 **쏙이(onboarder)** — 구다리(구성) 진입 전, "궁금증 아크" 퀴즈로 김짠부를 주제에 올려놓고, 그 부산물(금맥)을 구다리로 넘기는 온보딩 튜터. 이 step은 그 **순수 데이터 모델 + 순수 헬퍼**만 만든다. 의존성 0·다른 레이어 안 건드림.

## 읽어야 할 파일

먼저 아래를 읽고 아키텍처·설계 의도·컨벤션을 파악하라:

- `docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md` — **이 기능의 전체 설계(단일 출처).** 특히 "데이터 모델" 절.
- `ARCHITECTURE.md` — 디렉토리 계층 지도.
- `src/lib/research/evidence.ts` — 순수 헬퍼 + `src/lib/**`에 두는 컨벤션의 최근 예시(참고).
- `src/agents/comparator/schema.ts` — 순수 normalize 헬퍼 + loose JSON 스키마 패턴(참고).
- `tests/researchEvidence.test.ts` — 순수 헬퍼 테스트 스타일(참고).

## 작업

두 파일을 만든다.

### 1) `src/agents/onboarder/schema.ts` — 타입 + JSON 스키마

설계 문서의 데이터 모델을 그대로 구현:

```ts
export type ArcQuestion = {
  prompt: string;
  choices: string[];                       // 2~4지선다
  answerIdx: number;                        // choices 인덱스
  difficulty: "basic" | "mid" | "deep";
  hookMode: "reversal" | "practical";      // 위험→reversal, 혜택→practical
  ahaReveal: string;
  unverifiedNumbers?: string[];
  cliffhanger?: string;
};
export type OnboardingArc = { questions: ArcQuestion[]; coreAngle: string };

export type OnboarderInput = {
  topic: string;
  transcript?: string;
  videoFacts?: string[];
  referenceTitle?: string;
};

export type OnboardingGold = {
  confusionPoints: string[];
  ahaPoints: string[];
  coreAngle: string;
  calibratedLevel: string;
};
```

- `ONBOARDER_SCHEMA`: forced tool_use용 JSON 스키마(comparator/schema.ts의 loose 패턴 미러). `questions`는 배열, 각 항목은 위 필드. **`required`에 빈 배열을 넣지 마라. 이유: forced tool_use에서 빈 배열 required가 스키마 검증을 깨뜨린 실전 함정이 있다** — required는 string/number 필드 위주로, 배열은 minItems로 통제.
- `normalizeArc(raw): OnboardingArc | null` 순수 헬퍼 — LLM 원출력 방어: `questions`가 1개 미만이면 null 드랍, `answerIdx`가 choices 범위 밖이면 그 문항 드랍, `difficulty`/`hookMode`가 enum 아니면 그 문항 드랍(stray 흡수), `coreAngle` 없으면 "". **throw 0**(comparator normalizeComparison 미러).

### 2) `src/lib/onboarding/arc.ts` — 순수 판정·추출 헬퍼

```ts
// 김짠부의 응답(각 문항에 고른 인덱스) — 클라에서 수집해 넘어옴
export type ArcAnswer = { questionIdx: number; chosenIdx: number };

// 어려운 문항을 맞혔나로 수준 추론 → audience_level 문자열
export function inferLevel(arc: OnboardingArc, answers: ArcAnswer[]): string;

// 응답에서 금맥 추출(순수) → 구다리로 주입
export function extractGold(arc: OnboardingArc, answers: ArcAnswer[]): OnboardingGold;
```

- `inferLevel`: deep 문항 정답률이 높으면 "중급"/"고급", basic도 틀리면 "입문" 등으로 매핑. **매핑 규칙은 재량**이되, 데이터 없으면(응답 0) 중립값 반환·크래시 0. 기존 `audience_level` 값 어휘(입문/초급/중급/고급)와 정렬 — `src/agents/topic_scout/schema.ts`에서 실제 어휘를 확인해 맞춰라.
- `extractGold`:
  - `confusionPoints` = **틀린 문항의 prompt(또는 그 개념)** — 시청자도 헷갈릴 지점.
  - `ahaPoints` = 틀렸거나 놀란 문항의 `ahaReveal` — 훅 후보.
  - `coreAngle` = `arc.coreAngle` 그대로.
  - `calibratedLevel` = `inferLevel(arc, answers)`.
  - **순수·throw 0.** 응답이 빈 배열이어도 안전(confusion/aha 빈 배열, coreAngle은 보존).

## Acceptance Criteria

```bash
npm run typecheck   # 컴파일 에러 없음
npm test            # 신규 tests/onboardingArc.test.ts 포함 전부 통과
npm run build       # 빌드 성공
```

신규 `tests/onboardingArc.test.ts` 작성:
- `normalizeArc`: 정상 통과 / questions<1 → null / answerIdx 범위밖 문항 드랍 / enum 아닌 문항 드랍.
- `inferLevel`: deep 맞힘 → 상위 수준, basic 틀림 → 하위 수준, 응답 0 → 중립.
- `extractGold`: 틀린 문항이 confusion에, coreAngle 보존, 빈 응답 안전.

## 검증 절차

1. 위 AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - `ARCHITECTURE.md` 디렉토리 구조를 따르는가(순수 헬퍼는 `src/lib/**`, 에이전트 스키마는 `src/agents/onboarder/`).
   - 새 의존성·마이그레이션 추가 안 했는가(이 step은 순수 코드만).
   - CLAUDE.md 보안 규칙 위반 없는가.
3. 결과에 따라 `phases/onboarding-tutor/index.json`의 step 0을 갱신:
   - 성공 → `"completed"` + `"summary"`(생성 파일·헬퍼 시그니처·테스트 수).
   - 3회 시도 실패 → `"error"` + `"error_message"`.

## 금지사항

- **다른 레이어를 건드리지 마라**(roles.ts·stages.ts·prepare·UI·structurer). 이유: 이 step은 순수 모델/헬퍼만. 배선·에이전트·UI는 step 1~5.
- **순수 헬퍼를 컴포넌트 파일에 두지 마라.** 이유: vitest에 `@/` alias가 없어 컴포넌트를 테스트가 import하면 내부 `@/...`까지 끌려와 스위트 전체가 로드 실패한다(실전 함정). 반드시 `src/lib/onboarding/`에 export.
- **JSON 스키마 `required`에 빈 배열 필드를 넣지 마라.** 이유: forced tool_use 검증을 깨뜨린다(실전 함정).
- **normalize/헬퍼에서 throw 하지 마라.** 이유: LLM 원출력·빈 응답 방어는 null/기본값 드랍으로(comparator 패턴).
- 기존 테스트를 깨뜨리지 마라.
