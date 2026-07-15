# Step 1: sectioned-orchestration

## 배경 (자기완결)

step 0에서 만든 `scribeSectionStep`(한 섹션의 세그먼트만 생성·`SCRIBE_SECTION_DIRECTIVE`)을 파이프라인에 배선한다. `runScriptStage`의 **단발 `scribeStep` 호출을 outline 섹션별 순차 루프로** 바꿔, claude-p가 섹션당 더 길게 쓰게 한다(가설: 격리 생성 시 섹션당 분량 증가 → 총 분량 증가).

**연속성이 최대 리스크** — 섹션을 나눠 생성하면 흐름이 끊길 수 있다. 각 섹션 호출에 **직전까지 대본의 끝부분(prior_tail)**을 넘겨 이어 쓰게 한다.

## 읽어야 할 파일

- `src/pipeline/scriptCell.ts` — **수정 대상**. `runScriptStage` 전체를 정독하라. 특히:
  - 입력 조립부(tone·structure·factsInput·assetsInput·target_persona) — 그대로 재사용.
  - **`scribeStep(llm, runId, scribeInput)` 호출부**(현재 단발) — 이걸 섹션 루프로 교체.
  - 생성 **이후** 로직: 표절 가드(`buildCorpusShingles`/`containment`/`PLAGIARISM_*`)·`normalizeSegmentPayload`·`script_segments` 저장·lineage(`script_segment_facts`/`_explanation_assets`)·`used_in_script` 갱신 — **전부 그대로 보존**(생성 방식만 바뀌고 세그먼트 배열은 동일 형태).
- `src/agents/scribe/step.ts` — `scribeSectionStep`(step 0) 시그니처.
- `src/agents/scribe/schema.ts` — `ScriptSegmentOut` 타입.

## 작업

`runScriptStage` 안에서 `scribeStep` 단발 호출을 **섹션별 순차 생성 루프**로 교체:

```ts
// outline 섹션 추출(구조 방어)
const sections = Array.isArray((structure as any)?.outline) ? (structure as any).outline : [];

let allSegments: ScriptSegmentOut[];
if (sections.length === 0) {
  // 폴백: outline 없으면 기존 단발 경로(scribeStep) 유지 — 회귀 안전.
  const scribe = await scribeStep(llm, runId, scribeInput);
  allSegments = scribe.segments;
} else {
  allSegments = [];
  for (let i = 0; i < sections.length; i++) {
    // 직전까지 대본의 끝부분(연속성) — 마지막 ~2 세그먼트 text를 이어붙여 상한 자른다(예: 500자).
    const prior_tail = buildPriorTail(allSegments, PRIOR_TAIL_CHARS);
    const res = await scribeSectionStep(llm, runId, {
      tone: toneInjection,
      section: sections[i],
      sectionIndex: i,
      totalSections: sections.length,
      prior_tail,
      facts: factsInput,      // 전역 인덱스 유지(lineage 일관)
      assets: assetsInput,    // 전역 인덱스 유지
      ...(scribeInput.target_persona ? { target_persona: scribeInput.target_persona } : {}),
    });
    allSegments.push(...res.segments);
    await setProgress(supa, runId, `1/2·대본 작성 (짠펜 ${i + 1}/${sections.length})`);
  }
}
// 전역 ord 재부여(섹션별 상대 ord를 무시하고 순서대로).
allSegments = allSegments.map((s, idx) => ({ ...s, ord: idx }));
```

이후 기존 표절 가드·저장·lineage 로직은 `allSegments`(= 기존 `scribe.segments` 자리)를 그대로 소비하게 연결한다.

**순수 헬퍼**(단위 테스트용, `src/lib/**` 또는 scriptCell 내 export):
```ts
// 마지막 N 세그먼트의 text를 이어 최대 maxChars로 자른 연속성 꼬리. prose text 위주(블록은 건너뛰어도 됨).
export function buildPriorTail(segments: { text: string; kind?: string }[], maxChars: number): string;
```
- 상수 `PRIOR_TAIL_CHARS = 500`, `CHUNK` 관련 값이 필요하면 상수로.
- (선택) 섹션을 1개씩이 아니라 N개씩 묶어 호출하고 싶으면 `SECTIONS_PER_CALL` 상수(기본 1)로 청크. **기본은 1(섹션당 1호출)** — 가장 확실히 섹션 분량을 확보. 튜닝 여지만 남겨라(과설계 금지).

**핵심 규칙:**
- 생성 **이후** 로직(표절 가드·segments 저장·lineage·used_in_script)은 **바꾸지 마라** — 세그먼트 배열 형태가 동일하므로 그대로 동작해야 한다.
- facts/assets 인덱스는 **전역**을 각 섹션 호출에 그대로 넘긴다(lineage 인덱스가 어긋나면 `script_segment_facts`가 엉킨다).
- `prior_tail`로 연속성을 유지한다(첫 섹션은 빈 문자열 → 오프닝 인사).
- 폴백(outline 없음)은 기존 `scribeStep` 경로 유지 — **회귀 안전망**.
- 단일 세그먼트 재생성(`scribeSegmentStep`)·segmentRegen 경로는 **건드리지 마라**(무관).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

- 신규 순수 헬퍼(`buildPriorTail`)와 오케스트레이션(섹션 루프·ord 재부여)을 단위 테스트로 검증. scribe LLM 호출은 스텁/목으로 대체(실 claude-p 호출은 AC 아님 — 기존 프로젝트에 LLM 목킹 인프라가 있으면 재사용, 없으면 `buildPriorTail`·ord 재부여 등 순수부만 테스트하고 오케스트레이션은 typecheck로 검증. 새 목킹 프레임워크를 도입하지 마라).
- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.

## 검증 절차

1. AC 실행.
2. 회귀: 생성 이후(표절 가드·저장·lineage) 코드가 **의미 변화 없이** `allSegments`를 소비하는지 diff로 확인. `scribeSegmentStep`/segmentRegen 미변경.
3. `git status`로 범위 외 untracked(fixtures replay 등) 제외.
4. `phases/script-sectioned-generation/index.json`의 step 1 갱신(완료 → completed + summary / 3회 실패 → error).

## 금지사항

- 표절 가드·`script_segments` 저장·lineage·`used_in_script` 로직을 바꾸지 마라. 이유: 이번 변경은 "생성 방식"만이고 세그먼트 배열 계약은 동일.
- lineage 인덱스가 어긋나게 섹션별 로컬 facts/assets를 넘기지 마라 — 반드시 전역 인덱스.
- 새 LLM 목킹 프레임워크·마이그레이션·의존성 추가 금지. 기존 테스트를 깨뜨리지 마라.
