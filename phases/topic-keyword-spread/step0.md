# Step 0: multi-keyword-youtube

**버그/회귀 픽스(라이브 발견)**: 발굴 모드 주제 런이 **한 주제로만 쏠린다**(예: 예적금 종류 4개). 원인 = youtube 외부 검색이 **댓글 1위 키워드(`topTerms[0]`) 하나로만** 돌아 외부 영상이 단일 테마뿐 + (직전 `topic-youtube-only`로 다양성 공급원이던 웹 트렌드 쿼리 제거). 이 step은 **top-3 distinct 수요 키워드로 youtube 검색을 확장**하고, 외부 영상을 **테마별로 분산 선택**한다.

## 배경 (진단)

- `prepare.ts`: `gatherExternalSignals({ ytQuery: keyword ?? topTerms[0] })` — 발굴 모드도 **단일 키워드**. → 외부 영상 6개가 1위 키워드 한 테마에 쏠림. top-2·top-3 키워드는 youtube 신호 0.
- `topic-youtube-only`(직전)가 웹(`webQueries`)을 끊으면서, 예전에 트렌드/제도 쿼리가 주던 **테마 다양성**도 사라짐.
- 결과: 외부 근거가 한 테마뿐 → (step1 프롬프트가 "youtube 근거 과반" 강제) → 후보가 그 한 테마로 쏠림.
- **처방(이 step)**: youtube 검색을 top-3 distinct 키워드로 + 선택을 테마별 분산. youtube-only는 유지.

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·거버넌스(C: 외부엔 키워드 쿼리만).
- `src/agents/topic_scout/externalSignals.ts` — `gatherExternalSignals`(현재 단일 `ytQuery`)·`searchYouTube`·`mergeSearchPasses`·`ExternalItem`·`viewsPerSubscriber`·`rankExternalByMultiplier`·`FLOOR_SUBS`(hook_maker/externalRefs). **주 대상**.
- `src/agents/topic_scout/prepare.ts` — line ~58 `topTerms = keyword_signals.slice(0,3)` · `gatherExternalSignals` 호출 · `external_items = rankExternalByMultiplier(youtube, 6, FLOOR_SUBS)`.
- `src/agents/topic_scout/discovery.ts` — line ~142 `gatherExternalSignals({ ytQuery: topComment[0]?.term ... })`.
- `tests/viewsMultiplier.test.ts`·`tests/discovery.test.ts` — 순수 테스트 스타일·발굴 케이스.

## 작업

### 1) `gatherExternalSignals` — 다중 ytQuery + 출처 키워드 태깅

- 입력에 `ytQueries?: string[]` 추가(기존 `ytQuery?: string`은 유지하거나 `ytQueries`로 흡수 — 단일 호출부 깨지지 않게). 빈/공백 쿼리는 스킵.
- 각 ytQuery마다 youtube 검색(기존 2패스 relevance+viewCount 경로 그대로) → **videoId 기준 전역 dedup**(여러 키워드가 같은 영상 주면 첫 쿼리 것 유지).
- `ExternalItem`에 **`sourceQuery: string | null`** 추가(어느 키워드로 발견됐나 — 분산 선택용·웹은 null). searchYouTube 결과에 그 쿼리를 태깅.
- 거버넌스/best-effort/통계 보강(stats·subs)·id 부여 방식은 기존 유지.

### 2) 순수 분산 선택 헬퍼 — `pickSpreadYoutube`

```ts
// youtube ExternalItem을 sourceQuery(테마)별로 고르게 분산해 상위 n.
//   각 테마 내부는 배수(viewsPerSubscriber) desc 랭킹 → 테마들을 라운드로빈으로 번갈아 picks
//   → n개 슬롯이 한 테마에 쏠리지 않고 여러 테마를 커버. 순수·결정적·입력 비변형.
export function pickSpreadYoutube(items: ExternalItem[], n: number, floorSubs: number): ExternalItem[];
```

