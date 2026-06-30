# Step 0: segment-kind-schema

스크립트 품질 로드맵 P1(`script-format-model`)의 **토대 step**. 짠펜 대본 세그먼트가 prose 외에 **형식 블록**(표·케이스분기·시각큐)을 담을 수 있도록 **DB 컬럼 + 순수 정규화 함수 + 타입**을 깐다. 이것이 P2~P5의 전제다.

**중요 — 이 phase의 범위 결정(옵션 A, "레일만"):** 짠펜(scribe)은 **이번 phase에서 여전히 prose만 생성**한다. 실제 표/케이스를 짠펜이 emit하는 것은 P2(`outline-format`) 이후다. 따라서 이 step은 **레일(DB·정규화·타입)만** 깐다. **scribe의 JSON 스키마(`SCRIBE_SCHEMA`)는 절대 건드리지 마라** — 건드리면 promptHash가 바뀌어 기존 scribe fixture가 전부 깨진다(parity 회귀). 대신 TypeScript 인터페이스에만 optional 필드를 추가한다(런타임 스키마 무관 → promptHash 불변).

## 읽어야 할 파일

먼저 아래를 읽고 설계 의도와 기존 패턴을 파악하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 프로젝트 규칙·보안·크루 정의.
- `supabase/migrations/20260618120005_l2_pipeline.sql` (81~101행) — `script_segments`·`script_segment_facts`·`script_segment_explanation_assets` 정의.
- `supabase/migrations/20260629120028_research_reentry_transitions.sql` — **가장 최근 마이그레이션**. additive·멱등·`begin;`/`commit;` 패턴을 그대로 따른다.
- `src/agents/scribe/schema.ts` — 짠펜 출력 타입 `ScriptSegmentOut`/`ScribeOutput` + `SCRIBE_SCHEMA`(JSON Schema, **수정 금지**) + `SCRIBE_SYSTEM`(**수정 금지**).
- `tests/` 디렉토리에서 기존 순수 함수 테스트 1~2개(예: `tests/winningRefs.test.ts`)를 열어 vitest 작성 스타일을 따른다.

## 작업

### 1) 마이그레이션 29 (additive·하위호환)

새 파일 `supabase/migrations/20260630120029_script_segment_kind.sql` 생성:

- `public.script_segments`에 두 컬럼 추가:
  - `kind text not null default 'prose'` + `check (kind in ('prose','table','case','visual'))`
  - `payload jsonb` (nullable — prose는 payload 불필요)
- 기존 행은 `default 'prose'` + `payload null`로 자동 하위호환된다.
- `begin;`/`commit;` 감싸기. 헤더 주석으로 의도 명시(가장 최근 마이그레이션 주석 스타일 따름). **up only, additive — drop/alter 기존 컬럼 금지.**

**마이그레이션 적용은 하지 마라.** 사용자가 수동으로 적용한다(`blocked` 아님 — 파일 생성까지가 이 step의 산출물, 적용은 phase 머지 후 사용자 몫).

### 2) 순수 정규화 모듈 `src/pipeline/segmentBlock.ts`

다음 시그니처의 **순수 함수**(DB·LLM·I/O 없음):

```ts
export type SegmentKind = "prose" | "table" | "case" | "visual";

// 블록별 payload 형태(loose — 추후 확장 가능). P3~P5의 데이터 타깃.
export interface TablePayload { columns: string[]; rows: string[][]; caption?: string }
export interface CasePayload { intro?: string; branches: { condition: string; outcome: string }[] }
export interface VisualPayload { cue: string; note?: string }

// 짠펜(또는 데모시드)이 준 kind/payload를 DB에 적재 가능한 형태로 정규화한다.
// 깨졌거나 알 수 없는 kind/payload는 안전하게 prose로 폴백한다(money-safety: 깨진 형식이 화면에 박제되지 않게).
export function normalizeSegmentPayload(
  kind: string | undefined | null,
  payload: unknown,
): { kind: SegmentKind; payload: TablePayload | CasePayload | VisualPayload | null };
```

**핵심 규칙(반드시 지킬 것):**

