# Step 0: auto-bridge

리서치를 **무중단 자동화**한다. 지금은 리서치가 `research_scoped`(후보선택 대기)와 `research_ready`(검수 대기)에서 **사람을 기다리며 멈춘다.** 시작 버튼 한 번 누르면 스코프 선택·검증·검수통과·스크립트 발행까지 **사람 입력 없이 흐르게** 만든다. 사람 접점은 이 phase 이후 '최종 스크립트 검수 1회'(Phase 2에서 구현)만 남는다.

설계 전문: `docs/specs/2026-07-01-research-autoflow-design.md` — **먼저 읽어라.**

## 읽어야 할 파일

- `docs/specs/2026-07-01-research-autoflow-design.md` (이 phase의 근거·정책·불변식)
- `src/inngest/functions/researchStage.ts` — 단일 함수 `researchStageFn`, `run/research.requested` 트리거. `structure_selected`면 `runResearchScope`(scope 제안만), 그 외면 `runResearchCell`. **두 결과 형태(research_scoped/research_ready)에서 멈추고 종료**한다 — 여기가 자동화 핵심.
- `src/pipeline/researchScope.ts` — `buildScopeCandidates`(claim/concept 후보, `is_financial`·`needs_number`·`needs_analogy`·`default_selected`), `selectResearchScope`(선택분 기록 + `research_scoped → researching` 전이), `runResearchScope`.
- `src/pipeline/researchCell.ts` — `runResearchCell`(검증 fan-out → `reconcileFacts` → 자산 → critic → `researching → research_ready` 전이, 끝부분).
- `src/pipeline/researchReconcile.ts` — **에스컬레이션 술어**(`escalated = is_financial || status !== "verified" || freshness === "stale"`)가 `escalated_to_human` 컬럼을 채운다.
- `src/pipeline/researchGate.ts` — `enterResearchReview`(research_ready→research_review·멱등), `approveResearch`(research_review→research_approved; `approveFactIds` 미지정 시 **에스컬레이션 전체 자동승인** — 이 동작을 그대로 쓰면 안 된다, 아래 참조).
- `src/app/actions/topicRun.ts` — `selectResearchScopeAction`·`approveResearchAction`·`requestScript`(`run/script.requested` 발행) 패턴. (액션은 사람용 — 자동화는 액션이 아니라 파이프라인/Inngest에서.)
- `src/domain/enums.ts` — `ALLOWED_TRANSITIONS`. 확인: `research_ready → [research_review, research_scoped, researching]`, `research_review → [research_approved, ...]`, `research_approved → [scripting]`. **두 엣지(ready→review, review→approved)가 이미 있어 마이그레이션 없이 자동 통과 가능.**

## 작업

`researchStageFn`(또는 그것이 부르는 파이프라인 헬퍼)을 확장해 리서치를 끝까지 자동으로 흐르게 한다. **새 Inngest 이벤트/함수는 만들지 말고**(기존 `run/research.requested`·`run/script.requested` 재사용), 각 단계 완료 후 다음 단계를 자동 진행/발행한다.

### A. 자동 스코프 선택 (정책 나)

- 신규 순수함수 `autoSelectScope(candidates) → 선택된 idx[]`를 `researchScope.ts`에 추가.
- **정책 (나)**: `claim.is_financial === true` **또는** `concept.needs_number` **또는** `concept.needs_analogy`인 후보만 검증 대상으로 선택. 그 외(금융 아님·숫자/비유 불필요한 평범한 주장)는 **검증 안 함**(출처만). 이유: 사람이 어차피 검수하던 = 에스컬레이션되던 범위(금융·고위험·수치)와 일치.
- **비용 캡 보존**: 기존 예산 로직(`researchBudget.suggestDefaultSelection`/`withStageRuntime`의 cap)을 우회하지 마라. 자동 선택분이 캡을 넘으면 **금융 우선**으로 잘라라(잘린 항목은 미검증으로 남아 Phase 2 최종검수에서 "출처만" 표시됨). 캡 컷 로직이 이미 cell 안에 있으면 그대로 두고, 선택 개수만 정책으로 정한다.
- `runResearchScope`가 `research_scoped`로 끝낸 직후, 사람 선택을 기다리지 말고 `autoSelectScope` 결과로 **`selectResearchScope`(또는 동등 내부경로)를 자동 호출** → `researching` 전이 → 검증 셀 진행. (round-trip 이벤트 재발행 또는 인라인 연속 — durable 멱등 유지하는 쪽으로.)

