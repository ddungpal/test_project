# Step 1: segment-persist-read

P1 토대의 **적재·읽기 레일**. step 0이 깐 `kind`/`payload` 컬럼과 `normalizeSegmentPayload`를 실제 파이프라인(저장)과 대시보드 읽기에 배선한다. **검증 로직·lineage·money 게이트는 한 줄도 바꾸지 않는다.**

옵션 A 범위: 짠펜은 아직 prose만 emit하므로 **실행 시 kind는 전부 'prose'·payload는 null**이 된다. 이 step의 목적은 "짠펜(또는 P2 이후·데모시드)이 블록을 주면 그대로 DB→읽기까지 흐른다"는 **레일이 round-trip으로 동작함**을 코드+테스트로 보장하는 것이다.

## 읽어야 할 파일

- step 0 산출물: `src/pipeline/segmentBlock.ts`(`normalizeSegmentPayload`·payload 타입), `supabase/migrations/20260630120029_script_segment_kind.sql`, `src/agents/scribe/schema.ts`(optional `kind?`/`payload?`).
- `src/pipeline/scriptCell.ts` — 짠펜 단계 셀. **118~165행**(segments 저장 + lineage)을 정독하라. `segRows` 빌드(120행), insert(121행), lineage 매핑이 핵심이며 **건드리면 안 되는 영역과 한 줄만 더하면 되는 영역**을 구분하라.
- `src/lib/dashboard/scriptView.ts` — `SegmentView` 인터페이스(6~12행)와 `getScriptView`(14~90행). 마지막 `segs.map(...)`(83~89행)이 뷰 객체를 만든다.
- `src/app/runs/[id]/page.tsx` — `getScriptView`/`SegmentView` 사용처(이 step에선 타입 추가만 영향, 렌더는 step 2).

## 작업

### 1) 저장: `scriptCell.ts`의 `segRows` (120행 부근)

현재:

```ts
const segRows = segments.map((s, i) => ({ content_id: contentId, run_id: runId, ord: i, text: s.text }));
```

를 step 0의 `normalizeSegmentPayload`를 통과시켜 `kind`/`payload`를 함께 적재하도록 바꾼다:

```ts
const segRows = segments.map((s, i) => {
  const { kind, payload } = normalizeSegmentPayload(s.kind, s.payload);
  return { content_id: contentId, run_id: runId, ord: i, text: s.text, kind, payload };
});
```

- `segmentBlock.ts`에서 `normalizeSegmentPayload`를 import한다.
- **그 외 scriptCell의 모든 것은 불변**: freshness 게이트, 표절 가드, money-safety asset 필터(81행), lineage 매핑(127~165행), 전이, cost flush. 이유: 검증·무결성 로직은 P1 범위 밖이며 회귀 위험이 크다.
- `s.kind`/`s.payload`는 현재 짠펜이 안 주므로 `undefined` → normalize가 `prose`/`null` 반환(하위호환). 정상.

### 2) 읽기: `scriptView.ts`의 `SegmentView`

`SegmentView` 인터페이스에 필드 추가:

```ts
export interface SegmentView {
  id: string;
  ord: number;
  text: string;
  kind: SegmentKind;                                       // step 0의 SegmentKind import
  payload: TablePayload | CasePayload | VisualPayload | null;  // step 0 타입 import
  facts: { id: string; claim: string }[];
  assets: { id: string; concept: string; kind: "number" | "analogy" }[];
}
```

- `getScriptView`의 첫 쿼리(17~21행) select에 `kind, payload`를 추가: `.select("id, ord, text, kind, payload")`.
- 마지막 `segs.map(...)`(83~89행)에서 `kind`/`payload`를 채운다. **DB에서 온 값을 다시 `normalizeSegmentPayload(s.kind, s.payload)`로 통과시켜** 방어적으로 정규화한 뒤 넣어라(이유: DB에 직접 시드된 데모 데이터가 깨졌어도 화면이 안전하게 prose로 떨어지게 — money-safety 동일 원칙·단일 출처 정규화).
- lineage(facts/assets) 로직은 **불변**.

### 3) Round-trip 테스트 `tests/scriptViewKind.test.ts`

DB 없이 검증 가능한 **순수 변환 단위**가 적다면, 최소한 `normalizeSegmentPayload`가 "저장 형태 → 읽기 형태"로 **왕복해도 동일**함을 확인하는 테스트를 추가하라(table/case/visual 각 1건 + 깨진 payload → prose). `getScriptView`는 DB 의존이라 단위테스트가 어려우면 **정규화 왕복 테스트로 갈음**한다(이유: 실 DB round-trip은 phase 머지 후 데모시드로 사용자가 라이브 확인 — 이 step은 코드 경로의 정합성만 보장).

> 참고: 짠펜 fixture 재기록 **불필요**(scribe 스키마·SYSTEM 불변, 출력에 kind/payload 없음 → normalize가 prose 반환 → 기존 동작과 byte 동일).

## Acceptance Criteria

```bash
npm run typecheck   # 타입 에러 0
npm test            # 전체 통과(기존 + segmentBlock + scriptViewKind). scribe parity 회귀 없음
npm run build       # 컴파일 에러 0
```

## 검증 절차

1. AC 커맨드 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - `scriptCell.ts` diff가 **`segRows` 빌드 + import 1줄로 한정**되는가? 검증/lineage/money 게이트 무변경인가?
   - `getScriptView` 읽기 경로가 DB 값을 `normalizeSegmentPayload`로 한 번 더 정규화하는가(깨진 시드 방어)?
   - scribe fixture 재기록 없이 test 통과인가?
3. `phases/script-format-model/index.json`의 step 1 갱신(completed+summary / error / blocked).

## 금지사항

- scriptCell의 freshness 게이트·표절 가드·money-safety asset 필터·lineage 매핑·전이·cost flush를 수정하지 마라. 이유: P1 범위 밖, 무결성 회귀 위험.
- `SCRIBE_SCHEMA`/`SCRIBE_SYSTEM`을 건드리지 마라(step 0과 동일 이유 — fixture 회귀).
- 읽기 경로에서 정규화를 생략하고 DB 원본 payload를 그대로 신뢰하지 마라. 이유: 데모/수동 시드가 깨진 payload를 넣었을 때 화면이 깨짐 — 단일 정규화 함수로 방어.
- 마이그레이션을 적용하지 마라(사용자 몫).
- 범위 외 신규 파일을 커밋에 섞지 마라(`git status` 확인).
- 기존 테스트를 깨뜨리지 마라.
