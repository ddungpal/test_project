# Step 1: discovery-engagement-quality

`search-pool-engagement`의 **점수·필터 레이어**. 주제발굴 경쟁영상 후보가 (B) **반응도(좋아요·댓글)** 를 점수에 반영하고, (D) **품질 바닥**(최소 조회수·최근성) 미만은 후보에서 거른다. step0이 넓힌 풀 + 수집한 반응도 통계를 실제 선정에 쓰는 단계.

## 배경

- step0: `searchYouTube`가 relevance+viewCount 병합으로 풀 확대, `ExternalItem`에 `likeCount`·`commentCount` 추가, 순수 `engagementRate(views, likes, comments)`.
- 현재 `discovery.competitorSignalScore`는 `log10(views) * (1 + log10(mult))` — 조회수·구독배수만. 반응도 미반영.
- 현재 경쟁영상은 **품질 바닥 없이** 전부 후보화(저조회·오래된 영상도).

## 읽어야 할 파일

- step0 산출물: `src/agents/topic_scout/externalSignals.ts`의 `ExternalItem`(likeCount/commentCount/viewCount/subscriberCount/published_at)·`engagementRate`·`viewsPerSubscriber`.
- `src/agents/topic_scout/discovery.ts` — **주 대상**. `competitorSignalScore`(순수·테스트됨)·경쟁영상 후보 빌드 루프(`for (const e of external)`·rationale·evidence·signal_score)·`FLOOR_SUBS` import.
- `tests/discovery.test.ts` — `competitorSignalScore` 기존 테스트(회귀 기준).

## 작업

### B) 반응도를 점수에 반영 — `competitorSignalScore`

- 시그니처를 확장해 반응도를 받는다(예: `competitorSignalScore(viewCount, subscriberCount, engagement)` 또는 `(viewCount, likeCount, commentCount, subscriberCount)`로 내부에서 `engagementRate` 계산). **순수 유지.**
- 수식: 기존 `base = log10(views+1)`, 배수 가중 `(1 + log10(mult+1))`에 **반응도 가중**을 곱한다 — 예: `* (1 + k*engagementRate)`(engagement null이면 ×1 폴백·회귀 최소). 단조 증가·결정적·폭발 방지(반올림 유지). k·상한은 주석으로 근거. **배수·반응도 둘 다 null이면 기존 조회수 폴백과 동일**(회귀 0).
- evidence/ rationale에 반응도 노출: `evidence.detail`에 `like_count`·`comment_count`·`engagement_rate` 추가, `rationale`에 `· 반응도 N%`(또는 좋아요/댓글 수) 한 토막.

### D) 품질 바닥 필터 — 순수 헬퍼 + discovery 적용

- 순수 헬퍼 `passesQualityFloor(viewCount, publishedAt, opts)`(discovery.ts 또는 externalSignals.ts):
  - `viewCount`가 `minViews`(예: 10_000) 미만이면 false.
  - `publishedAt`이 `maxAgeYears`(예: 3년) 보다 오래면 false. (publishedAt null이면 통과 — 데이터 없음을 벌하지 않음.)
  - 순수·결정적(`now`는 인자 주입으로 테스트 가능하게).
- discovery 경쟁영상 루프에서 `passesQualityFloor` 미통과 영상은 **후보로 만들지 않는다**(skip). 상수(minViews·maxAgeYears)는 discovery에 두고 주석으로 근거.
- ⚠️ **댓글(comment)·웹 트렌드(trend) 후보는 필터 대상 아님**(youtube 경쟁영상에만). 누락 방지: 필터로 경쟁영상이 0개가 돼도 댓글·트렌드 후보는 남아 발굴이 비지 않는다.

### 테스트

- `competitorSignalScore`: 반응도 높은 영상이 같은 조회수·배수에서 점수가 더 높은지. engagement null이면 기존 값과 동일(회귀). 기존 `discovery.test.ts` 케이스가 깨지지 않게(시그니처 바뀌면 호출 갱신).
- `passesQualityFloor`: minViews 미만 false·maxAgeYears 초과 false·publishedAt null 통과·경계값.

## fixture/promptHash 주의

discovery 후보(개수·순서·rationale)가 바뀌면 topic_scout LLM 입력이 변할 수 있다 → 다음 **라이브 런 자동 재기록**(claude-p $0). **AC 무관**. 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - `competitorSignalScore`가 step0 `engagementRate`를 재사용(재구현 금지)하고 engagement null에 폴백(회귀 0)하는가?
   - `passesQualityFloor`가 **youtube 경쟁영상에만** 적용되고 댓글·트렌드 후보는 보존되는가(발굴 안 비나)?
   - 순수 함수(now/임계 인자 주입)로 테스트되는가?
3. `phases/search-pool-engagement/index.json`의 step 1 갱신.

## 금지사항

- `engagementRate`·`viewsPerSubscriber`를 재구현하지 마라(step0/기존 import). 이유: 정의 드리프트.
- 품질 바닥을 댓글·웹 트렌드 후보에도 적용하지 마라. 이유: 그 후보엔 viewCount가 없어 전부 탈락 → 발굴이 비어버림.
- 반응도/품질 임계를 env 없이 하드코딩하되 **주석으로 근거**를 남겨라(매직넘버 방지). 새 env는 만들지 마라(YAGNI — 튜닝 필요해지면 그때).
- fixture를 손으로 재기록·삭제하지 마라. 명세 외 신규 파일을 커밋에 섞지 마라(`git status`). 기존 테스트를 깨뜨리지 마라.