- 테마(sourceQuery)별 그룹 → 각 그룹 내 `rankExternalByMultiplier` 동일 정렬 → **라운드로빈**(테마1 1위, 테마2 1위, 테마3 1위, 테마1 2위 …)으로 n개. 한 테마만 있으면 그 테마에서 n개(폴백·기존 동작).
- `sourceQuery` null(웹·태그 없음)도 한 그룹으로 취급(누락 방지). `viewsPerSubscriber`·`rankExternalByMultiplier` 재사용(재구현 금지).

### 3) `prepare.ts` 적용

- 발굴 모드: `ytQueries: topTerms`(top-3 distinct·빈 항목 제거), 키워드 모드: `ytQueries: [keyword]`(단일 — 그 키워드 집중 의도 유지). `ytQuery` 단일 인자 제거/대체.
- `external_items = pickSpreadYoutube(gathered.filter(youtube), 6, FLOOR_SUBS)`(기존 rankExternalByMultiplier 대체 — 분산 적용).
- `sources`·`overlap_terms`·나머지 input 불변. 댓글 신호 보존.

### 4) `discovery.ts` 적용 (발굴 cron 일관성)

- `ytQueries: topComment.slice(0,3).map(c=>c.term)`(top-3 댓글 키워드·없으면 연도 재테크 폴백). 경쟁영상 후보가 여러 테마로 퍼지게.

### 5) 테스트 `tests/topicKeywordSpread.test.ts`

- `pickSpreadYoutube`: 3테마 입력 → n=6이면 테마별 ~2개로 분산(한 테마 쏠림 없음)·각 테마 내부 배수 desc. 1테마만이면 그 테마 n개(폴백). sourceQuery null 그룹 보존.
- `gatherExternalSignals`(순수 가공부): 여러 ytQueries → videoId dedup·sourceQuery 태깅(네트워크는 fake/분리).

## ‼️ 주의

- **리서치 단계 검색 불변**(주제 경로만). **키워드 모드는 단일 키워드 유지**(그 주제 집중이 의도 — 분산은 발굴 모드만).
- **quota**: ytQueries N개 × 2패스 search(각 100) = 최대 N×200 units/run. **N=3 상한**(top-3)으로 제한 + 주석으로 비용 천장 명시(`// ponytail: 3 keywords × 2-pass = ~600 quota/run; dev는 fixture $0`). 과하면 perPass 축소.

## fixture/promptHash 주의

external_items(개수·순서·테마)가 바뀌면 topic_scout LLM 입력 변경 → 다음 라이브 런 자동 재기록(claude-p $0). **AC 무관**. 손으로 재기록 금지. (TOPIC_SCOUT_SYSTEM은 step1.)

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - 발굴 모드가 top-3 distinct 키워드로 youtube 검색하고, `pickSpreadYoutube`가 테마 쏠림 없이 분산하는가?
   - 키워드 모드는 단일 키워드 유지인가? 리서치 검색 불변인가?
   - `viewsPerSubscriber`·`rankExternalByMultiplier` 재사용(재구현 0)·입력 비변형인가? quota 주석 있는가?
3. `phases/topic-keyword-spread/index.json`의 step 0 갱신.

## 금지사항

- 키워드 모드를 다중 키워드로 만들지 마라(그 키워드 집중이 의도). 이유: focus 모드 훼손.
- 리서치 단계·`fact_verifier`·`search/` 검색을 건드리지 마라(주제 경로만).
- `viewsPerSubscriber`·`rankExternalByMultiplier`·`mergeSearchPasses`를 재구현하지 마라(import 재사용).
- ytQueries 상한을 3 초과로 늘리지 마라(quota 폭증). 이유: 비용 천장.
- 댓글 신호·comment 후보를 제거하지 마라. fixture를 손으로 재기록하지 마라.
- 명세 외 신규 파일을 커밋에 섞지 마라(`git status`). 기존 테스트를 깨뜨리지 마라.
