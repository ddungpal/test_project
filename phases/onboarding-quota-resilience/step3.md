# Step 3: youtube-fixture (#2 — dev quota $0 replay)

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-quota-resilience-design.md`
- `src/search/search.ts` — **미러 대상 전문**. `SEARCH_FIXTURES`(record/replay/off)·`searchHash`·`fixtures/search/<backend>/<hash>.json`·원자적 쓰기(temp+rename)·replay 미스 throw.
- `src/agents/topic_scout/externalSignals.ts` — `searchYouTube`(≈248, 이 step이 감쌀 함수)·`gatherExternalSignals`.
- `.env.example` — `SEARCH_FIXTURES` 등 기존 fixture env 표기 방식.

`search.ts`를 **한 줄씩 읽고** 그 패턴을 그대로 미러하라(새 발명 금지).

## 배경

`search()`(Tavily 웹)는 dev에서 fixture record/replay로 $0·결정적이다. 그러나 `searchYouTube`는 **항상 라이브 API**라 dev 반복 테스트가 일일 quota를 태운다(이번 사건의 근인). 이 step은 YouTube 검색에 **동일한 fixture 레이어**를 씌워 dev replay를 $0·quota무소모로 만든다.

## 작업

이 step은 **검색/외부신호 레이어**만 다룬다(온보더·UI 무관).

1. **fixture 래퍼** — `searchYouTube(query, max)`의 결과(`Omit<ExternalItem, "id">[]`)를 캐시. `search.ts`의 tavily 분기를 미러:
   - env `YOUTUBE_FIXTURES = record(기본) | replay | off`.
   - 게이팅: `process.env.YOUTUBE_API_KEY` 있고 `YOUTUBE_FIXTURES !== "off"`일 때만 fixture. (키 없으면 현행 `searchYouTube`가 `[]` 반환 — 그대로.)
   - 경로 `fixtures/youtube/<hash>.json`, `hash = sha256(JSON.stringify({ q: query, m: max })).slice(0,16)`(searchHash 미러).
   - **record**: 캐시 있으면 반환, 없으면 라이브 `searchYouTube`(step0의 429 throw 그대로 전파 — 실패는 저장 안 함) + 원자적 저장(temp write→rename). **replay**: 캐시만 반환, 미스면 `throw`("youtube fixture 없음(replay): <path> — YOUTUBE_FIXTURES=record로 먼저 녹화"). **off**: 라이브.
   - 위치: 새 파일 `src/agents/topic_scout/youtubeFixture.ts`(권장·search.ts 미러) 또는 externalSignals 내부 헬퍼. `gatherExternalSignals`가 `searchYouTube` 직접 호출하는 자리를 이 래퍼 호출로 교체.
   - **429 등 실패는 캐시하지 마라**(step0의 `YouTubeQuotaError` 포함) — 실패를 fixture로 굳히면 안 됨.

2. **TTL은 선택** — search.ts는 volatility TTL이 있으나 YouTube 레퍼런스는 단순 존재 기반으로 충분하면 TTL 생략 가능(에이전트 재량·YAGNI). 넣는다면 search.ts 미러.

3. **`.env.example`** — `YOUTUBE_FIXTURES=record`(주석: dev quota $0 replay·record/replay/off) 추가. (프로젝트 rules: 새 env는 .env.example에도.)

## 테스트

`tests/youtubeFixture.test.ts` 신설:
- record: 캐시 없을 때 라이브 결과 저장 + 반환(라이브는 주입 스텁), 두 번째 호출은 캐시 반환(라이브 0회).
- replay: 캐시 있으면 반환, 미스면 throw.
- off: 항상 라이브.
- 실패(예: `YouTubeQuotaError`)는 저장 안 함.
- 임시 디렉토리(예: `fixtures/youtube` 대신 테스트용 temp) 사용해 레포 오염 금지. **catch-swallow 검사는 impl 스텁+카운터로**(rules.md 함정).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0).
2. 체크리스트: `YOUTUBE_FIXTURES` 미지정(record 기본)에서 기존 라이브 동작이 record로 자연 전환되는가(키 없으면 무영향)? replay 미스가 명확히 throw하는가? 실패는 저장 안 하는가?
3. `.env.example`에 반영됐는가?
4. index.json step3 갱신(completed+summary) + **phase 전체 completed**.

## 금지사항

- 실패 응답(429·네트워크)을 fixture로 저장하지 마라. 이유: 다음 replay가 항상 실패를 재생 → dev가 영영 깨진다.
- 기본값을 `off`나 `replay`로 두지 마라. 이유: record 기본이라야 키 있는 환경에서 첫 실행이 자연 녹화되고, 키 없으면 무영향.
- 테스트가 레포의 `fixtures/youtube/`에 실파일을 남기지 않게 하라(temp 디렉토리 사용).
- 온보더·UI를 건드리지 마라(이전 step 범위).
- 기존 테스트를 깨뜨리지 마라.
