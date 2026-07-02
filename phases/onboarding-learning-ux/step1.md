# Step 1: onboarder-difficulty-more

**추가 문제**를 난이도별로 생성하는 백엔드. 난이도(basic/mid/deep) 1개를 받아 그 난이도 문항을 추가 생성 → **기존 아크에 이어붙임**. 저장된 refs 재사용·재제출 시 금맥 갱신.

## 읽어야 할 파일

- `docs/specs/2026-07-02-onboarding-learning-ux-design.md` — "step1".
- `src/pipeline/onboarding.ts` — **수정 대상.** `runOnboarding(runId, deps, {force?})`(`:78-100`)·`loadOnboardingArc`·insert 지점. **주의: onboarding-references(Phase A)가 먼저 머지됐다면** payload에 `references`가 있음 — 재사용.
- `src/agents/onboarder/prepare.ts` — `prepareOnboarder`(refs 수집). 추가 생성은 **저장된 refs 재사용**(재수집 X) — payload의 references를 입력으로.
- `src/agents/onboarder/schema.ts` — `ONBOARDER_SYSTEM`·`OnboardingArc`·`ArcDifficulty`(basic/mid/deep)·`normalizeArc`.
- `src/inngest/functions/onboardingStage.ts` — `run/onboarding.requested` data(현재 `{runId, force?, softAck?}`).
- `src/app/actions/topicRun.ts` — `requestOnboarding`(`:205-208`)·`submitOnboarding`(`:212-222`·`extractGold`→`saveOnboardingGold`).

## 작업

### 1) 추가 생성 경로 (onboarding.ts)

- `run/onboarding.requested` data에 optional `more?: { difficulty: ArcDifficulty }` 추가(client.ts StageData·onboardingStageFn 분기).
- `runOnboarding`(또는 신규 `appendOnboardingQuestions(runId, deps, difficulty)`): `more`면 → 기존 아크 로드(있어야 함·없으면 no-op/throw) + **저장된 refs 재사용**(payload.references를 prepare 입력으로·재수집 X) + `ONBOARDER_SYSTEM`에 "난이도={difficulty} 문항 N개(예 2~3개) 추가·기존 아크 흐름/클리프행어 이어서·중복 금지" 지시 → 생성 문항을 **기존 arc.questions에 append**해 proposal payload 갱신(insert/update·jsonb·마이그0).
- normalizeArc로 방어(깨진 문항 드랍). money-safety·듀얼훅 규칙 유지.

### 2) 재제출 시 금맥 갱신

- `submitOnboarding`은 이미 `loadOnboardingArc`(확장된 전체 아크) → `extractGold` → `saveOnboardingGold`. **확장 아크 전체로 금맥 재계산되는지 확인**(추가 문항 오답도 confusions/aha에 반영). 별도 변경 없이 동작하면 OK.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 회귀 테스트 포함 전부 통과
npm run build
```

신규 테스트:
- 추가 생성이 기존 arc.questions에 append(기존 문항 보존·중복 아님).
- 저장된 refs 재사용(재수집 호출 안 함·모킹으로 검증).
- `more` 없으면 기존 runOnboarding 동작 불변(바이트 동일).
- 확장 아크로 extractGold가 추가 오답 반영.

## 검증 절차
1. AC 실행.
2. 체크리스트: 기존 아크 append(덮어쓰기 X). refs 재사용(재검색 X). 마이그 0. `more` 없으면 불변.
3. `phases/onboarding-learning-ux/index.json` step 1 갱신.

## 금지사항
- **추가 생성이 기존 아크를 덮어쓰지 마라 — append(연장·설계 Q1=A).**
- **추가 생성 시 refs를 재수집하지 마라 — 저장된 payload.references 재사용(Q2).**
- **`more` 없는 기존 경로의 promptHash/동작을 바꾸지 마라**(바이트 동일).
- **`ONBOARDER_SYSTEM`의 money-safety·듀얼훅·클리프행어 규칙 유지.**
- 기존 테스트를 깨뜨리지 마라.
