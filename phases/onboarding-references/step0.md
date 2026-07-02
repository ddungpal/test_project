# Step 0: onboarder-multi-ref

쏙이(온보딩)의 레퍼런스 영상을 **1개 → 최대 3개**로 넓히고, **반드시 확보**(못 찾으면 온보딩 막음)하도록 `prepareOnboarder`의 수집 로직을 바꾼다. 이 step은 **수집·입력·프롬프트(백엔드)**만. 저장(payload)·UI는 step1/2.

## 읽어야 할 파일

- `docs/specs/2026-07-02-onboarding-references-design.md` — 이 phase 전체 설계(단일 출처). "결정" 절.
- `src/agents/onboarder/prepare.ts` — **수정 대상.** 현재 `gatherReference`(단일)·`pickTopReference`(top 1)·`buildVideoFacts`·`prepareOnboarder`. `gatherExternalSignals`(topic_scout/externalSignals) 재사용 패턴, `rankExternalByMultiplier`·`FLOOR_SUBS` 재사용.
- `src/agents/onboarder/schema.ts` — **수정 대상.** `OnboarderInput`(현재 `{topic, transcript?, videoFacts?, referenceTitle?}`)·`ONBOARDER_SYSTEM`·`normalizeArc`(아크 출력 방어·이 step에서 변경 불필요).
- `src/lib/onboarding/transcript.ts` — `fetchTranscript(videoId)`(best-effort·null 가능).
- `src/agents/topic_scout/externalSignals.ts` — `gatherExternalSignals`·`rankExternalByMultiplier`·`ExternalItem`(재구현 금지·재사용).

## 작업

### 1) `prepareOnboarder` / `gatherReference` — 3개 + 점진 완화 + 0이면 throw

- `pickTopReferences(items, n=3)` 신규(`rankExternalByMultiplier(items, 3, FLOOR_SUBS)` 재사용·youtube·viewCount 있는 것 우선). 기존 `pickTopReference`(단일)는 이걸로 대체하거나 n=1 특수화로 흡수.
- `gatherReference` → **다중 수집**: `gatherExternalSignals({ytQuery: topic, maxPerQuery: 10, ...})`로 10개 → top 3. **3개 미만이면 점진 완화 재수집**: (a) FLOOR_SUBS 하한 제거 → (b) viewCount 필터 제거(있는 것만→전부) → (c) 검색어 완화(예: topic 축약/키워드). 각 완화 단계에서 3개 채워지면 중단.
- **최종 0개면 `prepareOnboarder`가 throw**(명확한 메시지 "레퍼런스 영상을 찾지 못해 온보딩 불가"). 1~2개면 그대로 진행(≥1 보장). **★ 폴백으로 topic-only 진행 금지 — 반드시 refs ≥1 (설계 A+B 결정).**
- best-effort throw 삼킴(try/catch)은 **개별 수집 실패**에만(gatherTitleReferences 패턴). 최종 0개 판정은 throw로 전파.

### 2) `OnboarderInput` 다중화 (schema.ts)

- `references: { title: string; url: string; videoId: string; transcript?: string; videoFacts?: string[] }[]` 로 변경. 각 영상별 `fetchTranscript`·`buildVideoFacts`. 기존 단일 `transcript/videoFacts/referenceTitle`는 `references[]`로 흡수(제거).
- `prepareOnboarder`가 top 3 각각에 대해 transcript(null이면 생략)·videoFacts(빈배열이면 생략) 채워 `references[]` 조립. **`topic`은 유지.**

### 3) `ONBOARDER_SYSTEM` 보강

- "입력은 선택된 주제 + **여러 레퍼런스 영상**의 자막·사실이다. 이 여러 영상을 근거로 아하를 작성한다." 단일→복수 문구. money-safety(미검증 수치 → unverifiedNumbers)·듀얼훅·클리프행어·난이도 규칙은 **그대로 유지**.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 회귀 테스트 포함 전부 통과
npm run build
```

신규 `tests/onboarderMultiRef.test.ts`(또는 기존 onboarder 테스트 확장):
- `pickTopReferences`: 배수 상위 3개·null 후순위·2개뿐이면 2개.
- 점진 완화: 필터 있으면 <3 → 완화하면 3 (모킹 items로).
- 0개면 throw(폴백 금지 검증).

## 검증 절차
1. AC 실행.
2. 체크리스트: refs 0개면 throw(topic-only 폴백 없음). `gatherExternalSignals`·`rankExternalByMultiplier` 재사용(재구현 X). 자막 fetch best-effort(개별 실패 무시). 마이그·의존성 0.
3. `phases/onboarding-references/index.json` step 0 갱신.

## 금지사항
- **refs 0개일 때 topic-only로 진행하지 마라. 이유: 설계 A+B — 반드시 refs ≥1, 0이면 막는다.**
- **저장(payload)·UI를 건드리지 마라(step1/2).**
- **`gatherExternalSignals`/`rankExternalByMultiplier`를 재구현하지 마라 — 재사용.**
- **`ONBOARDER_SYSTEM`의 money-safety·듀얼훅·클리프행어·난이도 규칙을 없애지 마라**(단일→복수 문구만).
- 기존 테스트를 깨뜨리지 마라.
