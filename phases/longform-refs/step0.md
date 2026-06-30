# Step 0: shorts-filter

**사용자 요구(라이브 검증으로 발견)**: 유튜브 레퍼런스에 **숏폼(Shorts)이 롱폼과 섞여** 들어온다. 김짠부는 **롱폼 레퍼런스**만 찾는다. 외부 유튜브 레퍼런스를 **롱폼으로 제한**하라.

## 배경 (진단 — 왜 숏폼이 섞이나)

- 모든 외부 유튜브 레퍼런스(주제 발굴·제목·썸네일)는 **단 하나의 함수** `searchYouTube`(`src/agents/topic_scout/externalSignals.ts`)를 거친다. 소비처:
  - `gatherExternalSignals` → `topic_scout/prepare.ts`·`discovery.ts`(주제 레퍼런스)
  - `hook_maker/externalRefs.ts`의 `gatherTitleReferences`(제목)·`gatherOutlierThumbnails`(썸네일)
- `searchYouTube`는 `search.list`를 `type: "video"`로만 호출하고 **영상 길이를 전혀 보지 않는다** → 숏폼이 그대로 풀에 들어온다.
- **YouTube API에는 "Shorts" 플래그가 없다.** 영상 길이(`contentDetails.duration`, ISO 8601)로만 판별해야 한다. Shorts 최대 길이는 현재 3분(180s, 2024.10~).
- **핵심 처방**: 이미 호출 중인 `fetchVideoStats`(videos.list)에 `contentDetails`를 얹어 길이를 받고, **기준 길이 이하 영상을 `searchYouTube` 반환 전에 필터**한다. 단일 지점이라 모든 소비처가 한 번에 롱폼만 받는다(근본 원인 1곳 수정).

## 읽어야 할 파일

- `src/agents/topic_scout/externalSignals.ts` — **주 대상**. `VideoStats`/`fetchVideoStats`(videos.list part=statistics)·`searchYouTube`(union → 통계 보강 → map). `numOrNull` 안전 파서·`mergeSearchPasses` 패턴.
- `src/agents/hook_maker/externalRefs.ts` — `gatherTitleReferences`·`gatherOutlierThumbnails`(이 함수들이 위 단일 지점을 거친다는 점만 확인 — **수정 대상 아님**).
- `tests/engagementRate.test.ts` — `externalSignals.ts` 순수함수 단위테스트 스타일(네트워크 생략, 가공부만).

## 작업

### 1) 길이 파싱·판별 순수 헬퍼 — `externalSignals.ts`

```ts
// 롱폼 최소 길이 — 이 이하면 숏폼/짧은 클립으로 보고 제외. (5분 = Shorts 상한 + 짧은 클립까지 컷)
export const SHORTS_MAX_SEC = 300;

// ISO 8601 duration(PT#H#M#S) → 초. 못 파싱하면 null(길이 미상 → 통과). 순수(throw 0).
export function parseISODurationSec(iso: string | undefined | null): number | null;

// 롱폼 여부 — 길이 미상(null)은 통과시킨다.
export function isLongform(durationSec: number | null): boolean;
```

- `isLongform`: `durationSec == null || durationSec > SHORTS_MAX_SEC`.
- **길이 미상(null)은 반드시 통과(true)**. 이유: stats가 quota 실패로 빈 맵이면 전부 null이 되는데, 여기서 드롭하면 **레퍼런스 풀이 통째로 0**이 된다. null-stats 항목은 어차피 viewCount=null이라 다운스트림(`pickTopExternalTitles`·`pickTopOutlierThumbnails`가 viewCount==null 제외, `rankExternalByMultiplier`가 후순위)에서 자연 후순위/제외된다.
- 순수(네트워크·DB 없음).

### 2) 길이 보강 — `VideoStats`·`fetchVideoStats`

- `VideoStats`에 `durationSec: number | null` 추가.
- `fetchVideoStats`의 videos.list `part`를 `"statistics,contentDetails"`로 확장하고, `contentDetails.duration`을 `parseISODurationSec`로 파싱해 채운다. **best-effort 유지**(실패 시 빈 맵·throw 0).

### 3) 필터 적용 — `searchYouTube`

- 통계 보강(`fetchVideoStats`) 직후, `items`를 map 하기 **전에** `isLongform(stats.get(videoId)?.durationSec ?? null)`로 필터한다.
- 나머지(2패스 union·통계·구독자·썸네일·sourceQuery 매핑)는 **불변**.

### 4) 테스트 `tests/longformFilter.test.ts`

- `parseISODurationSec`: 초만(PT45S)·분초(PT1M30S)·분만(PT15M)·시분초(PT1H2M3S)·시만(PT2H)·빈/null/깨짐("PT","15:00")→null.
- `isLongform`: 기준 이하(30·60·정확히 `SHORTS_MAX_SEC`)→false, 기준 초과(`SHORTS_MAX_SEC+1`·900)→true, **null→true(풀 전멸 방지)**.
- 경계값은 `SHORTS_MAX_SEC` 상수 기준으로 작성(하드코딩 300 금지 — 기준 바뀌어도 테스트 안 깨지게).

## fixture/promptHash 주의

`searchYouTube` 결과(레퍼런스 항목 수)가 줄지만, 이는 **네트워크 데이터**이지 LLM 프롬프트 텍스트 스키마가 아니다 → promptHash **불변**, fixture 재기록 **불필요**. AC 무관(eval은 fixture 파일 읽기). 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 stale 캐시 의심 — `rm -rf .next` 후 재빌드로 판별).
2. 체크리스트:
   - 길이 필터가 `searchYouTube` **단일 지점**에 있어 제목·썸네일·주제 레퍼런스가 모두 롱폼만 받는가?
   - 길이 미상(null)이 **통과**되어 stats 실패 시 풀이 비지 않는가?
   - `fetchVideoStats` best-effort(throw 0)·2패스 union·매핑 나머지가 불변인가?
   - 테스트 경계값이 `SHORTS_MAX_SEC` 상수 기준인가?
3. `phases/longform-refs/index.json`의 step 0 갱신(completed+summary).

## 금지사항

- 길이 미상(null)을 드롭하지 마라. 이유: stats quota 실패 시 빈 맵 → 전부 null → 레퍼런스 풀 전멸.
- `videoDuration` 검색 파라미터로 서버사이드 필터만 쓰지 마라. 이유: medium(4–20분)/long(>20분)이 한 값으로 안 합쳐져 롱폼 일부가 누락된다 — 길이를 받아 post-filter가 정확.
- `searchYouTube`의 2패스 union·통계·구독자·썸네일·sourceQuery 매핑을 바꾸지 마라(길이 필터만 추가). 이유: 범위 최소·회귀 방지.
- `hook_maker/externalRefs.ts`·`prepare.ts`·`discovery.ts`를 수정하지 마라. 이유: 단일 지점(searchYouTube) 수정으로 충분 — 소비처는 손대지 않는다.
- 새 env를 남발하지 마라(YAGNI). 기준은 `SHORTS_MAX_SEC` 상수 하나. fixture를 손으로 재기록하지 마라.
- 명세 외 신규 파일(docs·다이어그램)을 커밋에 섞지 마라(`git status` 확인). 기존 테스트(현 923 통과)를 깨뜨리지 마라.
