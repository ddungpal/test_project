# Step 1: regenerate-action-and-staleness-helper (재생성 액션 + stale 헬퍼 + 아크 소스주제 저장)

> ⚠️ 전제: step0(refYouTubeQuery 키워드 추출 강화)이 먼저 머지됨. 이 step은 백엔드 배선.

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-regenerate-staleness-design.md` (설계 전문)
- `src/app/actions/topicRun.ts` — `requestOnboarding`(≈208·미러·건드리지 말 것)·`requireOwner`·`inngest.send` 패턴.
- `src/inngest/functions/onboardingStage.ts` — `runOnboarding(…, { force: event.data.force ?? false })`(이미 force 지원 확인).
- `src/inngest/client.ts` — `StageData`에 `force?: boolean` 있음(이벤트 스키마 변경 불필요).
- `src/pipeline/onboarding.ts` — `runOnboarding` 아크 조립(`const arc = { ...generated, references }` ≈130)·`appendOnboardingQuestions`(≈166 `{ ...existing, questions }`).
- `src/agents/onboarder/schema.ts` — `OnboardingArc` 타입(≈33)·`normalizeArc`(손대지 말 것).
- `.claude/rules/rules.md`, `CLAUDE.md`, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경

온보딩 아크가 캐시돼 주제가 바뀌어도 안 따라가고(주제↔아크 불일치), UI로 재생성할 방법이 없다. 이 step은
**백엔드**만 만든다: (A) force 재생성 액션, (B) 아크에 소스 주제 저장 + stale 판정 순수 헬퍼. UI는 step2.

## 작업

### A-1. 신규 액션 `regenerateOnboarding(runId)` (topicRun.ts)

`requestOnboarding` **바로 아래**에 추가(기존 requestOnboarding·난이도 경로는 무변경):
```ts
// 온보딩 아크 강제 재생성 — force로 캐시 우회. requestOnboarding 미러(requireOwner→이벤트).
export async function regenerateOnboarding(runId: string): Promise<void> {
  await requireOwner();
  await inngest.send({ name: "run/onboarding.requested", data: { runId, force: true } });
}
```

### B-1. 아크에 소스 주제 저장 (schema.ts + onboarding.ts)

- `schema.ts` `OnboardingArc` 타입에 `sourceTopicTitle?: string` 추가(references처럼 옵셔널·하위호환).
- `onboarding.ts` `runOnboarding` 아크 조립을 `sourceTopicTitle` 포함으로:
  `const arc: OnboardingArc = { ...generated, references, sourceTopicTitle: input.topic };`
  (input.topic = prepareOnboarder가 읽은 주제 제목. 빈 문자열이어도 그대로 저장.)
- `appendOnboardingQuestions`는 `{ ...existing, questions }`라 sourceTopicTitle 자동 보존 — **확인만**(추가 코드 불필요).
- `normalizeArc`는 **손대지 않는다**(sourceTopicTitle은 정규화 후 runOnboarding이 부착).

### B-2. 순수 헬퍼 `isOnboardingArcStale` (src/lib/onboarding/*.ts)

기존 `src/lib/onboarding/` 파일에 추가(신규 파일이면 `staleness.ts` 등). 컴포넌트 아닌 lib에(vitest @/ 함정):
```ts
/** 아크 소스 주제 ≠ 현재 선택 주제면 stale(true). 하나라도 없으면 false(구버전 아크·오경보 방지). 순수·throw 0. */
export function isOnboardingArcStale(arcSourceTitle: string | null | undefined, currentTopicTitle: string | null | undefined): boolean;
```
- 규칙: `arcSourceTitle` falsy/빈 → false. `currentTopicTitle` falsy/빈 → false. 둘 다 있고 `trim()` 후 다르면 true, 같으면 false.

## 테스트 `tests/onboardingArcStaleness.test.ts`

- 소스 없음(undefined/null/"") → false. 현재 없음 → false.
- 같은 제목 → false. 다른 제목 → true. 앞뒤 공백만 차이 → false(trim).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드(rules.md).
2. 체크리스트: `requestOnboarding`·난이도 경로 무변경인가? 이벤트 스키마(StageData.force) 그대로 쓰나(변경 없이)?
   sourceTopicTitle이 references와 같은 자리에서 부착되나? normalizeArc 무변경인가? 헬퍼가 구버전 아크에 오경보 안 내나?
   `database.types.ts`는 jsonb payload라 변경 불필요(스키마-타입 드리프트 아님) — 확인.
3. `git status`로 범위 외 신규 파일(fixtures 등) 확인·제외(rules.md).
4. `phases/onboarding-regenerate-staleness/index.json` step1을 `completed`+`summary`로 갱신.

## 금지사항

- `requestOnboarding` 시그니처·난이도(more) 경로를 바꾸지 마라(별도 액션 추가만).
- `normalizeArc`를 바꾸지 마라.
- 자동 재생성 로직을 넣지 마라(경고+수동만·step2 UI).
- 상태 전이를 만들지 마라(force 재생성은 새 proposal INSERT·전이 0).
- 기존 테스트를 깨뜨리지 마라.
