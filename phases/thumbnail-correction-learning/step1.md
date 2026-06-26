# Step 1: correction-diff (생성↔이상 카피 차이 분석 — LLM)

**교정쌍의 생성 카피와 이상 카피를 LLM이 비교해 구조화된 '차이'를 산출한다(사용자에게 보여줄 분석).** 저장은 step0, 학습 합류는 step2, UI는 step3.

## 배경 (왜 이렇게)
- 사용자 요구: "차이점을 **분석**하고 학습." 학습 자체는 재학습 루프가 winner↔loser 차이를 patterns/banned로 뽑지만(step2), 그건 배치 단위다.
- 이 step은 **교정쌍 1건의 즉각적·구조화된 diff**를 만들어 사용자가 "왜 달랐나"를 바로 본다(교정 도구의 핵심 피드백). 결과는 `thumbnail_corrections.diff`(jsonb)에 저장(step0 컬럼).
- 기존 LLM 호출 규약(callLLM·schema·claude-p $0 record) 재사용. 방금 고친 fold/record-after-validate 혜택 그대로.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md` — 계층·비용($0).
- `src/llm/callLLM.ts` · `src/llm/types.ts` — `callLLM<T>(req, deps)`·`roleId`·`schema`·`CostGuard`. (style_extractor·thumbnail_maker가 쓰는 방식.)
- `src/agents/style_extractor/schema.ts` — 출력 스키마 작성 규약(additionalProperties:false·빈배열 가능 필드는 required 제외 — schema.ts:7-9 주석 **반드시 준수**).
- `scripts/learn-ab-style.ts` — `callLLM` 호출 형태(368)·`CostGuard`/`InMemoryCostLedger` 사용·system 프롬프트 스타일.
- step0 산출물 — `thumbnail_corrections` 테이블·`saveCorrection`·payload 모양.
- `src/llm/roles.ts` — roleId→model 매핑(새 role 등록 위치·기본 모델).

## 작업
### 1) 차이 분석 role + 스키마 (`src/agents/correction_diff/schema.ts` 신규)
- `roleId: "correction_diff"`. `src/llm/roles.ts`에 등록(모델은 기본 tier·과하지 않게).
- 출력 스키마 `CORRECTION_DIFF_SCHEMA`(구조화 diff). 예(빈배열 가능 필드는 required 제외):
  ```ts
  interface CorrectionDiff {
    summary: string;                 // 한 줄 총평(무엇이 가장 달랐나)
    tone: string;                    // 어투 차이(예: 반말→존댓말, 교육조→단정)
    hook_angle: string;              // 후킹 각도 차이(손익/공포/호기심/숫자 등)
    length_density: string;          // 길이·압축 차이
    added: string[];                 // 이상이 더 넣은 요소(강조어·수치·대상 등)
    removed: string[];               // 생성이 과했던/이상이 뺀 요소
    actionable_rules: string[];      // 다음 생성에 적용할 교훈(존댓말 등 — 일반화 가능한 규칙)
  }
  ```
- SYSTEM 프롬프트: "너는 김짠부 썸네일/제목 카피 코치다. 'AI 생성'과 '김짠부가 원하는 이상' 두 카피를 비교해, 무엇이 어떻게 다른지 구조화해 설명한다. 어투·후킹 각도·길이·강조어·추가/삭제 요소를 짚고, 다음 생성에 적용할 일반화 가능한 규칙을 actionable_rules로 뽑는다(예: '명령은 존댓말로'). 한국어." 추측 금지·입력 근거.

### 2) 분석 액션 (`saveCorrection` 직후 또는 별도)
```ts
export async function analyzeCorrectionDiff(correctionId: string): Promise<{ diff: CorrectionDiff }>;
```
- `requireOwner`→ correction 1행 로드 → gen/ideal payload를 텍스트로 풀어 callLLM(`correction_diff`) → 결과를 `thumbnail_corrections.diff`에 update → 반환.
- 순수 분리: payload→텍스트 변환은 순수 함수(`correctionToPromptText`)로 테스트 가능하게.
- (step3 UI가 저장 직후 호출하거나, "차이 분석" 버튼으로 호출.)

## 주의 (구체)
- **스키마 빈배열 가능 필드(added/removed/actionable_rules)는 required 제외**·step에서 `?? []`. 이유: forced tool_use도 빈배열 누락 가능(과거 critic·style_extractor 사건).
- **분석은 학습과 독립**: diff는 표시·기록용. step2의 학습(patterns/banned)은 재학습 루프가 별도로 한다. diff를 patterns에 직접 쓰지 마라. 이유: 책임 분리(학습 권위는 재학습).
- **callLLM 규약 준수**: CostGuard·schema·claude-p record. 이유: $0·기존 픽스처 전략.
- **순수 텍스트 변환 분리**. 이유: 테스트.
- requireOwner 게이트.

## 테스트
- `correctionToPromptText` 순수 테스트(썸네일/제목 payload→텍스트).
- (LLM 호출은 driver 주입 또는 fixtures 모킹으로 형태만 — 실호출 금지·stray fixture 금지).
- 기존 테스트 보존.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy). 2. 체크: diff 스키마 required 규칙·분석↔학습 독립·callLLM 규약·순수 분리·requireOwner. 3. index.json step1 갱신.

## 금지사항
- diff를 style_profiles.patterns에 직접 쓰지 마라. 이유: 학습 권위는 재학습(step2).
- 빈배열 가능 필드를 required에 넣지 마라. 이유: 누락 실패.
- 테스트가 실제 LLM을 호출하거나 fixtures/parity에 파일을 쓰게 하지 마라. 이유: $0·stray 금지.
- step0 테이블/저장·step2 학습·step3 UI를 바꾸지 마라. 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
