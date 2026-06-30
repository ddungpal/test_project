# Step 1: title-topic-multiplier

`outlier-refs`의 **재정렬 레이어**. 제목 레퍼런스와 주제발굴이 **조회수 절대값**이 아니라 **구독자 대비 조회수 배수(아웃라이어)** 를 우선하도록 바꾼다. step0의 `viewsPerSubscriber`를 두 소비처가 공유한다.

## 배경

- step0이 `viewsPerSubscriber(views, subs, floorSubs)`(순수·노이즈 컷)와 `ExternalItem.thumbnailUrl`을 깔았다.
- 제목: `hook_maker/externalRefs.ts`의 `pickTopExternalTitles`가 **조회수 desc**로 상위 N. → 배수 desc로.
- 주제발굴: `topic_scout/discovery.ts`의 `signal_score = log10(viewCount+1)`. → 배수 반영.

## 읽어야 할 파일

- step0 산출물: `src/agents/topic_scout/externalSignals.ts`의 `viewsPerSubscriber`·`ExternalItem`(viewCount/subscriberCount/thumbnailUrl).
- `src/agents/hook_maker/externalRefs.ts` — `pickTopExternalTitles`(현재 viewCount만 읽음·desc 정렬)·`ExternalTitleRef` 타입·`gatherTitleReferences`.
- `src/agents/topic_scout/discovery.ts` line 80~96 — 경쟁 영상 → candidate 변환, `signal_score`·`evidence.detail`(view_count/subscriber_count).
- `src/agents/hook_maker/prepare.ts` line 62 — `reference_titles_external` 주입(이게 hook_maker LLM 입력·**또한 thumbnail_maker 입력**이기도 함 — prepareThumbnailMaker가 같은 ExternalTitleRef를 받음).
- `tests/hookMakerExternalRefs.test.ts`(있으면) — 기존 정렬 테스트.

## 작업

### 1) 제목 레퍼런스 — `pickTopExternalTitles` 배수 정렬

- `ExternalItem`의 `subscriberCount`로 `viewsPerSubscriber(viewCount, subscriberCount, FLOOR_SUBS)` 계산.
- **1순위 정렬 = 배수 desc**(아웃라이어 우선). 배수가 `null`(구독 비공개·노이즈 컷)인 항목은 **뒤로**(배수 있는 것 우선), null끼리는 기존처럼 조회수 desc로 보조 정렬. 동률 tie-break는 기존 id asc(결정성) 유지.
- `ExternalTitleRef`에 `multiplier: number | null` + `subscriberCount: number | null` 추가(UI/표시·evidence용). 기존 viewCount/title/url/publisher 보존.
- `FLOOR_SUBS` 상수(예: 1000)는 이 파일에 둔다(주석으로 근거). 제목 중복 제거(seenTitles)·youtube·viewCount!=null 게이트는 유지.

### 2) 주제발굴 — `discovery.ts` signal_score 배수 반영

- 경쟁 영상(isYt) candidate의 `signal_score`에 배수를 반영한다. 예: 배수가 있으면 `log10(viewCount+1) × (1 + log10(multiplier+1))` 또는 배수 자체를 점수에 가중 — **단조 증가·결정적**이면 수식은 재량(주석으로 근거 명시). 배수 null이면 기존 log10(viewCount) 폴백(회귀 최소).
- `evidence.detail`에 `multiplier`(또는 `views_per_sub`)를 추가(이미 view_count/subscriber_count 저장 중 — 배수도 함께). `rationale` 문구에 배수를 노출해도 좋다(예: "경쟁 영상 · 조회 50만 · 구독대비 50배").
- 댓글 기반 candidate(비-yt)는 불변.

### 3) 테스트

- `pickTopExternalTitles`: 배수 높은(조회 적어도 구독 대비 큰) 영상이 조회수 더 높지만 배수 낮은 영상보다 **앞에** 오는지. 배수 null 항목이 뒤로 가는지. FLOOR_SUBS 미만 채널이 배수 랭킹에서 빠지는지.
- `discovery`: signal_score가 배수 반영으로 단조 증가하고 배수 null은 폴백하는지(순수 변환 단위 — 가능한 범위).

## fixture/promptHash 주의

`reference_titles_external`은 **hook_maker·thumbnail_maker LLM 입력**이다. 배수 재정렬로 **순서·새 필드(multiplier)가 바뀌면 두 역할의 promptHash가 변한다** → 기존 fixture는 다음 **라이브 런에서 자동 재기록**(claude-p $0). **AC 무관**(eval은 fixture 파일 읽기·form-agnostic). topic_scout도 evidence detail에 multiplier 추가 시 입력 변동 가능 → 동일(자동 재기록). **손으로 재기록 금지.**

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - 제목·주제발굴이 step0 `viewsPerSubscriber`를 **공유**(재구현 금지)하는가?
   - 배수 null(구독 비공개·노이즈) 항목이 안전하게 폴백/후순위인가(누락 0)?
   - 댓글 기반 발굴·비-yt 경로는 불변인가?
3. `phases/outlier-refs/index.json`의 step 1 갱신.

## 금지사항

- `viewsPerSubscriber`를 재구현하지 마라(step0 단일 출처 import). 이유: 배수 정의 드리프트 방지.
- 배수가 null인 항목을 통째로 버리지 마라(후순위로). 이유: 구독 비공개 영상도 여전히 유효 레퍼런스 — 누락 금지.
- thumbnail_maker·hook_maker SYSTEM/스키마를 바꾸지 마라(입력 데이터 재정렬만). 이유: 이 step은 랭킹 — SYSTEM 변경은 범위 밖.
- fixture를 손으로 재기록·삭제하지 마라(다음 라이브 런 자동·$0).
- 명세 외 신규 파일을 커밋에 섞지 마라(`git status`). 기존 테스트를 깨뜨리지 마라.