### B. 자동 검수 통과 (사람 게이트 우회, 사실은 '보류'로 운반)

- 검증 셀이 `research_ready`로 끝낸 직후, **사람 검수를 건너뛰고** `research_ready → research_review → research_approved`로 자동 전이한다(두 엣지 이미 존재).
- ★**핵심 불변식**: 자동 통과 시 에스컬레이션된 fact의 `human_approved`를 **건드리지 마라(null 유지 = '미검수·보류')**. `approveResearch`의 "approveFactIds 미지정 시 전체 자동승인" 경로를 그대로 쓰면 안 된다 — 그건 `human_approved=true`로 박아 거버넌스 '사람 최종확인'을 가짜로 만든다. 전이만 하고 fact 승인은 **Phase 2 최종검수로 미룬다**. 필요하면 `approveResearch`에 "전이만·승인 안 함" 옵션을 추가하거나 전용 자동전이 헬퍼를 만들어라.
- 비-에스컬레이션(자동통과) fact는 기존대로 verified·사용가능. 변경 없음.

### C. 스크립트 자동 발행

- `research_approved` 도달 직후 `run/script.requested`를 자동 발행(`requestScript` 내부 로직 재사용 — 단 액션이 아니라 파이프라인/Inngest에서 `inngest.send`). → 짠펜이 자동 시작.

### 멱등성·실패

- 모든 자동 전이/발행은 **재실행 안전**해야 한다(Inngest 재시도·durable replay). 이미 `research_approved`거나 script 이벤트가 나간 상태에서 재진입 시 중복 발행/이중 전이 금지(상태 가드로).
- 자동 흐름 중 한 단계가 실패하면 기존 `captureStageFailure`/`withStageRuntime` 경로로 처리(새 실패 처리 만들지 마라).

### 시작 버튼·재진입은 유지

- `structure_selected`의 시작 버튼(`run/research.requested` 최초 발행)은 **그대로 둔다**(비용 발생 동의 = 유일한 시작점).
- 재진입 액션(`reverifyResearch`·`regenResearchExamples`·`backToResearchScope`)은 건드리지 마라(Phase 3에서 정리).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

신규 테스트(최소):
- `autoSelectScope` 순수함수: 정책(나) 단위 테스트 — 금융 claim·needs_number/analogy concept만 선택, 평범한 claim 제외, 빈 후보→빈 선택, 깨진 입력 방어.
- 자동전이가 `human_approved`를 null로 보존하는지(에스컬레이션 fact 미승인) 검증하는 테스트.

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 불변식 확인:
   - 자동 통과 후 에스컬레이션 fact의 `human_approved`가 **null**인가(true 아님)?
   - 새 Inngest 이벤트/함수를 안 만들었는가(기존 라우팅 재사용)?
   - 마이그레이션 0개인가(전이 엣지 기존 것만 사용)?
   - 시작 버튼·재진입 액션 무변경인가?
3. `phases/research-autoflow-pipeline/index.json`의 step0을 `completed`+`summary`로 갱신(다음 step1이 읽을 핵심: 자동전이 진입점·`human_approved=null` 보류 규약·script 자동발행 위치).

## 금지사항

- 새 Inngest 이벤트/함수를 만들지 마라. 이유: 기존 `run/research.requested`·`run/script.requested` 라우팅으로 충분하고, 새 이벤트는 재시도·동시성·실패처리 가드를 다시 짜야 한다.
- 마이그레이션(SQL)을 추가하지 마라. 이유: 필요한 전이 엣지(ready→review→approved)가 이미 있다. DB 전이 트리거를 건드리면 사용자 수동 SQL이 필요해진다.
- 에스컬레이션 fact를 자동 `human_approved=true`로 승인하지 마라. 이유: 거버넌스 '사람 최종확인'을 가짜로 만든다 — 확인은 Phase 2 스크립트 검수에서 한다.
- 비용 캡·예산 로직을 우회/제거하지 마라. 이유: 운영 하드캡 $10. 자동 검증이 무한정 늘면 안 된다.
- 픽스처 보존: 에이전트 input/system을 "있을 때만" 바꿔라(없으면 promptHash 동일). 이 phase는 오케스트레이션이라 프롬프트 변경이 없어야 정상 — 프롬프트 바꾸지 마라.
- 명세에 없는 신규 파일(라이브 fixture·docs 등)을 커밋에 섞지 마라. 커밋 전 `git status` 확인.
- 기존 테스트를 깨뜨리지 마라.
