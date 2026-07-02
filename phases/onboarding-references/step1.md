# Step 1: store-references

step0에서 수집한 3개 레퍼런스를 **온보딩 proposal payload에 저장**하고 리더를 만든다(현재는 ephemeral·저장 안 됨). step2 UI가 이걸 읽어 "필수 시청 영상"을 표시한다.

## 읽어야 할 파일

- `docs/specs/2026-07-02-onboarding-references-design.md` — "step1 store-references".
- `phases/onboarding-references/step0.md` + 산출물 — `prepareOnboarder`가 `references[]`(title·url·videoId·transcript?·videoFacts?)를 반환. 이 step이 그중 경량 필드를 저장.
- `src/pipeline/onboarding.ts` — **수정 대상.** `runOnboarding`(arc insert 지점 `:93-96`), `loadOnboardingArc`(`:29-42`), `latestOnboardingProposalId`. arc는 `stage_proposals(stage="onboarding").candidates[0].payload`(jsonb).
- `src/agents/onboarder/schema.ts` — `OnboardingArc` 타입(payload 구조).
- `src/inngest/functions/onboardingStage.ts` — `runOnboarding` 실패(throw) 캡처 경로(`withStageRuntime`·`captureStageFailure`).

## 작업

### 1) refs를 arc payload에 저장 (마이그 0 · jsonb 확장)

- `runOnboarding`에서 아크 insert 시 payload에 **경량 refs** 포함: `references: { title, url, videoId }[]`(자막 전문·videoFacts는 저장 안 함 — 용량·입력 전용). `prepareOnboarder`가 준 `references[]`에서 이 3필드만 뽑아 저장.
- `OnboardingArc` 타입(schema.ts)에 optional `references?: { title: string; url: string; videoId: string }[]` 추가(하위호환·기존 아크엔 없음).

### 2) 리더 `loadOnboardingReferences`

- `src/pipeline/onboarding.ts`에 `loadOnboardingReferences(supa, runId): Promise<{title,url,videoId}[]>` — 최신 onboarding proposal payload의 `references ?? []`. `loadOnboardingArc` 미러(없으면 빈배열·throw 0).

### 3) 0개 블록 표면화 확인

- step0의 `prepareOnboarder` throw가 `runOnboarding`→`onboardingStageFn`(`withStageRuntime`)에서 실패로 잡혀 상태가 실패로 남는지 확인(별도 코드 불필요할 수 있음 — 기존 captureStageFailure 경로). UI 표면화는 step2에서 문구로.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 회귀 테스트 포함 전부 통과
npm run build
```

신규/확장 테스트:
- `runOnboarding` insert payload에 `references`(경량 3필드) 포함(모킹).
- `loadOnboardingReferences`: 있으면 배열·없으면 []·throw 0.
- 기존 아크(references 없는)도 로드 안 깨짐(하위호환).

## 검증 절차
1. AC 실행.
2. 체크리스트: 마이그 0(jsonb payload 확장). 경량 저장(자막 전문 저장 X). 하위호환(기존 payload 안 깨짐). loadOnboardingArc 미러.
3. `phases/onboarding-references/index.json` step 1 갱신.

## 금지사항
- **마이그레이션/새 테이블/새 컬럼 만들지 마라 — payload(jsonb) 확장으로.**
- **자막 전문(transcript)을 payload에 저장하지 마라 — title/url/videoId 경량만**(용량·입력 전용).
- **UI를 건드리지 마라(step2).**
- 기존 아크 payload 하위호환을 깨지 마라(references 없어도 로드 정상).
- 기존 테스트를 깨뜨리지 마라.
