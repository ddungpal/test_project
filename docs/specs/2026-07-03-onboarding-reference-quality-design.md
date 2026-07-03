# 온보딩 근거 영상 품질 개선 (onboarding-reference-quality)

작성일: 2026-07-03

## 배경 / 문제

온보딩 '근거 영상' 3개가 조회수·구독자수가 매우 낮게 뽑힌다(예: 조회수 734·구독자 1,370).
유저가 유튜브에서 직접 검색하면 더 성과 좋은 영상이 뜨는데도.

## 근본 원인 (코드로 확정)

1. **🔴 랭킹 목표가 틀림** — 참조 선발(`pickTopReferences`)이 토픽 발굴용 랭킹(`rankExternalByMultiplier`)을
   재사용한다. 이건 **배수 = 조회수÷구독자 desc**로 정렬 → "채널 규모 대비 얼마나 떴나"(상대 바이럴). 근거 영상엔
   정반대 목표다. 실측: 조회수 734/구독자 1,370 = **배수 0.54로 1위**, 82,115/319,000 = 0.26, 9,104/283,000 = 0.032.
   → 가장 안 퍼진 초소형 영상이 오히려 1위. **`order=viewCount` 패스가 고조회 영상을 이미 가져와도 배수 랭킹이 도로 버린다.**
2. **쿼리** — 검색어가 깔끔한 키워드가 아니라 **주제 제목 문장 통째**(`topic.title`)라 API relevance가 낮다.
3. **풀이 얕음** — `searchYouTube` perPass가 **하드캡 10**이라 후보 풀이 작다.

배수 랭킹 자체는 **토픽 발굴엔 옳다**(뜨는 영상 찾기) — 그대로 두고, **근거 영상 경로만** 고친다.

## 결정 (①②③ 묶음)

- **① 참조는 절대 조회수 순으로** — 새 순수 랭커 `rankExternalByViews`(조회수 desc·구독자 tiebreak)를 만들고
  `pickTopReferences`·완화 체인이 그걸 쓴다. (`rankExternalByMultiplier`는 발굴·hook_maker용으로 유지.)
- **② 쿼리 키워드 정제** — 순수 헬퍼 `refYouTubeQuery(title)`로 제목에서 핵심 키워드만 남겨 검색.
- **③ 풀 확대** — `searchYouTube` perPass 캡 10→20(단 caller가 요청할 때만). 참조는 maxPerQuery=20으로 검색.

## 설계

### ① `rankExternalByViews` (externalSignals.ts·신규 순수 함수)

```ts
// 절대 조회수 desc 상위 n — 근거 영상용("많이 본 = 잘 전달됨"). 순수·결정적·입력 비변형.
//   viewCount desc → null(미상)은 후순위 → tie는 subscriberCount desc → 최종 id asc(안정).
//   ★ rankExternalByMultiplier(배수·발굴용)와 구분.
export function rankExternalByViews(items: ExternalItem[], n: number): ExternalItem[];
```

`pickTopReferences`(prepare.ts)를 `rankExternalByMultiplier(eligible, n, FLOOR_SUBS)` →
`rankExternalByViews(eligible, n)`로 교체(eligible = youtube & viewCount != null 유지).

### ② `refYouTubeQuery` (prepare.ts·신규 순수 함수, export)

```ts
// 참조 검색용 쿼리 정제 — 주제 제목에서 핵심 키워드만. 순수·throw 0.
//   1) 대괄호/소괄호 세그먼트([EP.65]·(사연편)) 제거. 2) 첫 구분자(',' '|' 개행) 앞 절만 유지.
//   3) 따옴표·후행 문장부호(?!.…~)·잉여 공백 정리. 4) 결과가 2자 미만이면 원 제목(trim) 폴백.
export function refYouTubeQuery(topicTitle: string): string;
```

예: `"커버드콜 ETF, 배당 진짜 나올까? [EP.65]"` → `"커버드콜 ETF"`.

### ③ 풀 확대 (externalSignals.ts `searchYouTube`)

- perPass 캡 상향: `Math.min(Math.max(max, 10), 10)` → `Math.min(Math.max(max, 10), 20)`.
  - search.list quota는 결과 수와 무관하게 호출당 고정(100유닛)이라 **quota 증가 0**. 보강(videos/channels.list)은
    배치라 비용 무시. 발굴 경로는 maxPerQuery≤5라 여전히 10(영향 없음) — caller가 >10 요청할 때만 늘어난다.

### `gatherReferences`(prepare.ts) 체인 재작성

```
q = refYouTubeQuery(topic)                                  // ②
items = gatherExternalSignals({ ytQuery: q, maxPerQuery: 20, ... })   // ③
refs = pickTopReferences(items, REF_TARGET)                 // ① 조회수 랭킹 + viewCount 필터
if refs.length >= REF_TARGET → return
(b) viewCount 필터 제거: refs = rankExternalByViews(items.filter(youtube), REF_TARGET) → 충분하면 return
(c) 쿼리 완화: relaxed = relaxQuery(q); relaxed !== q 면 재검색·merge(url dedup)·rankExternalByViews
return refs
```

- ★ 기존 (a)단계(FLOOR_SUBS 하한 제거)는 **삭제** — 조회수 랭킹은 FLOOR_SUBS를 안 쓰므로 step0과 중복 무의미.
- url(videoId) dedup은 기존 병합 로직 유지.

## 테스트

- `tests/rankExternalByViews.test.ts`(또는 기존 externalSignals 테스트 확장): 조회수 desc·null 후순위·구독자 tiebreak·id tiebreak·slice n.
- `tests/refYouTubeQuery.test.ts`: 대괄호 제거·첫 콤마 앞 유지·따옴표/후행부호 정리·빈/짧음 폴백.
- 기존 온보더 참조 테스트(`onboarderMultiRef`·`onboardingReferences`)가 **배수 순서**를 assert하면 조회수 순으로 정정.

## 불변식 / 하위호환

- `rankExternalByMultiplier`는 그대로(발굴·hook_maker 무영향). 변경은 **온보더 참조 경로 한정**.
- 촉이·훅이·썸네일 프롬프트·promptHash 무관(LLM 프롬프트 미변경). youtube fixture는 쿼리·maxResults 변경으로
  재record(YOUTUBE_FIXTURES 워크플로우·$0). 마이그 0·의존성 0.

## 범위 밖 (Out of scope)

- 절대 품질 하한(min views/subs 컷) — 이번은 랭킹·쿼리·풀만(하한은 니치 주제 공백 위험, 다음 후보).
- 참조 신선도(오래된 고조회 컷) — 향후.
- 배수 랭킹을 발굴 쪽에서 바꾸는 것(그쪽은 배수가 맞음).

## AC

```bash
npm run typecheck
npm test
npm run build
```

완료 시 `phases/onboarding-reference-quality/index.json` step0을 `completed` + `summary`로 갱신.
