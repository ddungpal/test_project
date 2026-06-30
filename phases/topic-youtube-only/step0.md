# Step 0: topic-sources-youtube-only

**방향 전환(사용자 결정)**: 주제 선정은 **유튜브 영상 기준**으로 한다 — "지금 사람들 관심 받는 영상인가·조회수 잘 나온 영상인가". **웹 기사(Tavily)는 주제 선정에서 제거**한다(기사는 리서치 단계용). 유지하는 신호 = **유튜브 경쟁영상 + 시청자 댓글 집계**(옵션 A — 댓글은 기사가 아니라 시청자 관심). 이 step은 **주제 뽑는 데이터 경로 전부**(per-run `prepare.ts` + 발굴 cron `discovery.ts`)에서 웹 기사 신호를 끊는다.

## 배경 (현재 — 웹 기사가 주제에 섞임)

- **`topic_scout/prepare.ts`**(per-run): `external_items = [...web.slice(0,12), ...rankExternalByMultiplier(youtube,6)]` — 웹 기사 12개를 LLM 입력·`sources`에 넣는다. `webQueries`로 Tavily도 호출.
- **`discovery.ts`**(매일 발굴 cron `refreshTopicCandidates`): `webQueries`로 트렌드 기사 검색 → `source:'trend'` 후보 생성(+`competitor`=youtube, +`comment`). 이 trend 후보는 `topic_candidates`에 쌓여 prepare의 `existing_candidates`(tc:)로도 다시 유입.
- 둘 다 끊어야 "주제 뽑는 부분 전부"가 유튜브 기준이 된다.

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·거버넌스(C: 외부엔 키워드 쿼리만).
- `src/agents/topic_scout/prepare.ts` — line ~62 `gatherExternalSignals`(webQueries/ytQuery) · ~79 `external_items`(web 12 + youtube ranked 6) · ~86 `overlap_terms`(external 텍스트 기반) · ~118 `sources`(external_items 매핑).
- `src/agents/topic_scout/discovery.ts` — `webQueries`·`gatherExternalSignals`·`for (const e of external)` 후보 빌드 루프(`isYt ? competitor : trend`).
- `src/agents/topic_scout/externalSignals.ts` — `gatherExternalSignals({webQueries, ytQuery, ...})`(webQueries 빈 배열이면 웹 검색 스킵)·`rankExternalByMultiplier`·`viewsPerSubscriber`.
- `tests/discovery.test.ts` — 발굴 후보 수(trend/competitor/comment) 검증 기준.

## 작업

### 1) `prepare.ts` — 주제 입력에서 웹 제거 (유튜브 영상 + 댓글만)

- `gatherExternalSignals` 호출에서 **`webQueries: []`**(웹 Tavily 호출 안 함 — 비용·토큰 절감), `ytQuery`는 유지(키워드 또는 댓글 top term). 즉 외부 수집은 **유튜브만**.
- `external_items` = **유튜브만**(`rankExternalByMultiplier(gathered.filter(youtube), 6, FLOOR_SUBS)`). web slice 라인 제거.
- `overlap_terms`: 이제 external 텍스트가 유튜브 제목/스니펫만 → 댓글 ∩ 유튜브 교집합. 로직은 그대로(입력 텍스트만 유튜브).
- `sources`: external_items(유튜브) 매핑 — 자동으로 유튜브만 남음.
- 댓글 신호(keyword_signals·comment_count·question_comment_count)·existing_candidates·learned·input 나머지는 **불변**(옵션 A — 댓글 유지).

### 2) `discovery.ts` — 발굴 cron에서 웹 트렌드 후보 제거

- `gatherExternalSignals`의 **`webQueries: []`**(트렌드 기사 검색 제거), `ytQuery`는 유지(댓글 top term ?? 연도 재테크).
- 후보 빌드 루프: `source:'trend'`(web) 후보를 **만들지 않는다**. **`comment`(댓글)·`competitor`(youtube)만** 생성(옵션 A). 가장 단순하게는 `for (const e of external)`가 이제 youtube만 받으므로 `isYt` 분기에서 trend 경로가 자연 소거되지만, **웹이 절대 안 들어오도록 명시적으로 youtube만 처리**(방어).
- `DiscoveryResult`의 `trend` 카운트는 0이 된다(타입 유지·항상 0). 테스트 기대값 갱신.

### 3) 테스트

- `discovery.test.ts`: 웹 트렌드 후보가 **0**이고 comment·competitor만 생성되는지(fake gather가 web+yt 줘도 web은 후보로 안 들어옴). competitorSignalScore·passesQualityFloor 동작은 불변.
- (prepare는 통합 성격이라 단위가 어려우면) `external_items`가 youtube만 담는 순수 가공부가 있으면 테스트, 아니면 discovery 테스트로 핵심을 커버.

## ‼️ 주의 (research 단계 불변)

**리서치 단계(셜록·팩트검증)의 웹 검색은 절대 건드리지 마라.** 이 변경은 **주제 선정 경로(topic_scout prepare + discovery cron)만**이다. 기사는 리서치에서 여전히 필요하다(사용자 명시). `src/pipeline/research*`·`fact_verifier`·`search/`는 손대지 않는다.

## fixture/promptHash 주의

`external_items`에서 web이 빠지면 topic_scout LLM 입력이 바뀐다 → 다음 **라이브 런 자동 재기록**(claude-p $0). **AC 무관**. 손으로 재기록 금지. (TOPIC_SCOUT_SYSTEM 자체는 step1에서 변경.)

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - prepare·discovery 둘 다 `webQueries: []`로 웹 수집을 끊고, 후보/external_items에 web이 0인가?
   - 댓글(comment)·유튜브 경쟁영상(competitor)은 보존되는가(옵션 A)?
   - **research 단계 검색은 무변경**인가(주제 경로만)?
   - youtube 항목은 여전히 배수 랭킹(rankExternalByMultiplier) 적용인가?
3. `phases/topic-youtube-only/index.json`의 step 0 갱신.

## 금지사항

- 리서치 단계·`fact_verifier`·`search/`·researchCell의 웹 검색을 건드리지 마라. 이유: 기사는 리서치용(사용자 명시) — 이 변경은 주제 선정 경로 한정.
- 댓글 신호(keyword_signals·question_comment_count)·comment 후보를 제거하지 마라. 이유: 옵션 A — 댓글은 시청자 관심 신호로 유지.
- TOPIC_SCOUT_SYSTEM을 이 step에서 바꾸지 마라. 이유: step1 범위.
- `rankExternalByMultiplier`·`viewsPerSubscriber`를 재구현하지 마라(import 재사용).
- fixture를 손으로 재기록하지 마라. 명세 외 신규 파일을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
