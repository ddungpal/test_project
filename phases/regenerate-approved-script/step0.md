# Step 0: reopen-transition-backend

## 배경 (자기완결 — 이 phase의 목적)

승인된(`approved`) 런의 대본을 **다시 생성할 방법이 없다**. 상태 머신(`supabase/migrations/20260618120008_state_transitions.sql`의 `run_state_transitions` 테이블 + `enforce_run_transition()` 트리거)이 `approved`에서 `published`·`aborted`로만 가게 막는다 — `approved → scripting` 엣지가 없어 짠펜 재실행이 원천 차단된다(직접 update도 트리거가 "불법 상태 전이"로 거부).

**사용자 시나리오:** 대본 품질(길이·섹션별 생성 등)을 개선한 뒤, 이미 승인된 런에 그 개선을 반영해 대본을 다시 뽑고 싶다. 지금은 불가능 → **`approved → scripting` 전이를 추가**하고, 오너가 "대본 다시 생성"을 누르면 짠펜을 재실행하는 서버 경로를 만든다.

이 step은 **백엔드**(전이 엣지 + 서버 액션)만. UI 버튼은 step 1.

## 읽어야 할 파일

- `supabase/migrations/20260618120008_state_transitions.sql` — `run_state_transitions` 테이블·트리거·현재 허용 전이표.
- `supabase/migrations/20260629120028_research_reentry_transitions.sql` — **additive 전이 추가 마이그의 패턴**(insert … on conflict do nothing·멱등·up only·enums.ts 동기화 주석). 이걸 그대로 미러하라.
- `src/domain/enums.ts` — `ALLOWED_TRANSITIONS`(DB 전이표의 코드 미러). **DB와 반드시 동기화**한다(rules.md: 스키마-타입/전이 드리프트 주의).
- `src/pipeline/scriptGate.ts` — `requestScriptRework`(state 검증→bumpRework→transition script_review→scripting)·`enterScriptReview`. **재사용/미러**할 패턴.
- `src/app/actions/topicRun.ts` — `requestScriptReworkAction`(requireOwner→scriptGate→auditLog→**`run/script.requested` 재발행**). 이걸 미러한다.
- `src/pipeline/runState.ts`(`transitionRun`)·`src/pipeline/runGuards.ts`(bumpRework·MAX_REWORK).
- `.claude/rules/rules.md` — **rework 재진입 시 stage 이벤트 재발행 필수** 규칙(이걸 어기면 stuck).

## 작업

### 1) 마이그레이션 — `approved → scripting` 전이 추가

`supabase/migrations/<타임스탬프>_approved_reopen_script.sql` (기존 최신 타임스탬프보다 뒤):
```sql
-- approved 런의 대본 재생성을 위해 approved→scripting 전이를 additive로 추가.
-- src/domain/enums.ts ALLOWED_TRANSITIONS 와 동기화. 멱등·up only.
-- ⚠ state CHECK 무변경: approved·scripting 둘 다 기존 상태 → CHECK 그대로.
begin;
insert into public.run_state_transitions (from_state, to_state) values
  ('approved','scripting')
on conflict (from_state, to_state) do nothing;
commit;
```
- **헤더에 "사람이 라이브 DB에 적용해야 함" 명시**(마이그레이션은 자동 반영 안 됨 — 과거 마이그34 미적용으로 버그 난 전례). 이 step은 파일만 만들고, 적용은 사람 몫.

### 2) `src/domain/enums.ts ALLOWED_TRANSITIONS` 동기화

`approved`의 허용 목록에 `scripting`을 추가(기존 `published`·`aborted`와 병존). DB 전이표와 정확히 일치시킨다.

### 3) `scriptGate.ts` — 재오픈 함수

```ts
// 승인된 런을 대본 재생성용으로 재오픈 — approved → scripting.
//   ★ 오너의 의도적 재생성이므로 bumpRework(자동 rework 루프 가드)는 걸지 않는다
//     — max_rework 소진으로 오너 액션이 막히면 안 된다. freshness 재-rework 내부 가드는 runScriptStage가 자체 처리.
export async function reopenApprovedForScript(supa: Supa, runId: string): Promise<{ state: "scripting" }>;
```
- state !== 'approved'면 throw(명확한 메시지). `transitionRun(supa, runId, "approved", "scripting")` 후 `{ state: "scripting" }` 반환.

### 4) `topicRun.ts` — 서버 액션

```ts
export async function regenerateApprovedScriptAction(runId: string): Promise<{ state: string }>;
```
- `requireOwner()` → `reopenApprovedForScript(supa, runId)` → `auditLog(action: "script_regenerate")` →
  **`state === "scripting"`면 `inngest.send({ name: "run/script.requested", data: { runId } })` 반드시 재발행**(이유: `scriptStageFn`은 이 이벤트로만 실행 — 안 쏘면 scripting에서 "작성 중"으로 stuck. `requestScriptReworkAction`과 동일 함정).
- 재실행되는 `runScriptStage`는 이미 섹션별 생성(이전 phase) + 옛 세그먼트 delete 후 교체 → script_ready → 기존 auto-land로 script_review 착지. **runScriptStage·scriptStageFn은 건드리지 마라**(그대로 재사용).

### 5) 회귀 테스트

- `ALLOWED_TRANSITIONS`에 `approved→scripting` 포함(전이표 동기화 잠금).
- `reopenApprovedForScript`: approved에서만 동작·비-approved는 throw(뮤테이션 스텁/인메모리).
- 액션이 scripting 시 이벤트를 재발행하는지(스텁 카운터 — rules.md의 vitest catch-swallow 주의, `vi.fn` 대신 교체가능 impl+카운터).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.
- 마이그레이션 **라이브 적용은 AC 아님**(사람 몫) — 파일 존재 + enums.ts 동기화 + 유닛으로 검증.

## 검증 절차

1. AC 실행.
2. DB 전이표(마이그)와 `ALLOWED_TRANSITIONS`(코드)가 **정확히 동기화**됐는지 확인.
3. UI는 이 step에서 **미변경**(step 1). git diff가 마이그·enums·scriptGate·topicRun·테스트만 잡히는지.
4. `git status`로 범위 외 untracked(fixtures replay 등) 제외.
5. `phases/regenerate-approved-script/index.json` step 0 갱신(완료 → completed + summary·**"마이그 라이브 적용 필요" 명시** / 실패 → error).

## 금지사항

- `runScriptStage`·`scriptStageFn`·짠펜 생성 로직을 바꾸지 마라(재사용만). 이유: 재생성 엔진은 이미 완성(섹션별), 이 phase는 "재오픈 경로"만.
- `bumpRework`를 reopen에 걸지 마라(오너 의도 액션 — max_rework로 막히면 안 됨).
- 이벤트 재발행을 빠뜨리지 마라(scripting 전이 후 `run/script.requested` 필수 — 안 그러면 stuck).
- state CHECK 제약을 건드리지 마라(두 상태 다 기존). 마이그는 additive·멱등.
- 기존 테스트를 깨뜨리지 마라.
