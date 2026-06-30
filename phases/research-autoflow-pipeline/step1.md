# Step 1: script-fact-eligibility

짠펜(스크립트 셀)이 **에스컬레이션·보류(`human_approved=null`) fact를 쓸 수 있게** 한다. 이유: 새 자동 흐름에서 고위험 사실은 리서치 중간에 검수되지 않고 `human_approved=null`(보류)로 스크립트까지 운반된다(step0). 이 사실이 **스크립트 본문에 실제로 쓰여야** Phase 2 최종검수에서 맥락과 함께 인라인으로 확인할 수 있다. 지금 짠펜이 미검수 fact를 배제하면 그 사실은 영영 스크립트에 못 들어가 최종검수가 비게 된다.

## 읽어야 할 파일

- `docs/specs/2026-07-01-research-autoflow-design.md` (특히 'D. 단일 최종 검수' + '안 깨지는 것')
- `phases/research-autoflow-pipeline/index.json`의 step0 summary (자동전이 규약·`human_approved=null` 보류 규칙).
- `src/pipeline/scriptCell.ts` — 짠펜 셀. 짠펜에 넘길 fact를 **어떤 조건으로 거르는지** 찾아라(현재 `human_approved=false`인 fact는 배제됨 — 그 필터 위치).
- `src/pipeline/researchGate.ts` — `human_approved` 의미: `false`=짠펜 사용 불가, `true`=사용, **null=미검수**.
- `src/lib/dashboard/researchView.ts` — `FactView`(`humanApproved: boolean|null`, `escalatedToHuman`).

## 작업

짠펜 fact 적격성 규칙을 **"`human_approved !== false`"**(= true 또는 null 허용)으로 바꾼다.

- **사용가능 fact** = 자동통과 verified(비에스컬레이션) **+** 에스컬레이션·보류(`escalated_to_human=true && human_approved IS NULL`). 즉 `human_approved=false`(사람이 명시 반려)만 배제.
- 명시 반려(`false`)는 계속 배제 — 이건 Phase 2에서 사람이 반려한 fact다.
- 짠펜에 fact를 넘길 때, 각 fact가 **'보류(확인 필요)'인지** 구분 가능한 메타(예: `pending`/`escalatedToHuman` 플래그)를 함께 실어, Phase 2가 인라인 칩에서 "확인 필요"를 표시할 수 있게 한다. 단, **이 플래그가 짠펜 LLM 프롬프트(promptHash)에 들어가면 안 된다** — fact 선택/조인 단계의 데이터에만 둔다(프롬프트 바이트 불변·픽스처 보존).
- `script_segment_facts`/`script_segment_explanation_assets` 조인 기록 경로는 그대로(이미 fact↔segment 매핑 저장). 보류 fact도 동일하게 조인 기록되면 Phase 2가 칩을 그릴 수 있다.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

신규/보강 테스트:
- 적격성 규칙: `human_approved=null`(에스컬레이션 보류) fact가 **포함**되고, `human_approved=false`(반려) fact가 **배제**되는지.
- 짠펜 프롬프트(promptHash)가 이 변경으로 **바뀌지 않는지**(보류 플래그는 프롬프트 밖) — 기존 script 픽스처/parity 테스트가 그대로 통과하면 OK.

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 불변식 확인:
   - 보류(null) fact 포함·반려(false) fact 배제가 맞는가?
   - 짠펜 promptHash 불변인가(픽스처 안 깨짐)?
   - 보류 플래그가 프롬프트가 아니라 데이터/조인 레이어에만 있는가?
3. `phases/research-autoflow-pipeline/index.json`의 step1을 `completed`+`summary`로 갱신(Phase 2가 읽을 핵심: 보류 fact를 구분하는 플래그/필드 이름, 짠펜이 보류 fact를 어떻게 운반하는지).

## 금지사항

- 짠펜 LLM 프롬프트를 바꾸지 마라. 이유: promptHash 변동 → script 픽스처/parity 전부 깨짐. 보류 구분은 데이터 레이어에서만.
- `human_approved=false`(명시 반려) fact를 짠펜이 쓰게 하지 마라. 이유: 사람이 반려한 사실 = 스크립트 금지.
- step0의 자동전이/`human_approved=null` 규약을 바꾸지 마라(이 step은 소비측만 손본다).
- 기존 테스트를 깨뜨리지 마라.
