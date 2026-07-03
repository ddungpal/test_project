# Step 0: views-ranking-query-refine-wider-pool (근거 영상 품질 ①②③)

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-reference-quality-design.md` (설계·근본원인 전문)
- `src/agents/topic_scout/externalSignals.ts` — `rankExternalByMultiplier`(배수·미러 참고)·`searchYouTube`(perPass 캡)·`ExternalItem`.
- `src/agents/onboarder/prepare.ts` — `pickTopReferences`·`gatherReferences`(완화 체인)·`relaxQuery`·`FLOOR_SUBS` import.
- `src/agents/hook_maker/externalRefs.ts` — `FLOOR_SUBS`·`viewsPerSubscriber`(배수 랭킹이 발굴/hook에 그대로 쓰임 확인).
- `.claude/rules/rules.md`, `CLAUDE.md`, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경

온보딩 근거 영상이 저조회·저구독으로 뽑히는 원인 = 참조 선발이 **배수(조회수÷구독자) 랭킹**을 재사용해
초소형 고배수 영상을 앞세우고, `order=viewCount`로 가져온 고조회 영상을 도로 버리기 때문. 세 가지를 고친다:
① 참조는 **절대 조회수** 순 · ② **쿼리 키워드 정제** · ③ **풀 확대(10→20)**.
★ 배수 랭킹은 발굴·hook_maker엔 옳으므로 **그대로 두고, 온보더 참조 경로만** 바꾼다.

## 작업

### ① `rankExternalByViews` 신규 + `pickTopReferences` 교체

`externalSignals.ts`에 `rankExternalByMultiplier` 옆에 순수 함수 추가:
```ts
// 절대 조회수 desc 상위 n — 근거 영상용("많이 본 = 잘 전달됨"). 순수·결정적·입력 비변형([...items].sort).
//   viewCount desc → null(미상)은 후순위(-Infinity) → tie는 subscriberCount desc → 최종 id asc(안정).
export function rankExternalByViews(items: ExternalItem[], n: number): ExternalItem[];
```
`prepare.ts pickTopReferences`: `rankExternalByMultiplier(eligible, n, FLOOR_SUBS)` → `rankExternalByViews(eligible, n)`
(eligible = `youtube & viewCount != null` 유지). FLOOR_SUBS import가 pickTopReferences에서만 쓰였다면 죽은 import 정리
(단 gatherReferences 완화 체인에서 아직 쓰면 유지 — 확인 후 처리, rules.md 죽은 import 함정).

### ② `refYouTubeQuery` 신규 (prepare.ts·export)

```ts
// 참조 검색용 쿼리 정제 — 주제 제목에서 핵심 키워드만. 순수·throw 0.
//   1) 대괄호 [..]·소괄호 (..) 세그먼트 제거. 2) 첫 구분자(',' '|' 개행) 앞 절만 유지.
//   3) 앞뒤 따옴표·후행 문장부호(?!.…~)·잉여 공백 정리. 4) 결과 2자 미만이면 원 제목(trim) 폴백.
export function refYouTubeQuery(topicTitle: string): string;
```
예: `"커버드콜 ETF, 배당 진짜 나올까? [EP.65]"` → `"커버드콜 ETF"`.

### ③ 풀 확대 (`searchYouTube`)

- perPass 캡: `Math.min(Math.max(max, 10), 10)` → `Math.min(Math.max(max, 10), 20)`.
- 주석 갱신(사실상 20 천장·caller가 요청할 때만·search.list quota 불변).

### `gatherReferences` 체인 재작성 (prepare.ts)

```
q = refYouTubeQuery(topic)                                            // ②
items = gatherExternalSignals({ ytQuery: q, maxPerQuery: 20, ...동일 옵션 })   // ③
refs = pickTopReferences(items, REF_TARGET)                           // ① 조회수 랭킹
if (refs.length >= REF_TARGET) return refs
// (b) viewCount 필터 제거 — youtube 전부 재랭킹(재검색 없음)
refs = rankExternalByViews(items.filter((it) => it.source === "youtube"), REF_TARGET)
if (refs.length >= REF_TARGET) return refs
// (c) 쿼리 완화 재검색
relaxed = relaxQuery(q)
if (relaxed && relaxed !== q) { 재검색 → url(videoId) dedup 병합 → refs = rankExternalByViews(merged, REF_TARGET) }
return refs
```
- ★ 기존 (a) 단계(FLOOR_SUBS 하한 제거·배수 재랭킹)는 **삭제**(조회수 랭킹은 FLOOR_SUBS 무관·step0과 중복).
- 기존 try/catch·YouTubeQuotaError 전파·url dedup 로직은 **그대로 보존**(품질 랭킹만 교체·에러 정책 불변).

## 테스트

- `tests/rankExternalByViews.test.ts`: 조회수 desc·null 후순위·구독자 tiebreak·id tiebreak·slice n·입력 비변형.
- `tests/refYouTubeQuery.test.ts`: 대괄호 제거·첫 콤마 앞 유지·따옴표/후행부호 정리·빈/짧음 폴백.
- 기존 `onboarderMultiRef`·`onboardingReferences` 테스트가 **배수 순서**를 assert하면 **조회수 순으로 정정**(정오 원인 명시 주석).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드로 판별(rules.md).
2. 체크리스트: 참조가 조회수 desc로 뽑히나(배수 아님)? `rankExternalByMultiplier`는 발굴/hook에 그대로인가(무영향)?
   perPass 20 캡이 발굴(maxPerQuery≤5)엔 영향 없나? refYouTubeQuery 폴백 되나? 완화 체인 에러정책·dedup 보존됐나?
   죽은 import(FLOOR_SUBS 등) 없나?
3. `git status`로 명세에 없는 신규 파일(fixtures 등) 섞였는지 확인·범위 외 제외(rules.md).
4. `phases/onboarding-reference-quality/index.json` step0을 `completed`+`summary`로 갱신하고 phase status도 `completed`로.

## 금지사항

- `rankExternalByMultiplier`(배수)를 삭제·변경하지 마라 — 발굴·hook_maker가 쓴다(참조 경로만 조회수 랭킹).
- 절대 품질 하한(min views/subs 컷)·신선도 컷을 넣지 마라(범위 밖·니치 공백 위험).
- 완화 체인의 try/catch·YouTubeQuotaError 전파·url dedup을 바꾸지 마라(랭킹만 교체).
- perPass 캡을 20 넘겨 과도하게 올리지 마라(quota·토큰).
- 기존 테스트를 깨뜨린 채 두지 마라(배수→조회수 변경으로 깨지는 건 조회수 기준으로 정정).
