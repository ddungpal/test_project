# Step 0: record-after-validate (픽스처를 검증 성공 후에만 기록)

**`callLLM`의 record 모드가 스키마 검증을 통과한 출력만 픽스처로 저장하도록 고친다.** 불량 출력이 캐시에 박제돼 영구 실패하는 버그 해소.

## 배경 (실제 사건 — 왜 이렇게)
- `src/llm/callLLM.ts`의 record 모드 흐름이 버그다:
  - 실호출 후 **검증 *전*에** `saveFixture`(현재 :88) → 그 다음 `parseAndValidate`(현재 :92).
  - record 모드는 진입 시 기존 픽스처가 있으면 **리플레이**한다(현재 :50-55).
- 연쇄: claude-p가 한 번 스키마에 안 맞는 출력을 내면 → **불량 rawJson이 픽스처로 저장됨**(검증 전이라) → 검증 실패. 이후 같은 promptHash의 호출은 그 **불량 픽스처를 리플레이**해 매번 검증 실패. claude-p의 2회 재시도(:65,:97)도 무력(다음 호출은 픽스처 리플레이라 라이브 안 감).
- **실제 사건**: 제목 스타일 재학습(`style_extractor`)이 `evidence_summary` 누락 + `banned`/`confidence`/`tentative_notes`/`skeletons`를 `patterns` 밖 최상위에 둔 불량 출력으로 한 번 실패 → 그 출력이 박제돼 **재시도마다 결정적으로 실패**. (오염 픽스처는 수동 삭제로 임시 해소했으나, 재발 방지 코드 수정이 필요.)
- 수정: **`saveFixture`를 `parseAndValidate` 성공 직후로 이동** → 검증 통과한 유효 출력만 캐시. 불량 출력은 박제 안 됨 → claude-p 2회 재시도가 정상 작동(매 시도 라이브 호출, 유효한 것만 기록).

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md` — 계층·비용($0)·픽스처 전략(개발 claude-p record→replay).
- `src/llm/callLLM.ts` — **주 수정 대상.** record 리플레이(:50-55)·실호출 루프(:68)·`saveFixture`(:88)·`parseAndValidate`(:92-99)·claude-p 2회 재시도(:65,:97). 흐름을 정확히 파악하라.
- `src/llm/fixtures.ts` — `saveFixture`/`loadFixture`/`FixtureMissError` 시그니처(모킹 대상).
- `src/llm/schema.ts` — `parseAndValidate`·`SchemaValidationError`(검증 실패 타입).
- `tests/` — callLLM/driver 주입(`deps.driver`)·`CostGuard` 사용하는 기존 테스트가 있으면 패턴 미러.

## 작업
### `src/llm/callLLM.ts` — saveFixture를 검증 성공 후로 이동
- 현재(개념):
  ```ts
  if (config.fixtures === "record") saveFixture({ ...rawJson });   // 검증 전 — 불량도 저장(버그)
  try {
    const data = parseAndValidate<T>(req.roleId, req.schema, rawJson);
    return { data, ... };
  } catch (e) { if (isFree && e instanceof SchemaValidationError && attempt < maxAttempts) continue; throw e; }
  ```
- 수정(개념): `saveFixture`를 `parseAndValidate` **성공 후, return 직전**으로 옮긴다.
  ```ts
  try {
    const data = parseAndValidate<T>(req.roleId, req.schema, rawJson);
    if (config.fixtures === "record") saveFixture({ ...rawJson });  // 검증 통과분만 기록
    return { data, ... };
  } catch (e) { if (isFree && e instanceof SchemaValidationError && attempt < maxAttempts) continue; throw e; }
  ```
- 동작 보존: replay 모드(:44-48)·record 리플레이(:50-55)·비용 정산(reconcile, :83-87)·재시도 로직(:97)은 **그대로**. 바뀌는 건 **언제 저장하느냐**뿐(검증 통과분만).

## 주의 (구체)
- **비용 정산(reconcile)은 이동하지 마라**: 유료 api는 출력이 틀려도 비용이 발생하므로 `reconcile`(:83-87)은 검증 *전*에 그대로 둔다. 옮기는 건 `saveFixture`만. 이유: 비용 누락 방지(주석 :82 근거).
- **재시도 의미 보존**: claude-p 2회 재시도에서, 1차가 불량이면 이제 저장 안 하고 2차 라이브 호출 → 2차가 유효하면 그걸 저장. 검증 실패가 캐시를 오염시키지 않아야 한다. 이유: 이 버그의 핵심.
- **replay 모드 불변**: replay는 기존 픽스처만 읽고 저장 안 함(:44-48) — 손대지 마라. 이유: 범위 밖.
- **off 모드 불변**: 픽스처 미사용 — 그대로.
- `noUncheckedIndexedAccess`·`exactOptionalPropertyTypes` 준수.

## 테스트 (신규 — 예: `tests/callLlmRecord.test.ts`)
- **픽스처 모듈 모킹**(`vi.mock("../src/llm/fixtures.js")` 또는 동등)으로 실제 파일 쓰기를 피한다(이유: `fixtures/parity/*`에 stray 파일 생성 금지 — rules.md). `saveFixture`/`loadFixture`를 spy로.
- 가짜 드라이버(`deps.driver`)를 주입:
  - **불량 출력**(스키마 위반 rawJson) → record 모드 호출 → `saveFixture`가 **호출되지 않음**(검증 실패) + `SchemaValidationError` throw(또는 claude-p면 2회 시도 후 throw). 핵심 회귀 가드.
  - **유효 출력** → record 모드 호출 → `saveFixture`가 **1회 호출**됨 + 정상 반환.
  - (가능하면) claude-p 1차 불량·2차 유효 → 최종 성공 + 유효분만 저장.
- 기존 테스트는 전부 그대로 통과해야 한다.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy가 직접 실행해 exit code 확보).
2. 체크: saveFixture가 parseAndValidate 성공 후에만 호출·reconcile은 이동 안 함·replay/off 불변·재시도 의미 보존·테스트가 실제 픽스처 파일을 안 만듦(모킹).
3. `phases/fixture-record-after-validate/index.json` step 0 갱신(성공→completed+summary 등).

## 금지사항
- `reconcile`(비용 정산)을 검증 뒤로 옮기지 마라. 이유: 유료 api 비용 누락.
- replay/off 모드 동작을 바꾸지 마라. 이유: 범위 밖·$0 보장 깨짐.
- 테스트가 `fixtures/parity/*`에 실제 파일을 쓰게 하지 마라. 이유: stray fixture 혼입(rules.md). 모킹으로.
- 기존 테스트를 깨뜨리지 마라.
