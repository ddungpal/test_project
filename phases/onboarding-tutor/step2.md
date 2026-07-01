# Step 2: onboarding-transcript-input

쏙이의 **입력**을 공급한다 — 하이브리드: (가) 레퍼런스 영상 자막 + (나) 영상이 쓴 숫자/사실(미검증). 자막 취득은 **유일한 신규 의존성 후보**라 이 step에 격리하고, 실패해도 크래시 없이 폴백한다.

## 읽어야 할 파일

- `docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md` — 설계 단일 출처. 특히 "B. 입력 — 하이브리드"와 "핵심 시퀀싱"(셜록 사실은 아직 없음 → (나)는 영상 자체 주장).
- `src/agents/onboarder/schema.ts` — `OnboarderInput`(step 0).
- `src/pipeline/externalSignals.ts` — `searchYouTube`·`fetchVideoStats`·`ExternalItem`(레퍼런스 영상·`thumbnailUrl`·best-effort 통계 패턴). **레퍼런스 영상 선택은 여기서 이미 수집한 것 재사용.**
- `src/agents/structurer/prepare.ts` — `getSelectedStagePayload(supa, runId, "topic")`로 선택된 주제 payload 읽는 패턴(prepare 작성 참고).
- `src/agents/comparator` / `src/pipeline/researchCell.ts` 중 prepare가 payload를 조립하는 최근 예시.

## 작업

### 1) `src/lib/onboarding/transcript.ts` — 경량 자막 취득 (best-effort)

```ts
// videoId(또는 URL)로 자막 텍스트를 best-effort 취득. 실패·없음 → null (throw 금지).
export async function fetchTranscript(videoId: string): Promise<string | null>;
```

- **키 불필요 라이브러리 우선**(예: `youtube-transcript` 류). 새 의존성을 추가하면 `package.json`에 명시하고, **CLAUDE.md/rules 규칙대로 `.env.example` 영향 없음 확인**(이 라이브러리는 키 불필요라 env 무영향이어야 함).
- **best-effort**: 네트워크 실패·자막 없음·비공개는 전부 `null` 반환. `fetchVideoStats`의 best-effort 패턴 미러(throw 0). 이유: 자막 실패가 온보딩 전체를 막으면 안 됨.
- 라이브러리가 마땅치 않거나 불안정하면, **폴백만으로 시작해도 됨**(아래 prepare가 자막 null일 때 영상 설명+LLM으로 감당). 그 경우 이 파일은 `null` 반환 스텁 + 주석으로 업그레이드 경로 명시(`// ponytail: 자막 라이브러리 미도입, 설명 기반 폴백. 자막 품질 필요 시 도입`).

### 2) `src/agents/onboarder/prepare.ts` — 하이브리드 입력 조립

```ts
export async function prepareOnboarder(supa, runId): Promise<OnboarderInput>;
```

- 선택된 주제 payload에서 `topic`(제목) 로드(`getSelectedStagePayload("topic")`).
- **레퍼런스 영상 1개 선택**: 이미 수집된 외부 레퍼런스(outlier/searchYouTube 결과) 중 **최상위 1개**(배수/조회수 상위). 없으면 `referenceTitle`·`transcript`·`videoFacts` 생략.
- **(가)** `fetchTranscript(videoId)` → `transcript`(null이면 생략).
- **(나)** 영상이 쓴 숫자/사실: 레퍼런스 메타(제목·설명·통계)에서 뽑을 수 있는 **가벼운 사실 스니펫**을 `videoFacts`로. **셜록 호출 금지**(리서치는 아직 안 돌았고 이 시점에 검증 파이프라인을 만들지 않는다) — 여기 사실은 "영상 주장"이며 쏙이 SYSTEM이 미검증으로 다룬다.
- 자막·영상 둘 다 없으면 `{ topic }`만으로도 유효한 입력(쏙이가 topic만으로 아크 생성 — 품질은 낮아도 크래시 0).

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 신규 tests/onboardingTranscript.test.ts 포함
npm run build
```

신규 `tests/onboardingTranscript.test.ts`:
- `fetchTranscript`가 실패/없음에서 `null` 반환(throw 안 함) — 네트워크는 목/스텁으로.
- `prepareOnboarder`: 자막 null일 때 `transcript` 생략하고 나머지 필드로 유효한 `OnboarderInput` 반환(fake supa 라운드트립).

## 검증 절차

1. AC 실행.
2. 아키텍처 체크리스트: best-effort(throw 0)·`getSelectedStagePayload` 재사용·셜록 미호출·신규 의존성 있으면 `package.json` 정확히 명시(정확한 버전 핀·CLAUDE.md 스택 벗어남 없음).
3. `phases/onboarding-tutor/index.json` step 2 갱신(summary에 **신규 의존성 도입 여부·폴백 동작**을 반드시 명시 — 다음 step·사람이 알아야 함).

## 금지사항

- **`fetchTranscript`·`prepareOnboarder`에서 throw 하지 마라.** 이유: 자막/영상 부재가 온보딩을 막으면 안 됨(best-effort). null/생략으로.
- **셜록(리서치) 에이전트나 검증 파이프라인을 호출·신설하지 마라.** 이유: 리서치는 구다리 뒤 단계. 이 시점 사실은 "영상 주장"(미검증)이고 진짜 검증은 셜록 몫(시퀀싱).
- **자막 라이브러리로 API 키가 필요한 걸 도입하지 마라(가능하면).** 이유: 키 관리·비용·env 누락 리스크. 키 불필요 방식 우선, 불가피하면 blocked로 사람에게 물어라.
- **새 env 변수를 추가하면 `.env.example`에도 추가하라.** 이유: 운영·협업자 설정 누락 방지(rules).
- 기존 테스트를 깨뜨리지 마라.
