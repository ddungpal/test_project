# Step 0: script-review-landing

리서치 UX 대수술(게이트 5→1 자동화)의 마지막 Phase(`research-gate-removal`) 1단계.
Phase 1(`research-autoflow-pipeline`)이 리서치를 사람 클릭 없이 자동 통과시켜 `run/script.requested`까지
자동 발행하고, Phase 2(`script-review-inline-facts`)가 `script_review` 상태에 인라인 사실 칩 최종검수를 깔았다.
**그 결과 happy-path에서 사용자가 여전히 누르는 잉여 클릭이 딱 하나 남았다 — `script_ready`의 "대본 검수 시작" 버튼.**
이 step은 그 클릭을 없애, 짠펜이 대본을 다 쓰면 런이 **검수 화면(`script_review`)에 바로 착지**하게 한다.

## 읽어야 할 파일

먼저 아래를 읽고 자동흐름의 상태 전이와 게이트 패턴을 파악하라:

- `docs/specs/2026-07-01-research-autoflow-design.md` — 설계 전문(특히 §B 무중단 전이, §D 단일 최종검수, "안 깨지는 것" 불변식).
- `src/inngest/functions/researchStage.ts` — Phase 1 자동 브릿지. **이 step이 미러할 패턴**: 단일 invocation 안에서 `step.run` 여러 개를 inline 연속으로 묶고, 직전 step 결과 상태로 다음 전이를 조건 분기한다(s3 `research-auto-approve`, s4 `script-dispatch` 참고).
- `src/inngest/functions/scriptStage.ts` — **이 step이 수정할 파일.** 현재 `step.run("script-write", ...)` 하나만 돌고 `script_ready`(또는 비정상 상태)로 끝난다.
- `src/pipeline/scriptGate.ts` — `enterScriptReview(supa, runId)`(=`script_ready → script_review` 전이, **이미 멱등**: 이미 `script_review`면 early return), `reviewScript`/`approveScript`(둘 다 `state === "script_review"`에서만 동작 — 이게 검수 화면이 `script_review`를 요구하는 이유다).
- `src/lib/supabase/admin.js`(`createAdminClient`) — researchStage s3가 자동 전이에 쓰는 클라이언트.
- `tests/reviewScript.test.ts` — fake supa로 scriptGate 헬퍼를 검증하는 **테스트 패턴**(이 step의 테스트가 미러할 것).

## 작업

### scriptStage.ts — 정상 완료(`script_ready`) 시 자동으로 `script_review`까지 전진

현재 함수는 `step.run("script-write", ...)` 하나를 반환한다. 이를 다음 구조로 바꾼다(시그니처 수준 — 구현은 재량, researchStage s3 패턴 미러):

```ts
async ({ event, step }) => {
  const s1 = await step.run("script-write", async () => { /* 현행 그대로 */ });

  // 정상 완료(script_ready)일 때만 검수 화면까지 자동 전진 = 단일 사람 접점.
  //   rework(scripting)·중단(aborted)·캡일시정지(non-ok)는 건드리지 않는다.
  if (s1.status === "ok" && s1.state === "script_ready") {
    await step.run("enter-script-review", async () => {
      // createAdminClient + enterScriptReview(멱등) 재사용. 새 전이 함수 만들지 말 것.
      return { state: "script_review" as const };
    });
    return { ...s1, state: "script_review" as const };
  }
  return s1;
}
```

핵심 규칙(반드시 지킬 것):

1. **`script_ready`일 때만 전진한다.** `s1.state`가 `script_ready`가 아니면(rework로 `scripting`, `aborted`, 또는 `status !== "ok"`인 캡 일시정지·실패) **절대 `enterScriptReview`를 호출하지 마라.** 이유: rework는 짠펜이 다시 쓰는 중이고, aborted/실패는 검수할 대본이 없다.
2. **전이는 별도 `step.run("enter-script-review", ...)`으로 분리한다**(durable — script-write 성공이 메모되면 crash 후 재시도 시 enter만 다시 탄다). researchStage s3·s4가 이 방식이다.
3. **신규 전이 함수·이벤트·Inngest 함수 금지.** 기존 `scriptGate.enterScriptReview` + `createAdminClient`만 재사용한다. `enterScriptReview`는 이미 멱등이라 중복 호출 안전.
4. rework 경로(`requestScriptRework` → `scripting` → scriptStage 재실행)도 다시 `script_ready`로 끝나면 이 분기를 타고 **검수로 재착지**한다 — 의도된 동작이다(고치면 또 검수).

### 테스트

`tests/reviewScript.test.ts`의 fake supa 패턴을 미러해 `enterScriptReview`(scriptGate) 동작을 잠근다:

- `script_ready` → 호출 시 `script_review`로 전이한다.
- 이미 `script_review`면 멱등(no-op, throw 없음).
- (가능하면) `script_ready`가 아닌 상태에서의 호출이 transitionRun 가드에 막히는지 — `transitionRun`이 from-state를 검사하므로.

Inngest 함수(`scriptStageFn`) 자체는 기존에 단위 테스트가 없다(researchStageFn도 없음 — Phase 1은 헬퍼만 테스트했다). **함수 자체를 테스트하려 Inngest 하니스를 새로 끌어오지 마라**(YAGNI). 분기 로직이 의존하는 `enterScriptReview`의 전이·멱등·가드만 테스트로 잠그면 충분하다.

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과(현재 955 + 신규)
npm run build       # next build, 에러 0
```

## 검증 절차

1. 위 AC 3개를 실행한다.
2. 체크리스트:
   - `scriptStage.ts`가 `s1.state === "script_ready"`일 때만 `enter-script-review` step을 타는가? (rework `scripting`·`aborted`·non-ok은 안 탐.)
   - 새 전이 함수/이벤트/Inngest 함수를 만들지 않고 `enterScriptReview`+`createAdminClient`만 재사용했는가?
   - `enterScriptReview` 멱등성에 기대고 있는가(중복 발행 안전)?
   - CLAUDE.md·rules.md 위반 없는가? 마이그레이션 0(순수 코드)인가?
3. 결과 반영:
   - 성공 → `phases/research-gate-removal/index.json`의 step 0을 `"completed"` + `"summary"`(다음 step이 알아야 할 핵심: scriptStage가 이제 script_review로 착지 → script_ready는 전이 중 잠깐만 머무는 자리).
   - 3회 수정 후 실패 → `"error"` + `"error_message"`.
   - 사람 개입 필요 → `"blocked"` + `"blocked_reason"` 후 중단.

## 금지사항

- `s1.state`가 `script_ready`가 아닐 때 `enterScriptReview`를 호출하지 마라. 이유: rework 중인 런을 강제로 검수로 끌어와 짠펜 재작성을 깨뜨린다.
- 새 Inngest 이벤트/함수, 새 상태 전이 함수를 만들지 마라. 이유: 설계 §C "새 이벤트/함수 추가 없이 기존 라우팅 재사용". `enterScriptReview` 하나로 충분하다.
- 마이그레이션을 추가하지 마라. 이유: 순수 상태 전이 재사용 — 스키마 변경 없음.
- `page.tsx`·UI는 건드리지 마라. 이유: 이 step은 파이프라인 전용. UI 정리(죽은 `EnterScriptReviewButton` 등)는 step 1이 한다.
- 기존 테스트를 깨뜨리지 마라.
- `npm run build`가 `Cannot find module './xxx.js'`·`PageNotFoundError`로 깨지면 떠 있는 `next dev`의 stale `.next` 탓일 수 있다 — `rm -rf .next` 후 재빌드로 판별(코드 무관 캐시 오류를 실패로 오판 금지).
