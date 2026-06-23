# Step 0: adoption-signal  ⭐ (Phase D 주춧돌)

**단계별 채택률 신호를 집계한다 — "이제 됐다"(AX 전환) 정성판단의 보조 지표.** 김짠부가 제안을 **그대로 선택**했는지 **수정**했는지를 `stage_selections`가 기록한다(`edit_distance`·`edited_payload`). 단계(stage)별로 **그대로 채택 비율 + 평균 수정량**을 내는 **순수 집계 함수**를 만들고 테스트한다. (높은 채택률 = 그 에이전트 말투/제안이 김짠부에게 먹힘 → 내재화 후보.)

## 읽어야 할 파일 (먼저 정독)
- `supabase/migrations/20260618120005_l2_pipeline.sql` — 스키마:
  - `stage_proposals(id, run_id, stage)` — `stage` ∈ `topic|title_thumb|structure|research|script`.
  - `stage_selections(proposal_id→stage_proposals, chosen_idx, edited_payload jsonb, edit_distance numeric, ...)`. **그대로 채택 = `edit_distance`가 0/null 이고 `edited_payload`가 null**(수정 안 함). 수정 = `edit_distance > 0` 또는 `edited_payload` 존재.
- `src/lib/dashboard/` 의 기존 뷰 패턴(`insightsView.ts`·`queries.ts`) — 집계 헬퍼를 어디에·어떤 형태로 두는지(순수 계산 + 얇은 조회 분리).
- `src/lib/supabase/database.types.ts` — `stage_selections`·`stage_proposals` Row 타입.

## 작업
1. **순수 집계 함수**(테스트 가능·DB 무관)를 새 파일(예 `src/performance/adoptionSignal.ts` 또는 `src/lib/dashboard/`)에 만든다:
   - 입력: `{ stage: string; edit_distance: number | null; edited_payload: unknown | null }[]`(= stage_selections ⨝ stage_proposals 로 stage를 붙인 행).
   - `export function computeAdoptionSignal(rows): Record<stage, { n: number; adoptedAsIs: number; adoptionRate: number; avgEditDistance: number }>` (+ 전체 합계 포함해도 됨).
   - **그대로 채택 판정**: `(edit_distance == null || edit_distance === 0) && edited_payload == null`. (둘 중 하나라도 수정 신호면 '수정'으로 친다.)
   - `adoptionRate = adoptedAsIs / n`(n=0이면 0 또는 null 명시 — `noUncheckedIndexedAccess` 가드). `avgEditDistance`는 edit_distance 있는 행 평균(없으면 0).
   - **순수**(부수효과 없음, `Date`/랜덤/IO 금지) → vitest로 결정적 검증.
2. **얇은 조회 헬퍼**(선택, best-effort): `src/lib/dashboard/`에 `stage_selections`+`stage_proposals` 조인 조회 후 위 함수에 넘기는 함수. **DB 임베드 타입추론 안 되니 코드로 조인**(함정 참조: 두 번 조회 후 proposal_id로 매칭). 컬럼 미적용/빈 데이터에 안 깨지게 `?? []`·가드.
3. 반환 타입·필드 명확히. 기존 뷰 코드 스타일 따른다.

## 테스트 (신규 `tests/adoptionSignal.test.ts`)
- 섞인 입력(그대로 채택 N + 수정 M, 여러 stage) → stage별 `adoptionRate`·`avgEditDistance` 정확.
- `edit_distance=0 & edited_payload=null` → 그대로 채택. `edited_payload={...}` 또는 `edit_distance>0` → 수정.
- `edit_distance=null & edited_payload=null` → 그대로 채택(보수적: 수정 신호 없음).
- 빈 입력 → 빈 결과(throw 금지·n=0 안전).

## 주의
- **DB·LLM·네트워크 0** — 순수 집계만. 조회 헬퍼를 만들면 그건 테스트 대상 아님(순수함수만 테스트).
- `noUncheckedIndexedAccess`(stage 키 접근 가드)·`exactOptionalPropertyTypes` 준수.
- 범위: 새 집계 파일 + (선택)`src/lib/dashboard/` 조회 + `tests/adoptionSignal.test.ts`. 대시보드 UI·다른 영역 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"단계별 채택률 신호 순수집계(computeAdoptionSignal: stage별 그대로채택비율·평균수정량) + 테스트. DB/LLM 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.
