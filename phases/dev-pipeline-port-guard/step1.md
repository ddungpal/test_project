# Step 1: preflight-script

**얇은 IO 래퍼 스크립트 + dev 포트 고정.** step0의 순수 함수에 실제 로컬 신호(앱·Inngest fetch)를 넣어 사람에게 보여주고, 애초에 포트가 밀리지 않게 dev 스크립트를 고정한다.

## 배경
step0이 `diagnoseDevPipeline(signals)` 순수 판정을 만들었다. 이 step은 (1) 신호를 **실제로 수집**해 그 함수를 호출하는 스크립트와 (2) **포트 고정**으로 불일치 자체가 안 생기게 하는 두 가지를 한다. (배경 버그 설명은 step0.md 참조 — 3000이 차면 `next dev`가 조용히 3001로 밀려 Inngest가 죽은 포트를 호출.)

## 읽어야 할 파일 (먼저 정독)
- `src/dev/preflight.ts` (step0 산출물) — `resolveAppUrl`·`diagnoseDevPipeline`·`DevPipelineSignals`·`DevPipelineProblem`. **그대로 import해 쓴다.**
- `scripts/run-discovery.ts` 또는 `scripts/ingest-performance.ts` — tsx 스크립트 구조(상단 주석 실행법, `process.exit` 코드, 한국어 콘솔 출력) 참고.
- `package.json` — `scripts` 블록(`dev`, `inngest:dev`, `slice:topic` 등 형식).
- `.env.example` — 섹션 주석 스타일.

## 작업
### 1) preflight 스크립트 `scripts/dev-preflight.ts`
- 상단 주석에 실행법 1줄: `npx tsx scripts/dev-preflight.ts` (또는 `npm run preflight`).
- `resolveAppUrl(process.env)`로 기대 URL 확보(기본 `http://localhost:3000`).
- 신호 수집(전부 best-effort, 예외는 false/[]로 흡수 — 스크립트가 throw로 죽지 않게):
  - `appServingInngest`: `fetch(`${appUrl}/api/inngest`)` 의 `res.ok`(2xx). 타임아웃 ~2s(`AbortSignal.timeout(2000)`).
  - `inngestReachable`: `fetch("http://localhost:8288")` 의 응답 도달 여부(상태 무관, 연결되면 true).
  - `inngestRegisteredUrls`: Inngest dev 서버에서 현재 sync된 앱 URL 목록을 best-effort로 가져온다. **확실치 않거나 실패하면 `[]`로 둔다**(step0 함수가 빈 배열이면 불일치 판정을 생략하므로 거짓경고 없음). Inngest dev API 경로가 불확실하면 context7로 inngest 문서를 확인하거나, 안 되면 `[]`로 두고 진행.
- `diagnoseDevPipeline(signals)` 호출.
  - 문제 0건: `✅ dev 파이프라인 정상 (앱 {appUrl} · Inngest 8288)` 출력 후 `process.exit(0)`.
  - 문제 ≥1건: 각 `problem.message`를 `❌`로 줄단위 출력 후 `process.exit(1)`.
- 항상 기대 URL을 한 줄 찍어 사람이 눈으로도 대조 가능하게.

### 2) 포트 고정 (`package.json` scripts) — 침묵 fallback 차단
- `"dev": "next dev -p 3000"` (이유: 포트 명시 시 3000이 차 있으면 next가 **조용히 3001로 안 밀고 에러**를 낸다 = 즉시 인지).
- `"inngest:dev": "inngest-cli dev -u http://localhost:3000/api/inngest"` (이유: Inngest를 3000에 **고정 등록** — 자동탐색으로 엉뚱한 포트 붙는 것 방지).
- `"preflight": "tsx scripts/dev-preflight.ts"` 추가.
- 다른 스크립트는 건드리지 마라.

### 3) `.env.example`
- 한 섹션 추가:
  ```
  # 개발 서버 URL(포트 고정·preflight 대조용). 운영(Vercel)은 무관.
  APP_URL=http://localhost:3000
  ```

### 4) 문서 한 줄
- `docs/operations.md` 끝에 개발 트러블슈팅 한 줄: "파이프라인 런이 이유 없이 Failed면 `npm run preflight`로 앱/Inngest 포트 일치부터 확인(3000 고정)."

## 테스트 / AC
이 step은 IO 스크립트·설정이라 별도 단위테스트는 안 만든다(순수 로직은 step0에서 검증). 기존 AC 그린만 확인.
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0(typecheck가 `scripts/dev-preflight.ts`의 타입까지 검사).
2. `package.json`의 `dev`/`inngest:dev`가 고정 포트로 바뀌고 `preflight`가 추가됐는지 확인. 다른 스크립트 불변.
3. (가능하면) 앱·Inngest 둘 다 떠 있을 때 `npm run preflight` → `✅` exit 0, Inngest 끈 상태 → `❌ inngest-down` exit 1 육안 확인. (하네스 환경에서 서버 미기동이면 이 육안확인은 생략 가능 — AC가 ground truth.)
4. step 1 갱신: 성공 → `"status":"completed"` + `"summary":"preflight 스크립트(앱·Inngest·URL일치 best-effort 수집→diagnoseDevPipeline→행동가능 메시지+exit) + dev/inngest:dev 포트 고정(3000) + preflight npm 스크립트 + APP_URL env + ops 문서. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- step0의 `src/dev/preflight.ts` 순수 함수에 IO·fetch를 집어넣지 마라. 이유: 순수성·결정적 테스트를 깨뜨린다. IO는 이 스크립트에만.
- `inngestRegisteredUrls`를 못 가져왔다고 추측으로 채우지 마라. 이유: 거짓 url-mismatch 경고가 사용자를 오도한다. 모르면 `[]`.
- `next dev` 포트 외에 운영(Vercel) 설정·`vercel.json` 등 건드리지 마라. 이유: 이 Phase는 **개발 안전망**이고 운영은 고정 URL이라 무관.
- 기존 테스트를 깨뜨리지 마라.
