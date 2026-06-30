# Step 0: prepare-youtube-rank

**버그 픽스(라이브 검증으로 발견)**: 키워드 모드 주제 런에서 **구독자 대비 조회수가 명백히 낮은 언더퍼포머**(예: 한경 코리아마켓 구독 73만·조회 3.9만 = **0.05배 플롭**)가 외부 레퍼런스로 노출된다. 원인은 per-run 경로(`topic_scout/prepare.ts`)가 외부 YouTube 영상을 **배수 랭킹 없이 그냥 앞에서 slice** 하기 때문. 이 step은 그 선택에 **배수(views/subscribers) desc 정렬**을 적용한다.

## 배경 (진단 — 왜 플롭이 뽑히나)

- 배수·반응도·품질바닥 개선은 `discovery.ts`(매일 발굴 **Cron** `refreshTopicCandidates`)와 제목·썸네일 레퍼런스 picker에만 들어갔다.
- 그러나 **주제 런 화면에 보이는 외부 레퍼런스**는 `topic_scout/prepare.ts`가 만든다 — 여기서 youtube 항목을 이렇게 고른다:
  ```js
  const external_items = [
    ...gathered.filter(web).slice(0, 12),
    ...gathered.filter((e) => e.source === "youtube").slice(0, 6),  // ← 배수 랭킹 없이 앞 6개
  ];
  ```
  `viewsPerSubscriber`·랭킹을 **전혀 호출하지 않아**, `searchYouTube` relevance 순서대로 들어온 영상(주제 관련성만 높고 성과는 플롭인 것 포함)이 그대로 노출된다.
- **핵심 처방**: youtube 항목을 slice 전에 **배수 desc로 정렬**하면, 플롭은 뒤로 밀려 잘려나가고 잘 터진 레퍼런스가 앞에 온다. 풀은 이미 `search-pool-engagement`(2패스)로 넓혀졌으므로, **하드 컷 임계값 없이 정렬+slice만으로 충분**하다(임계값 튜닝·풀 고갈 위험 회피).

## 읽어야 할 파일

- `src/agents/topic_scout/prepare.ts` — **주 대상**. line ~79의 `external_items`(web 12 + youtube 6 슬라이스) + 이 배열이 `input.external_items`(촉이 LLM 입력)와 `sources`(SourceLinks 표시) 양쪽에 쓰임.
- `src/agents/topic_scout/externalSignals.ts` — `ExternalItem`(viewCount/subscriberCount)·`viewsPerSubscriber(views, subs, floorSubs)`(순수·노이즈 컷). 여기에 정렬 헬퍼를 둔다(단일 출처).
- `src/agents/hook_maker/externalRefs.ts` — `FLOOR_SUBS`(=1000) 상수·`pickTopExternalTitles`의 배수 정렬 방식(미러 참고: 배수 desc·null 후순위·null끼리 조회수 desc·tie id asc).
- `tests/viewsMultiplier.test.ts`·`tests/hookMakerExternalRefs.test.ts` — 순수 정렬 테스트 스타일.

## 작업

### 1) 순수 정렬 헬퍼 — `externalSignals.ts`

```ts
// youtube ExternalItem을 구독자 대비 조회수 배수 desc로 정렬해 상위 n. 순수·결정적.
//   배수(viewsPerSubscriber, FLOOR_SUBS) desc → 배수 null(구독 비공개·노이즈 컷)은 후순위
//   → null끼리는 viewCount desc → tie는 id asc(안정). 입력 비변형(복사 정렬).
export function rankExternalByMultiplier(items: ExternalItem[], n: number, floorSubs: number): ExternalItem[];
```

- `viewsPerSubscriber`(기존)·`FLOOR_SUBS`(hook_maker/externalRefs에서 import 또는 인자) 재사용 — **재구현 금지**.
- 배수 null 항목을 **버리지 않는다**(후순위로) — 구독 비공개 영상도 유효 레퍼런스(누락 방지).
- **하드 언더퍼포머 컷(임계값 드롭)은 하지 않는다** — 정렬+slice면 충분하고, 임계 드롭은 작은 풀을 비울 위험이 있다(주석으로 근거).
- 순수(네트워크·DB 없음·입력 배열 비변형).

### 2) `prepare.ts` 적용

youtube 슬라이스를 헬퍼로 교체:
```js
const external_items = [
  ...gathered.filter((e) => e.source === "web").slice(0, 12),
  ...rankExternalByMultiplier(gathered.filter((e) => e.source === "youtube"), 6, FLOOR_SUBS),
];
```
- web 항목 처리·`overlap_terms`·`sources` 구성·`input` 나머지는 **불변**(youtube 선택만 배수 정렬).
- `FLOOR_SUBS` import 경로 확인(hook_maker/externalRefs.ts).

### 3) 테스트 `tests/topicRefRank.test.ts`

- 고배수(구독 적어도 조회 큰) 영상이 저배수 플롭(구독 73만·조회 3.9만류)보다 **앞에** 오는지.
- 풀이 n보다 크면 플롭이 **잘려나가는지**, n보다 작으면 전부 유지(누락 0)·플롭도 맨 뒤에 남는지.
- 배수 null(구독 비공개) 항목이 후순위로 가고 버려지지 않는지.
- FLOOR_SUBS 미만 초소형 채널이 배수 null 취급(후순위)인지.

## fixture/promptHash 주의

`external_items` 순서가 바뀌면 topic_scout LLM 입력이 변한다 → 기존 fixture는 다음 **라이브 런에서 자동 재기록**(claude-p $0). **AC 무관**(eval은 fixture 파일 읽기). 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - youtube 항목이 배수 desc로 정렬되어 플롭이 뒤로 가는가? web/sources/overlap은 불변인가?
   - `viewsPerSubscriber`·`FLOOR_SUBS` 재사용(재구현 0)인가?
   - 배수 null 항목이 후순위로 **보존**(누락 0)되는가? 하드 임계 드롭이 없는가(풀 고갈 방지)?
3. `phases/topic-ref-multiplier/index.json`의 step 0 갱신(completed+summary).

## 금지사항

- `viewsPerSubscriber`를 재구현하지 마라(import 재사용). 이유: 배수 정의 드리프트.
- 배수 null 항목을 통째로 버리지 마라(후순위로). 이유: 구독 비공개 영상도 유효 레퍼런스 — 누락 금지.
- 하드 언더퍼포머 임계 드롭을 넣지 마라. 이유: 작은 풀을 비워 레퍼런스가 0이 될 수 있다 — 정렬+slice로 충분.
- web 항목 처리·sources·overlap_terms·input 나머지를 바꾸지 마라(youtube 선택만). 이유: 범위 최소·회귀 방지.
- 새 env·임계 상수를 남발하지 마라(YAGNI). fixture를 손으로 재기록하지 마라.
- 명세 외 신규 파일(docs·다이어그램)을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
