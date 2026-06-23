# Step 0: oauth-token-parse-test

**OAuth 토큰 교환의 파싱·에러 경로를 순수 함수로 분리해 테스트 가능하게 만든다.** 현재 `getYoutubeAccessToken()`(`src/performance/youtubeAnalytics.ts`)은 env 가드 → `fetch(TOKEN_URL)` → 응답 파싱이 한 함수에 섞여 있어, **실 creds·네트워크 없이는 한 줄도 검증 못 한다.** 응답 파싱과 env 가드를 **순수 함수로 추출**해 단위 테스트한다. 실 fetch 배선은 그대로 둔다(이미 올바름).

> ⚠️ 실 OAuth·네트워크 호출 금지. **실 access_token 을 fixture/디스크에 저장하지 마라**(짧게 만료돼도 비밀). 테스트는 **가짜 응답 객체**로 파싱만 검증한다.

## 읽어야 할 파일 (먼저 정독)
- `src/performance/youtubeAnalytics.ts` — `getYoutubeAccessToken()`(115~132줄): env(`YT_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`) 가드 → `fetch(TOKEN_URL, …refresh_token grant)` → `json.access_token` 없으면 throw. 같은 파일의 `fetchYtMetrics` record/replay 패턴(참고용, 토큰엔 적용 안 함 — 비밀이므로).
- `src/performance/youtubeAnalytics.ts` 의 `youtubeAnalyticsBackend.run` 응답 파싱(69~81줄) — 같은 "컬럼/행 → 지표" 파싱이 순수 분리 후보인지 참고(이번 step 범위 아님, 토큰만).
- `tests/perfCollect.test.ts` — 이 파일에 토큰 테스트를 추가하거나 새 `tests/ytOauth.test.ts` 신설(택1, 일관성 우선).

## 작업
1. **순수 파싱 함수 추출**: `export function parseTokenResponse(json: unknown): string` — `access_token`(string)이 있으면 반환, 없거나 타입이 틀리면 `throw new Error("OAuth 응답에 access_token 없음.")`. 기존 `getYoutubeAccessToken`이 이 함수를 호출하도록 교체(동작 불변 — 같은 에러 메시지).
2. **env 가드도 분리(선택)**: `export function requireOauthEnv(env = process.env): { clientId; clientSecret; refreshToken }` — 셋 중 하나라도 없으면 기존과 동일 메시지로 throw. `getYoutubeAccessToken`이 이걸 쓰게. (과하면 생략하고 1만 해도 됨 — 핵심은 parseTokenResponse.)
3. **실 fetch 흐름은 불변** — `getYoutubeAccessToken`은 여전히 env 읽고 fetch하고 `parseTokenResponse(await res.json())` 반환. **네트워크 코드·URL·grant 파라미터 그대로.**
4. `noUncheckedIndexedAccess`·`exactOptionalPropertyTypes` 준수. 다른 함수(`fetchYtMetrics`·`collectPerformance` 등) 건드리지 마라.

## 테스트
- `parseTokenResponse({ access_token: "ya29.fake" })` → `"ya29.fake"`.
- `parseTokenResponse({})` → throw(메시지 일치).
- `parseTokenResponse({ access_token: 123 })` → throw(타입 가드).
- `parseTokenResponse(null)` → throw(비객체 가드).
- (requireOauthEnv 분리 시) env 누락 → throw / 셋 다 있으면 객체 반환. **process.env 를 직접 오염시키지 말고 인자로 가짜 env 주입.**
- **실 fetch·실 토큰 호출 없음.** vitest 안에서 네트워크 0.

## 주의
- 비밀 누출 금지: 테스트·코드에 실 토큰/실 refresh_token 문자열 박지 마라. 전부 `"...fake..."`.
- 동작 회귀 금지: `getYoutubeAccessToken`의 외부 동작(성공 시 토큰 반환, 실패 메시지)은 1바이트도 안 바뀐다 — 내부만 순수 분리.
- 범위: `src/performance/youtubeAnalytics.ts`(토큰 함수만) + 테스트 1파일. 그 외 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. `git diff`로 fetch 배선·URL·grant 불변, 순수 분리만 확인.
3. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"OAuth 토큰 응답 파싱/env 가드를 순수함수(parseTokenResponse)로 분리·테스트(가짜 응답, 네트워크 0·실토큰 미저장). fetch 배선 불변. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.