- `kind`가 `undefined`/`null`/`'prose'`/미허용 문자열이면 → `{ kind: 'prose', payload: null }`. (prose는 payload 무시.)
- `kind='table'`인데 payload가 `{ columns: string[], rows: string[][] }`를 만족하지 않으면 → **prose로 폴백**(throw 금지). 만족하면 필요한 필드만 추려 반환(`caption`은 string일 때만).
- `kind='case'`인데 payload의 `branches`가 `{condition,outcome}` 객체 배열(≥1개)이 아니면 → **prose로 폴백**.
- `kind='visual'`인데 payload에 string `cue`가 없으면 → **prose로 폴백**.
- 폴백 사유로 **예외를 던지지 마라**(이유: 적재 파이프라인이 한 세그먼트 때문에 통째로 죽으면 안 됨 — 깨진 블록은 조용히 prose로 떨어뜨린다).
- 알 수 없는 추가 필드는 버린다(필드 명시 선택 — stray 흡수, `style-extract-fold-stray` 교훈).

### 3) scribe 타입에 optional 필드 추가 (스키마 아님)

`src/agents/scribe/schema.ts`의 **TypeScript 인터페이스 `ScriptSegmentOut`에만** optional 필드 추가:

```ts
export interface ScriptSegmentOut {
  ord: number;
  text: string;
  used_fact_idxs: number[];
  used_asset_idxs: number[];
  kind?: string;       // P1 추가: 레일(짠펜은 아직 미emit, 기본 prose). 적재 시 normalizeSegmentPayload로 정규화.
  payload?: unknown;   // P1 추가: 블록 데이터. 마찬가지로 미emit.
}
```

- **`SCRIBE_SCHEMA`(JSON Schema 상수)와 `SCRIBE_SYSTEM`은 한 글자도 바꾸지 마라.** 이유: 둘 중 하나라도 바뀌면 promptHash가 변해 기존 scribe fixture가 전부 무효화된다(parity 회귀). optional TS 필드는 런타임 스키마와 무관하므로 promptHash에 영향 없다.

### 4) 테스트 `tests/segmentBlock.test.ts`

`normalizeSegmentPayload`의 vitest 테스트. 최소 케이스:

- prose(또는 undefined/null/미지 kind) → `{kind:'prose', payload:null}`.
- 정상 table → table payload 통과(columns/rows 보존, caption 비-string이면 제외).
- 깨진 table(rows 누락/잘못된 타입) → prose 폴백.
- 정상 case → case payload 통과. 빈 branches/잘못된 branch → prose 폴백.
- 정상 visual / cue 없는 visual(→prose 폴백).
- 예외를 던지지 않음(throw 금지) 확인.

## Acceptance Criteria

```bash
npm run typecheck   # 타입 에러 0
npm test            # 전체 통과(기존 710 + segmentBlock 신규). scribe parity fixture 회귀 없음
npm run build       # 컴파일 에러 0
```

## 검증 절차

1. 위 AC 커맨드를 실행한다(빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드로 판별).
2. 아키텍처 체크리스트:
   - 마이그레이션이 additive·멱등(`begin/commit`)인가? 기존 컬럼 drop/alter 없는가?
   - `SCRIBE_SCHEMA`·`SCRIBE_SYSTEM` diff가 **0줄**인가? (`git diff src/agents/scribe/schema.ts`로 확인 — 인터페이스 외 변경 금지.)
   - scribe parity fixture 재기록이 **불필요**한가(test 그대로 통과)?
   - `segmentBlock.ts`가 순수(DB·LLM·import I/O 없음)인가?
3. 결과에 따라 `phases/script-format-model/index.json`의 step 0을 갱신:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약(생성 파일·핵심 결정)"`
   - 3회 시도 후 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- `SCRIBE_SCHEMA` / `SCRIBE_SYSTEM`을 수정하지 마라. 이유: promptHash가 바뀌어 기존 scribe fixture가 전부 깨지고 parity 회귀. P2에서 짠펜이 실제로 블록을 emit할 때 함께 처리한다.
- 마이그레이션을 적용(`supabase db push` 등)하지 마라. 이유: 적용은 phase 머지 후 사용자 몫. 파일 생성까지가 산출물.
- `normalizeSegmentPayload`에서 예외를 던지지 마라. 이유: 깨진 블록 하나가 적재 전체를 죽이면 안 됨 — 조용히 prose 폴백.
- `script_segments` 기존 컬럼·기존 마이그레이션 파일을 수정하지 마라. 이유: additive 원칙 위반·기존 데이터 손상.
- 명세에 없는 신규 파일(docs·다이어그램·빌드 산출물)을 커밋에 섞지 마라. `git status`로 확인하고 범위 외는 제외.
- 기존 테스트를 깨뜨리지 마라.
