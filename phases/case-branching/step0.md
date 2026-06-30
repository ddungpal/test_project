# Step 0: case-asset-schema

스크립트 품질 로드맵 **P4(`case-branching`)의 데이터 토대**. 김짠부 특유의 **케이스 분기**("이런 상황이면 A / 저런 상황이면 B")를 댓글에서 발굴한 실제 궁금증 + 검증된 사실로 채우기 위한 **저장소 + 순수 정규화 함수 + 타입**을 깐다. P3(비교표)와 **구조가 동일**하다 — 비교가→분기가, kind='comparison'→kind='case'.

## 배경 (P1·P2·P3에서 이어짐)

- **P1**(완료): `script_segments.kind`/`payload` + `SegmentList`의 `kind='case'` 렌더('조건 → 결과' 분기) + 순수 `normalizeSegmentPayload`(case는 `normalizeCase`로 처리).
- **P2**(완료): 구다리 outline 섹션 `format='case'`, 짠펜이 즉흥으로 분기 생성(얕음).
- **P3**(완료): 비교가(comparator)가 검증된 사실로 `explanation_assets(kind='comparison', payload jsonb)` 생성 → 짠펜이 정확한 표 emit. **마이그30이 `explanation_assets`에 `payload jsonb`를 이미 추가**(case 자산도 이 컬럼 재사용).
- **P4의 목표**: format='case' 섹션을 **댓글 발굴 궁금증 + 검증된 사실**로 깊게. 이 step은 그 데이터의 **그릇**만(생성=step1, 짠펜 연결=step2, UI=step3).
- **아키텍처 결정**: P3와 동일하게 `explanation_assets`에 **새 kind `'case'`**로 얹는다.

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·크루.
- `supabase/migrations/20260701120030_explanation_asset_comparison.sql` — **P3의 마이그30**. `explanation_assets`의 kind CHECK를 number/analogy/comparison으로 확장 + `payload jsonb` 추가한 방식. **이 step의 마이그31은 이 패턴을 미러**(kind에 'case'만 추가 — payload는 이미 있음).
- `src/pipeline/comparisonAsset.ts` — **P3의 `normalizeComparison`**(깨지면 null 드랍·stray 흡수·throw 0). **이 step의 `caseAsset.ts`는 이 모듈을 미러**한다.
- `src/pipeline/segmentBlock.ts` **42~57행** — P1의 `CasePayload`(`{intro?, branches:[{condition,outcome}]}`)·`normalizeCase`. case **세그먼트** payload 형태. case **자산** payload는 여기에 grounding 메타를 더한 형태(아래).
- `src/lib/supabase/database.types.ts` — `ExplanationAssets`(P3에서 kind에 comparison·payload 추가됨). 여기에 'case' 추가.
- `tests/comparisonAsset.test.ts` — 순수 정규화 테스트 스타일.

## 작업

### 1) 마이그레이션 31 (additive·하위호환·작음)

새 파일 `supabase/migrations/20260702120031_explanation_asset_case.sql`:

- `public.explanation_assets`의 `kind` CHECK를 `('number','analogy','comparison','case')`로 확장(마이그30이 만든 CHECK를 같은 트랜잭션 내 drop+add로 교체 — 마이그30 방식 그대로).
- **`payload jsonb`는 이미 마이그30에 있으므로 추가하지 마라**(중복 컬럼 에러). kind CHECK 확장만.
- `begin;`/`commit;`. 헤더 주석. up only·additive.

**마이그레이션 적용 금지**(phase 머지 후 사용자 수동 적용).

### 2) 순수 정규화 모듈 `src/pipeline/caseAsset.ts`

```ts
export interface CaseBranch {
  condition: string;   // 시청자 상황(예: "5년 이상 묻어둘 수 있다면")
  outcome: string;     // 그 상황의 권장/결론
  grounded: boolean;   // 검증된 fact에 근거하는가(false면 '확인 필요'로 다룸)
}
export interface CaseAssetPayload {
  intro?: string;
  branches: CaseBranch[];   // ≥2 (분기가 1개면 케이스가 아님)
}

// case-miner(또는 시드)가 준 payload를 적재 가능 형태로 정규화. 깨졌으면 null(드랍·money-safety).
export function normalizeCaseAsset(payload: unknown): CaseAssetPayload | null;
```

**핵심 규칙(반드시):**

- `branches`가 배열이고 유효 branch **≥2**가 아니면 → `null`(드랍). 이유: 분기 1개는 케이스가 아니다(단일은 prose/explain). (참고: P1의 세그먼트 `normalizeCase`는 ≥1을 허용하지만, **자산** 단계는 ≥2로 더 엄격 — 케이스의 본질이 분기이므로.)
- 각 branch는 `{condition, outcome}`가 string이어야 유효. `grounded`가 boolean이 아니면 **false 폴백**(보수적).
- 유효 branch가 2개 미만이면 → `null`.
- **throw 금지**(comparisonAsset·segmentBlock과 동일 철학).
- 알 수 없는 추가 필드 버림. `intro`는 string일 때만.

### 3) `database.types.ts` 반영

`ExplanationAssets`의 `kind` union에 `'case'` 추가(payload는 P3에서 이미 Json|null). 마이그31과 1:1.

### 4) 테스트 `tests/caseAsset.test.ts`

- 정상 케이스(branches 2·grounded) → payload 통과.
- branches 1개 → null(케이스 아님). branches 0 → null.
- condition/outcome 비-string인 branch → 그 branch 무효 → 결과적으로 유효 2개 미만이면 null.
- `grounded` 누락/비-boolean → false 폴백.
- throw 하지 않음 확인.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - 마이그31이 kind CHECK만 확장하고 **payload 컬럼을 다시 추가하지 않는가**(마이그30과 중복 금지)?
   - 마이그가 additive·멱등(begin/commit)·기존 행 보존인가?
   - `caseAsset.ts`가 순수·throw 0·branches<2면 null인가?
3. `phases/case-branching/index.json`의 step 0 갱신(completed+summary / error / blocked).

## 금지사항

- 마이그레이션에 `payload jsonb`를 다시 추가하지 마라. 이유: 마이그30이 이미 추가 — 중복 컬럼 에러.
- 마이그레이션을 적용하지 마라(사용자 몫).
- `explanation_assets` 기존 컬럼·기존 마이그 파일을 수정하지 마라. 이유: number/analogy/comparison 자산 손상.
- `normalizeCaseAsset`에서 throw 하지 마라. 이유: 깨진 자산 하나가 적재 전체를 죽이면 안 됨 — null 드랍.
- case-miner·researchCell·scriptCell·UI·`comparisonAsset.ts`를 건드리지 마라. 이유: 각각 step1·2·3 범위. 이 step은 그릇만.
- 명세에 없는 신규 파일(docs·다이어그램·빌드 산출물)을 커밋에 섞지 마라. `git status` 확인·범위 외 제외(하네스 `git add -A` 떠돌이 함정).
- 기존 테스트를 깨뜨리지 마라.
