# Step 0: comparison-asset-schema

스크립트 품질 로드맵 **P3(`comparison-table`)의 데이터 토대**. 김짠부 핵심 예시인 **비교표**(예: 청년도약계좌 vs 청년미래적금 — 가입조건·금리·혜택·중도해지)를 정확하게 만들려면, 평면 사실(`research_facts`)이 아니라 **구조화된 비교 데이터**(엔티티 × 차원 × 셀)가 필요하다. 이 step은 그 데이터를 담을 **저장소 + 순수 정규화 함수 + 타입**을 깐다.

## 배경 (P1·P2에서 이어짐)

- **P1**(완료): `script_segments`에 `kind`/`payload`, `SegmentList`가 `kind='table'`을 렌더, 순수 `normalizeSegmentPayload`(깨지면 prose 폴백). 즉 **표를 화면에 그리는 레일은 이미 있다**.
- **P2**(완료): 구다리 outline 섹션에 `format`('table'/'case'/'explain'), 짠펜이 format을 보고 표 블록을 emit(현재는 평면 fact로 **즉흥** 생성 → 얕음).
- **P3의 목표**: 그 표를 **검증된 구조화 데이터**로 깊고 정확하게. 이 step은 그 데이터의 **그릇**만 만든다(생성=step1, 짠펜 연결=step2, UI=step3).
- **아키텍처 결정**: 비교 데이터는 셈이(숫자)·유이(비유)와 같은 "쉬운 설명 자산" 계열이다 → `explanation_assets`에 **새 kind `'comparison'`**으로 얹는다(별도 테이블 신설보다 lineage·게이트 재사용이 일관적).

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·보안·크루(셜록=리서치).
- `supabase/migrations/20260618120005_l2_pipeline.sql` **65~79행** — `explanation_assets` 정의(`kind text check (kind in ('number','analogy'))`, `numeric_example`/`analogy`/`math_verified`/`distortion_checked`/`used_in_script` 등).
- `supabase/migrations/20260630120029_script_segment_kind.sql` — **가장 최근 마이그레이션**. additive·멱등·`begin;`/`commit;` 패턴 + P1의 `kind`/`payload` 추가 방식을 그대로 미러한다.
- `src/pipeline/segmentBlock.ts` — P1의 `normalizeSegmentPayload`(깨지면 폴백·throw 0·loose 흡수). **이 step의 `normalizeComparison`은 이 함수의 설계 철학을 미러한다.**
- `src/lib/supabase/database.types.ts` — `ExplanationAssets` 타입(여기에 kind/payload 반영).
- `tests/segmentBlock.test.ts` — 순수 정규화 테스트 작성 스타일 참고.

## 작업

### 1) 마이그레이션 30 (additive·하위호환)

새 파일 `supabase/migrations/20260701120030_explanation_asset_comparison.sql`:

- `public.explanation_assets`의 `kind` CHECK 제약을 `('number','analogy','comparison')`으로 확장한다.
  - 기존 CHECK 제약명을 확인해(예: `explanation_assets_kind_check`) `alter table ... drop constraint ... ; alter table ... add constraint ... check (kind in ('number','analogy','comparison'))` 로 교체. **drop+add는 같은 트랜잭션 안에서**(begin/commit). 기존 number/analogy 행은 그대로 유효.
  - 제약명이 불확실하면 `information_schema`로 확인하거나, P1이 `script_segments.kind` CHECK를 추가한 방식과 동일한 안전한 방법을 쓴다.
- `payload jsonb` 컬럼 추가(nullable — number/analogy 행은 null). 비교 데이터(entities/dimensions/cells)를 담는다.
- `begin;`/`commit;`. 헤더 주석으로 의도 명시. **up only·additive — 기존 컬럼 drop/타입변경 금지.**

**마이그레이션 적용은 하지 마라.** 사용자가 phase 머지 후 수동 적용한다(파일 생성까지가 산출물).

### 2) 순수 정규화 모듈 `src/pipeline/comparisonAsset.ts`

