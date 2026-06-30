# Step 0: youtube-search-stats

새 phase `search-pool-engagement`의 **검색·통계 토대**. 주제발굴 레퍼런스 영상이 매력적이지 않은 **근본 원인**을 고친다: (A) 검색이 `relevance` 정렬 + 소량(4~5개)이라 **고조회·바이럴 영상이 후보 풀에 안 들어옴**, (B) **반응도(좋아요·댓글) 신호를 아예 안 읽음**. 이 step은 검색 풀을 넓히고(A) 반응도 통계를 수집한다(B). 점수·필터 적용은 step1.

## 배경 (진단)

- `searchYouTube`(`externalSignals.ts`)가 `order:"relevance"` + `maxResults` 4~5로만 검색 → **풀이 고조회 영상을 안 담는다.** outlier-refs phase가 점수(배수)를 고쳤지만 **풀이 그대로**라 매력적 영상이 애초에 후보에 없다.
- `fetchVideoViews`가 `part=statistics`에서 **viewCount만** 읽는다 — 같은 응답의 **likeCount·commentCount를 버린다** → 반응도 측정 불가.
- `gatherExternalSignals`는 **주제발굴·제목 레퍼런스·썸네일 아웃라이어가 공유**한다 → 검색 풀 개선은 셋 다에 효과가 간다.

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·거버넌스(C: 외부엔 집계 키워드 쿼리만·공개 웹데이터).
- `src/agents/topic_scout/externalSignals.ts` — **이 step의 주 대상**. `ExternalItem`(viewCount/subscriberCount/thumbnailUrl)·`YtSearchItem`·`searchYouTube`(order:relevance·maxResults)·`fetchVideoViews`(viewCount만)·`fetchChannelSubs`·`gatherExternalSignals`·`viewsPerSubscriber`.
- `src/agents/topic_scout/discovery.ts` — `competitorSignalScore`(step1이 반응도 반영할 소비처 — 여기선 안 건드림).
- `tests/viewsMultiplier.test.ts` — 순수 헬퍼 테스트 스타일.

## 작업

### A) 검색 풀 확대 — `searchYouTube`

`searchYouTube(query, max)`가 **두 정렬을 합친 풀**을 반환하게 한다(콜러 시그니처는 유지):

- `order:"relevance"`(주제 적합) **+** `order:"viewCount"`(고조회) 두 번 호출 → `videoId` 기준 **dedup 병합**. 각 패스 `maxResults`는 넉넉히(예: 10) — 합쳐서 풀이 커진다.
- 통계 보강(`fetchVideoStats`·`fetchChannelSubs`)은 **병합된 union에 1회 배치**(중복 비용 없음).
- 두 search.list는 각 100 quota라 호출당 quota↑ — **주석으로 비용 천장 명시**(`// ponytail: 2-pass search = 200 quota/call; single-pass if quota tight`). ytQuery는 run당 1개라 영향 제한적. dev는 fixture $0.
- best-effort 유지(한 패스 실패해도 나머지로 진행·throw는 기존 정책 따름).

### B) 반응도 통계 수집 — `fetchVideoViews` → `fetchVideoStats`

- `fetchVideoViews`를 `fetchVideoStats`로 확장(또는 신규): `part=statistics`에서 `viewCount`·**`likeCount`·`commentCount`**를 읽어 `Map<videoId, {views, likes, comments}>` 반환. likeCount/commentCount는 비공개일 수 있어 **null 허용**.
- `ExternalItem`에 `likeCount: number | null`·`commentCount: number | null` 추가(additive). `searchYouTube`가 채움. 웹 항목은 null.
- 순수 헬퍼 `engagementRate(views, likes, comments)`: `views`가 없거나 ≤0이면 `null`, 아니면 `(likes ?? 0 + comments ?? 0) / views`. (likes·comments 둘 다 null이면 반응도 미상 → `null` 반환할지 0으로 볼지: **둘 다 null이면 null**(미상)·하나라도 있으면 있는 것만 합산.) 순수·throw 0.

### 테스트 `tests/engagementRate.test.ts`

- `engagementRate`: 정상(좋아요+댓글)/views 계산. views 0·null → null. likes·comments 둘 다 null → null. 하나만 있으면 그것만 반영.
- (가능하면) searchYouTube 병합·dedup의 순수 가공부를 분리해 테스트(videoId 중복 제거·union). 네트워크는 단위테스트 제외.

## fixture/promptHash 주의

검색 풀이 바뀌면 `gatherExternalSignals` 결과(개수·순서)가 달라져 **topic_scout·hook_maker LLM 입력이 변한다** → 기존 fixture는 다음 **라이브 런에서 자동 재기록**(claude-p $0). **AC 무관**(eval은 fixture 파일 읽기). likeCount/commentCount는 evidence/점수용(step1)·LLM 프롬프트엔 step1 결정. **손으로 재기록 금지.**

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - `searchYouTube`가 relevance+viewCount 두 패스를 dedup 병합하고 통계는 union 1회 배치인가? 2-pass quota 주석이 있는가?
   - `fetchVideoStats`가 likeCount·commentCount를 null 안전하게 읽는가? `ExternalItem` 추가가 additive인가?
   - `engagementRate`가 순수·null 방어인가? `discovery`/`pickTop*`는 **이 step에서 불변**인가(소비는 step1)?
3. `phases/search-pool-engagement/index.json`의 step 0 갱신.

## 금지사항

- `competitorSignalScore`·`pickTopExternalTitles`·`pickTopOutlierThumbnails`를 이 step에서 바꾸지 마라. 이유: step1 범위 — 여기선 풀·통계 수집만.
- 거버넌스 C 위반 금지 — 외부로 나가는 건 키워드 쿼리뿐(댓글 원문 아님). 기존대로.
- likeCount/commentCount를 이 step에서 LLM 프롬프트 입력에 넣지 마라. 이유: 점수/표시 반영은 step1 — 불필요한 promptHash 변동 분산 방지.
- maxResults를 과도하게(예: 50) 키우지 마라. 이유: quota·LLM 토큰 폭증. 10 내외로.
- 명세 외 신규 파일을 커밋에 섞지 마라(`git status`). 기존 테스트를 깨뜨리지 마라.
