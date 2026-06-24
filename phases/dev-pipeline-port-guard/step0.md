# Step 0: preflight-core

**Dev 파이프라인 포트/URL 불일치를 판정하는 순수 함수 + 테스트.** 네트워크·IO·DB·LLM 0. 다음 step의 얇은 스크립트가 이 함수에 신호를 넣어 사람에게 행동가능한 메시지를 보여준다.

## 배경 (이 step이 막는 실제 버그)
개발 중 `next dev`가 3000 포트가 차 있으면 **조용히 3001로** 밀려 뜨고, Inngest dev SDK는 그때 자기 포트(3001)를 등록한다. 이후 서버가 3000으로 돌아오면 Inngest는 **죽은 3001을 계속 호출** → `Unable to reach SDK URL` → 주제 제안 등 모든 파이프라인 런이 **이유 없이 "Failed"**. 사용자는 코드 버그로 오인한다. 이 함수는 그 불일치(및 "Inngest 안 떴음", "앱이 기대 포트에 없음")를 **런 돌리기 전에** 판정한다.

## 읽어야 할 파일 (먼저 정독)
- `src/llm/config.ts` — `envStr(key, fallback)` 패턴(env 단일출처). `APP_URL` 기본값 처리에 같은 패턴을 쓴다.
- `src/dev/` 는 아직 없다 — 이 step에서 새로 만든다(`src/performance/`·`src/search/` 처럼 도메인 폴더).
- `tests/styleProfile.test.ts` 또는 `tests/adoptionSignal.test.ts` — 순수함수 + `it.each` 경계 테스트 스타일 참고.

## 작업
새 파일 `src/dev/preflight.ts`에 **순수 함수 3개**를 만든다. `process.env` 직접 접근은 인자로 받은 env 객체로만(오염 금지).

```ts
// 기대 앱 URL을 env에서 해석. 기본 http://localhost:3000.
export function resolveAppUrl(env?: Record<string, string | undefined>): string;

// 두 URL이 같은 origin(scheme+host+port)인지. 경로/trailing slash/대소문자 host 차이는 무시.
// 파싱 불가한 입력은 false.
export function sameOrigin(a: string, b: string): boolean;

export interface DevPipelineSignals {
  expectedAppUrl: string;        // resolveAppUrl() 결과 (예: http://localhost:3000)
  appServingInngest: boolean;    // GET {expectedAppUrl}/api/inngest 가 2xx 인가 (앱이 그 포트에 떠 있나)
  inngestReachable: boolean;     // Inngest dev(8288) 가 떠 있나
  inngestRegisteredUrls: string[]; // Inngest가 현재 sync한 앱 URL들. 못 알아냈으면 [] (그러면 불일치 판정 생략)
}

export type DevPipelineProblem =
  | { kind: "inngest-down"; message: string }
  | { kind: "app-not-serving"; message: string }
  | { kind: "url-mismatch"; expected: string; registered: string[]; message: string };

// 신호로부터 문제 목록을 만든다. 문제 없으면 []. 결정적(같은 입력 → 같은 출력).
export function diagnoseDevPipeline(s: DevPipelineSignals): DevPipelineProblem[];
```

### 판정 규칙 (이대로 박아라 — 설계 의도)
1. `inngestReachable === false` → `inngest-down` 1건. message는 **행동가능 한국어**: 예) "Inngest dev가 안 떠 있다 → `npx inngest-cli dev -u {expectedAppUrl}/api/inngest` 실행".
2. `appServingInngest === false` → `app-not-serving` 1건. 예) "앱이 {expectedAppUrl}에 없다(다른 포트로 밀렸거나 안 떴다) → `next dev -p 3000` 으로 고정 기동".
3. `inngestReachable === true` **그리고** `inngestRegisteredUrls.length > 0` **그리고** 등록된 URL 중 `sameOrigin(expectedAppUrl, *)` 가 **하나도 없으면** → `url-mismatch` 1건. 이게 위 배경의 정확한 버그. message: "Inngest가 {registered}에 등록됨, 앱은 {expected} — 포트 불일치. Inngest를 `-u {expectedAppUrl}/api/inngest`로 재기동". `expected`·`registered` 필드도 채운다.
   - `inngestRegisteredUrls` 가 `[]` 면 (못 알아낸 것) **불일치 판정 생략**(거짓양성 금지).
   - 등록 URL 중 하나라도 expected와 same-origin이면 정상(문제 없음).
4. 위 어디에도 안 걸리면 `[]`.
5. 여러 문제 동시 가능(예: inngest-down + app-not-serving). 발견된 것 모두 반환. 순서는 위 1→2→3.

`sameOrigin`은 표준 `URL` 사용. `new URL(x).origin` 비교(파싱 throw는 false로 흡수). `localhost`와 `127.0.0.1`은 **다른 것으로 취급**(단순하게 — origin 문자열 비교). path가 `/api/inngest` 든 `/` 든 origin만 보면 무관.

## 테스트 (신규 `tests/devPreflight.test.ts`)
- `resolveAppUrl`: env 없음/빈값 → `http://localhost:3000`. `APP_URL` 지정 → 그 값.
- `sameOrigin`: `http://localhost:3000` vs `http://localhost:3000/api/inngest` → true. `:3000` vs `:3001` → false. 깨진 입력(`""`, `"not a url"`) → false.
- `diagnoseDevPipeline` 각 케이스:
  - 전부 정상(inngest up·app serving·registered에 3000 포함) → `[]`.
  - **이번 버그 재현**: expected `:3000`, appServingInngest true, inngestReachable true, registered `["http://localhost:3001/api/inngest"]` → `url-mismatch` 1건 (expected/registered 필드 확인).
  - inngest down → `inngest-down`.
  - app not serving → `app-not-serving`.
  - registered `[]` → 불일치 **미발생**(정상 취급, 거짓양성 없음).
  - 동시 실패(inngest down + app not serving) → 2건.
- message에 행동가능 토막(예: `inngest-cli dev` / `next dev -p`)이 들어있는지 substring으로 가볍게 확인(문구 전체 일치 강요 금지).

## 주의
- **네트워크·fetch·process.env 직접 접근 금지.** 이유: 이 파일은 순수·결정적이어야 테스트가 안정적이고, IO는 다음 step의 스크립트가 담당(관심사 분리).
- `inngestRegisteredUrls`가 비었을 때 불일치를 단정하지 마라. 이유: 다음 step 스크립트가 Inngest 등록목록을 못 가져오는 경우가 있고, 그때 거짓 경고를 내면 안 된다.
- AX/말투/기존 파이프라인 코드 건드리지 마라. 범위는 `src/dev/preflight.ts` + `tests/devPreflight.test.ts` **2파일뿐**.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. `git status`로 범위가 `src/dev/preflight.ts`·`tests/devPreflight.test.ts` 2파일인지 확인. 기존 테스트 불변.
3. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"순수 진단 코어(resolveAppUrl·sameOrigin·diagnoseDevPipeline: inngest-down·app-not-serving·url-mismatch 판정, registered 빈배열이면 불일치 생략) + 테스트. IO/LLM 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- 스크립트·package.json·.env 수정 금지(다음 step). 이유: 이 step은 순수 코어만 — 레이어 분리.
- 기존 테스트를 깨뜨리지 마라.
