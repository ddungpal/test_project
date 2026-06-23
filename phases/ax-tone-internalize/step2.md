# Step 2: ax-stage-flag

**단계별 AX 전환 골격 — RAG↔AX 분기 + 롤백.** 김짠부가 한 단계에 "이제 됐다" 하면 그 단계를 RAG(매번 말투 프로파일 주입)에서 AX(내재화) 모드로 **플래그로 전환**한다. 이 step은 그 **스위치 골격**만 만든다: 설정 플래그 + 순수 판정 함수 + 말투 주입 지점의 분기. **기본은 전부 RAG(무전환)·언제든 롤백 가능.**

> ponytail: AX 모드의 실제 내용(few-shot 강화/모델 전환)은 아직 '준비'다. 이 step은 **빈 스위치를 미리 파는 게 아니라**, 말투 주입 경로에 **실제로 작동하는 분기점 + 플래그**를 넣는 것. AX 경로는 최소 동작(또는 명시적 stub)이되, **플래그 존중·기본 RAG·롤백**은 진짜로 동작해야 한다.

## 읽어야 할 파일 (먼저 정독)
- `src/pipeline/context.ts` — `getToneProfile()`(45줄)이 active 말투 프로파일을 로드하는 **RAG 주입 지점**. 이 결과를 **누가 소비해 프롬프트에 넣는지** 추적(짠펜/구다리 prepare 등). 분기는 그 소비 지점에 건다.
- `src/llm/config.ts` — env 기반 설정 로딩 패턴(`loadConfig`). AX 플래그를 여기 또는 별도 설정에 추가하는 방식 참고(기존 캡·백엔드 env 패턴 미러).
- `src/agents/shared/styleProfile.ts`·`approvedInsights.ts` — "있을 때만 주입(없으면 바이트 불변)" 패턴. AX 분기도 **기본 경로(RAG)는 1바이트도 안 바뀌게**.

## 작업
1. **AX 단계 플래그**(env): `AX_STAGES`(쉼표구분, 예 `script,title_thumb`). 순수 파서/판정:
   - `export function parseAxStages(env = process.env): Set<string>` — `AX_STAGES`를 파싱(빈/미설정 → 빈 Set). 알 수 없는 stage는 무시(또는 경고).
   - `export function isAxStage(stage: string, axStages: Set<string>): boolean`.
   - stage ∈ `topic|title_thumb|structure|research|script`.
2. **말투 주입 지점 분기**(최소 변경): 말투 프로파일을 프롬프트에 넣는 소비 지점에서 `isAxStage(stage)`면 **AX 경로**, 아니면 **기존 RAG 경로(불변)**.
   - **기본(플래그 비어있음) = 전부 RAG → 기존 동작 바이트 불변**(픽스처/해시 보존 — 이게 가장 중요).
   - AX 경로는 골격: 최소 동작(예: 말투 프로파일 전체 주입 대신 '내재화됨' 마커/축약 주입) **또는** 명시적 `ponytail:` stub("AX=few-shot 강화/모델 전환 — 추후"). **단, 플래그가 켜지면 경로가 실제로 갈라지는 것**은 테스트로 증명.
   - **롤백**: 플래그에서 stage 빼면 즉시 RAG 복귀(상태 비저장 — env만).
3. 기존 RAG 경로·다른 단계 동작 불변. exactOptionalPropertyTypes·noUncheckedIndexedAccess 준수.

## 테스트 (신규 `tests/axStageFlag.test.ts`)
- `parseAxStages`: `"script,title_thumb"` → `{script,title_thumb}`. 미설정/빈 → 빈 Set. 공백·중복 정규화.
- `isAxStage`: 켜진 stage → true, 아닌 stage → false.
- **기본 무전환**: 빈 플래그 → 모든 stage RAG 경로(분기 함수가 RAG 선택). 
- **롤백**: 플래그에 stage 추가→AX, 제거→RAG (순수 함수라 입력만으로 검증).
- (분기 지점 테스트 가능하면) AX stage일 때 system/입력이 RAG와 **다름**, 비-AX는 RAG와 **동일**.
- process.env 직접 오염 금지(가짜 env 주입).

## 주의
- **기본 경로 바이트 불변 최우선** — 플래그 비면 기존 말투 환류와 1바이트도 안 달라야(픽스처 보존).
- AX 경로를 과하게 구현하지 마라 — 골격(분기+플래그+롤백)만. 실제 내재화 내용은 데이터/정성판단 후.
- **DB·LLM·네트워크 0**(순수 함수 + 분기). 범위: `src/llm/config.ts`(또는 새 `src/pipeline/axFlag.ts`) + 말투 소비 지점 최소 분기 + `tests/axStageFlag.test.ts`.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. `git diff`로 **기본(플래그 비어있음) 말투 환류 경로 불변** 자가확인.
3. step 2 갱신: 성공 → `"status":"completed"` + `"summary":"단계별 AX 플래그 골격(parseAxStages·isAxStage + 말투 주입 분기, 기본 전부 RAG·바이트 불변·롤백) + 테스트. DB/LLM 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## ⚠️ 이 phase 이후 (사람·데이터 게이트)
실제 AX 전환은 **김짠부의 정성 판단("이제 됐다") + 신호 데이터**(step0 채택률·step1 eval)가 있어야 한다. 이 phase는 측정·스위치 골격까지. 전환 결정·AX 경로 실내용(few-shot 강화/모델 전환)은 데이터 축적 후 별도.
