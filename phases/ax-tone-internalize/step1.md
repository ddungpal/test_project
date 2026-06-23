# Step 1: tone-fidelity-eval-scaffold

**말투충실도 eval의 결정적 스캐폴드를 만든다 — 말투≠사실 분리.** AX(내재화)로 전환하기 전·후로 출력이 김짠부 말투에 충실한지 채점하는 회귀 가드. **지금은 말투 골든셋·`eval_runs` 테이블이 없으므로**(Phase 5 연기), LLM 심판 없이 **tone_profile 패턴 대비 결정적 검사**만 골격으로 만든다. LLM-judge 채점은 나중에 이 위에 얹는다.

> ⚠️ **governance — 말투≠사실**: 이 eval은 **말투(목소리·어미·톤)만** 본다. **사실 정확성·수치는 절대 채점/내재화 대상이 아니다**(사실은 팩트체크 경로 전담). 출력의 '말투 특징'만 검사하고, 내용의 진위는 건드리지 마라.

> ponytail: 골든셋·LLM-judge 없이 결정적 검사부터. 이건 '나중을 위한 빈 스캐폴드'가 아니라, tone_profile의 banned/마커를 실제로 검사하는 **동작하는 결정적 레이어**다. LLM-judge는 골든셋이 생기면 이 점수에 합산한다.

## 읽어야 할 파일 (먼저 정독)
- `src/pipeline/context.ts` — `ToneProfileLite`(37줄)·`getToneProfile()`(45줄). tone_profile의 `patterns`(jsonb) 형태 확인 — banned 표현/필수 마커/어미 등 어떤 필드가 있는지. (styleProfile patterns와 유사 구조일 것.)
- `src/agents/tone_extractor/schema.ts` — 말투 패턴 스키마(어떤 말투 특징을 뽑는지). 검사 항목 근거.
- `src/agents/shared/styleProfile.ts` — `hasUsablePatterns`·`?? []` 가드 패턴 참고(빈/깨진 patterns 안전 처리).
- `corpus/tone/tone-proposed-*.json` — 실제 말투 패턴 예시(검사 항목 감 잡기용. 골든셋 아님).

## 작업
1. **순수 채점 함수**(새 파일 `src/performance/toneFidelity.ts`):
   - `export function scoreToneFidelity(text: string, tonePatterns: unknown): { score: number; checks: { name: string; pass: boolean; detail?: string }[] }`.
   - 결정적 검사만(LLM·네트워크 0). tone_profile patterns에서 **있을 때만** 뽑아 검사(`?? []` 가드):
     - **banned 표현**: patterns의 금지 표현/말투가 text에 등장하면 fail.
     - **필수 말투 마커**(있으면): 어미·호칭·톤 마커 중 최소 1개 포함하는지 등(과적합 피해 느슨하게).
   - `score` = 통과 검사 / 전체 검사 비율(0~1). 검사할 게 없으면(빈 patterns) `score=1, checks=[]`(중립 — throw 금지).
   - **사실 검사 금지** — 숫자/주장 진위는 검사 항목에 넣지 마라(governance).
2. **골든셋·LLM-judge는 명시적 stub**: 함수/주석으로 "여기에 골든셋 기준 LLM-judge 점수를 합산(미구현·Phase 5/골든셋 생성 후)"를 `ponytail:` 주석으로 남긴다. 빈 인터페이스를 미리 파지 말고, **결정적 검사만 동작**하게.
3. 순수·결정적 — 같은 입력 같은 출력.

## 테스트 (신규 `tests/toneFidelity.test.ts`)
- banned 표현 포함 text → 해당 check fail·score 하락.
- banned 없고 마커 있는 text → 통과·score 높음.
- 빈/깨진 patterns(`null`·`{}`) → `score=1, checks=[]`(throw 금지·바이트 안전).
- 같은 입력 2회 → 동일 결과(결정성).
- (말투≠사실 확인) 사실 오류가 있어도 말투만 맞으면 점수 영향 없음 — 검사 항목에 사실이 없음을 단언.

## 주의
- **LLM·네트워크·DB 0.** 결정적 문자열 검사만.
- 과적합 경계 — 마커 검사는 느슨하게(표본 적음). banned는 명확한 것만.
- `noUncheckedIndexedAccess`·`exactOptionalPropertyTypes` 준수.
- 범위: `src/performance/toneFidelity.ts` + `tests/toneFidelity.test.ts`. 그 외 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. step 1 갱신: 성공 → `"status":"completed"` + `"summary":"말투충실도 결정적 스캐폴드(scoreToneFidelity: tone_profile banned/마커 검사, 말투≠사실, LLM-judge는 stub) + 테스트. LLM/DB 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.