```ts
export interface ComparisonCell {
  dimension: string;   // 비교 차원(예: "가입조건")
  entity: string;      // 비교 대상(예: "청년도약계좌")
  value: string;       // 그 칸의 값
  verified: boolean;   // 이 값이 검증된 fact에 근거하는가(false면 화면/대본에서 '확인 필요'로 표기)
}
export interface ComparisonPayload {
  entities: string[];      // 비교 대상 ≥2
  dimensions: string[];    // 비교 차원 ≥1
  cells: ComparisonCell[]; // entity×dimension 칸들
  caption?: string;
}

// comparator(또는 시드)가 준 payload를 적재 가능한 형태로 정규화한다.
// 구조가 깨졌으면 null을 반환한다(=이 자산은 드랍 — money-safety: 깨진 비교가 표로 박제되지 않게).
export function normalizeComparison(payload: unknown): ComparisonPayload | null;
```

**핵심 규칙(반드시):**

- `entities`가 string 배열이고 **≥2**, `dimensions`가 string 배열이고 **≥1**, `cells`가 배열이 아니면 → `null`(드랍). 이유: 비교 대상이 1개면 표가 아니다.
- 각 cell은 `{dimension, entity, value}`가 string이어야 유효. `entity`/`dimension`이 선언된 `entities`/`dimensions`에 **없으면 그 cell은 버린다**(stray 흡수). `verified`는 boolean이 아니면 **false로 폴백**(보수적 — 미검증 취급).
- 유효 cell이 0개면 → `null`(빈 표 금지).
- **throw 금지**(P1 normalizeSegmentPayload와 동일 철학 — 한 자산이 적재 전체를 죽이면 안 됨).
- 알 수 없는 추가 필드는 버린다(필드 명시 선택). `caption`은 string일 때만.

### 3) `database.types.ts` 반영

`ExplanationAssets`(Row/Insert/Update)에 `kind`를 `'number'|'analogy'|'comparison'`로, `payload: Json | null`을 추가한다(마이그레이션 30과 1:1). P1이 `script_segments`에 한 방식 미러.

### 4) 테스트 `tests/comparisonAsset.test.ts`

`normalizeComparison`의 vitest 테스트. 최소:

- 정상 비교(entities 2·dimensions 2·cells grounded) → payload 통과(필드 보존).
- entities 1개 → null. dimensions 0 → null. 유효 cell 0개 → null.
- entity/dimension가 선언 목록에 없는 cell → 그 cell만 버려짐(나머지 통과).
- `verified` 누락/비-boolean → false 폴백.
- throw 하지 않음 확인.

## Acceptance Criteria

```bash
npm run typecheck   # 타입 에러 0
npm test            # 전체 통과(기존 737 + comparisonAsset 신규)
npm run build       # 컴파일 에러 0
```

## 검증 절차

1. AC 실행(빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - 마이그레이션이 additive·멱등(begin/commit)이고 기존 number/analogy 행을 깨지 않는가?
   - kind CHECK 교체가 같은 트랜잭션 안에서 안전하게 이뤄지는가?
   - `comparisonAsset.ts`가 순수(DB·LLM·I/O 없음)이고 깨진 payload에 throw 없이 null인가?
3. `phases/comparison-table/index.json`의 step 0 갱신(completed+summary / error / blocked).

## 금지사항

- 마이그레이션을 적용하지 마라. 이유: 적용은 phase 머지 후 사용자 몫.
- `explanation_assets`의 기존 컬럼(numeric_example·analogy·math_verified·distortion_checked)을 drop/변경하지 마라. 이유: number/analogy 자산·기존 데이터 손상.
- `normalizeComparison`에서 throw 하지 마라. 이유: 깨진 비교 자산 하나가 적재 전체를 죽이면 안 됨 — null 드랍.
- comparator 에이전트·researchCell·scriptCell·UI를 건드리지 마라. 이유: 각각 step1·2·3 범위. 이 step은 그릇만.
- 명세에 없는 신규 파일(docs·다이어그램·빌드 산출물)을 커밋에 섞지 마라. `git status`로 확인하고 범위 외는 제외(하네스 `git add -A` 떠돌이 함정).
- 기존 테스트를 깨뜨리지 마라.
