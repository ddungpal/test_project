# Step 1: collect-orchestration-test  ⭐ (핵심 — 멱등 수집 보증)

**`collectPerformance` end-to-end 오케스트레이션을 mock 백엔드로 통합 테스트한다 — 실 OAuth 없이.** 순수 헬퍼(`dueWindows`·`windowDateRange`·`mockYtBackend`·`pickYtBackend`)는 `tests/perfCollect.test.ts`가 이미 덮지만, **수집 루프 전체**(contents 조회 → 도래 윈도우 → fetch → ingest → **멱등**)는 무테스트다. 이 step이 그 핵심 경로를 코드로 검증해 step1(라이브 검증)을 OAuth 없이 완수한다.

> ⚠️ 실 OAuth·네트워크·실 Supabase 금지. `mockYtBackend`(결정적 $0) + **인메모리 fake Supa** 로만. 런타임 코드는 안 바꾸는 게 목표(이미 주입 가능: `deps.backend`·`deps.asOf`·`deps.limit`).

## 읽어야 할 파일 (먼저 정독)
- `src/performance/collect.ts` — **주 대상**. `collectPerformance(supa, { backend, asOf, limit })`: ① `contents`(youtube_video_id·upload_date not null, order upload_date→id) 조회 → ② 각 콘텐츠의 `performance_metrics`(content_id·ab_variant='overall') 기존 윈도우 조회 → ③ `dueWindows` → ④ `fetchYtMetrics`(backend) → ⑤ `ingestPerformance`. `backend` null이면 no-op. `result={contents,fetches,collectedContentIds}`.
- `src/performance/ingest.ts` — `ingestPerformance(supa, entries, abConfig, { nowIso })` 가 fake Supa에 어떤 호출을 하는지 확인(performance_metrics upsert 등) → fake가 그 호출을 **에러 없이 수용**해야 함.
- `tests/pipeline.test.ts`·`tests/hookMakerPrepareWiring.test.ts` — **기존 fake Supa 패턴** 참고(`from().select().eq()…` 체인 스텁, `as unknown as Supa`).
- `tests/perfCollect.test.ts` — 여기에 `collectPerformance` describe 블록을 추가(중복 금지 — 순수 헬퍼는 이미 있음, 통합만).

## 작업 — `tests/perfCollect.test.ts`에 통합 테스트 추가
**인메모리 fake Supa** 를 만든다(또는 기존 패턴 차용). 최소 지원:
- `from("contents").select(...).not(...).not(...).order(...).order(...)` → 시드한 콘텐츠 배열 반환.
- `from("performance_metrics").select("metric_window").eq("content_id",id).eq("ab_variant","overall")` → 시드/누적된 해당 콘텐츠의 윈도우 반환.
- `ingestPerformance` 가 부르는 쓰기(upsert/insert) → `{ error: null }` 로 수용하고, **쓴 윈도우를 인메모리 performance_metrics에 반영**(그래야 다음 호출에서 "이미 수집됨"으로 읽혀 멱등 성립).

테스트 케이스(`mockYtBackend` 주입, `asOf` 고정):
1. **도래 윈도우 수집**: 업로드 충분히 지난 콘텐츠 1편(예 upload `2026-05-01`, asOf `2026-06-11`) → `fetches=4`(d1·d7·d14·d30), `collectedContentIds=[그 id]`, `contents=1`.
2. **멱등(핵심)**: 같은 fake Supa로 **연속 2회** 호출(같은 asOf) → 1회차가 performance_metrics에 반영 → **2회차 `fetches=0`·`contents=0`**(이미 수집 전부 스킵). 또는 시드로 일부(d1) 미리 채워 2회차에 나머지만 수집됨을 단언.
3. **부분 도래**: asOf가 d7만 충족(elapsed 7~13) → `fetches=2`(d1·d7)만.
4. **limit 존중**: 콘텐츠 3편·`limit=1` → `contents=1`(나머지 미처리).
5. **백엔드 null no-op**: `collectPerformance(supa, { backend: null as any })` 또는 `PERFORMANCE_SOURCE` 미설정 경로 → `{contents:0,fetches:0,collectedContentIds:[]}`, fake Supa 조회조차 안 일어남(또는 일어나도 무수집).

## 주의
- **런타임 코드 변경 금지가 기본** — `collect.ts`는 이미 주입 가능. fake Supa로 테스트만 추가. 만약 테스트에 꼭 필요한 seam이 없으면(예: ingest가 fake로 감당 안 되는 호출) **최소 변경**만 하고 그 이유를 summary에 적어라(가급적 피하라).
- `asOf` 항상 명시(고정 날짜) — `new Date()` 의존 금지(결정적).
- `noUncheckedIndexedAccess`(fake Supa 배열 접근 `?.`/가드)·`exactOptionalPropertyTypes` 준수.
- 실 네트워크·실 토큰·실 Supabase 0. mock 백엔드만.
- 범위: `tests/perfCollect.test.ts`(+ 불가피하면 fake Supa용 작은 test 헬퍼). 런타임 `src/` 변경은 최후수단.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0(새 통합 테스트 포함 그린).
2. `git diff`로 런타임 코드 불변(테스트만) 자가확인 — 변경됐다면 summary에 사유.
3. step 1 갱신: 성공 → `"status":"completed"` + `"summary":"collectPerformance end-to-end 통합테스트(mock 백엔드+인메모리 fake Supa): 도래수집·멱등·부분도래·limit·null no-op. 네트워크/OAuth 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## ⚠️ 이 phase 이후 (사람 게이트 — 코드 아님)
실연결은 사용자 1회 액션 필요: 채널 OAuth 인증 → `.env`에 `YT_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` → `PERFORMANCE_SOURCE=youtube` + `PERFORMANCE_FIXTURES=record`로 fixture 1회 녹화 → 이후 replay($0). 코드 변경 없이 켜진다.
