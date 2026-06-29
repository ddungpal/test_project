# Step 0: scope-state-machine

리서치에 **선택 게이트**를 넣기 위한 상태머신 기반 공사. 새 상태 `research_scoped`(셜록 scope 후 → 사용자 선택 대기)를 추가하고, 전이 경로를 `structure_selected → research_scoped → researching`으로 바꾼다. 이 step은 **상태·전이·제약만**(셀/UI는 다음 step). 셀 로직은 안 건드린다.

## 배경

현재 리서치는 `structure_selected → researching`(자동 fan-out)으로 바로 간다. 선택 게이트를 두려면 그 사이에 `research_scoped`(scope 후보를 보여주고 사용자가 고르는 대기 상태)를 끼운다. 상태/전이는 **DB 트리거가 강제**(전이표 + CHECK 제약)하므로 마이그레이션 + enums 둘 다 고쳐야 한다.

## 읽어야 할 파일

- `src/domain/enums.ts` — `RunState` 유니온 + `ALLOWED_TRANSITIONS`(전이 단일 출처, 코드측). 여기에 `research_scoped` 추가.
- `supabase/migrations/20260618120008_state_transitions.sql` — 전이표(`run_state_transitions`) + 상태 CHECK의 원본. 새 마이그레이션이 미러링할 패턴.
- `supabase/migrations/20260628120026_production_runs_is_standalone.sql` 등 최근 마이그레이션 — additive 마이그레이션 네이밍/스타일. **다음 번호 = `20260629120027`**.
- `supabase/migrations/` 중 `stage_proposals`/`stage_selections`의 `stage` CHECK를 건 마이그레이션(예: usertest-fixes에서 'thumbnail' 추가) — `stage='research'` 추가 패턴.
- `src/pipeline/seed.ts`(standalone-stages 산출) — **standalone 시딩이 `structure_selected→researching`을 walk하는지 확인**(전이 경로가 바뀌므로 깨질 수 있음). 셜록 단독 실행이 이 전이를 타면 함께 보정.
- 전이 관련 기존 테스트(`tests/` 중 state transition/runState 검증) — 경로 변경에 맞춰 갱신.

## 작업

### 1) 마이그레이션 — `supabase/migrations/20260629120027_research_scoped_stage.sql` (신규)
- `production_runs` state CHECK 제약을 drop/add 하여 **`research_scoped` 추가**(기존 상태 전부 보존).
- `run_state_transitions`:
  - 기존 `('structure_selected','researching')` **삭제**.
  - 추가: `('structure_selected','research_scoped')`, `('research_scoped','researching')`, `('research_scoped','aborted')`.
- `stage_proposals`·`stage_selections`의 `stage` CHECK에 **`'research'` 추가**(scope 후보를 여기 저장하기 위함 — drop/add).
- **멱등·additive 원칙**: 기존 데이터·전이 보존, 새 것만 추가. 트랜잭션으로.

### 2) `src/domain/enums.ts`
- `RunState`에 `"research_scoped"` 추가.
- `ALLOWED_TRANSITIONS`(코드측 거울): `structure_selected`의 to 목록을 `["research_scoped","aborted"]`로(researching 제거), `research_scoped: ["researching","aborted"]` 추가. researching의 from이 바뀌는 점 반영.
- **코드측 ALLOWED_TRANSITIONS와 마이그레이션 전이표가 정확히 일치**해야 한다(둘이 어긋나면 런타임/DB 불일치).

### 3) standalone 시딩·테스트 보정
- `seed.ts`가 `structure_selected→researching`을 직접 walk하면, 이제 `→research_scoped→researching`을 거치게(또는 셜록 단독은 research_scoped까지만 시드하고 선택 대기). **standalone 셜록 실행이 깨지지 않게** 최소 보정.
- 전이 경로 가정이 깨진 기존 테스트를 새 경로로 갱신(테스트 약화·삭제 금지 — 경로만 수정).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(마이그레이션 실제 적용은 사람이 머지 후 Supabase에 — AC는 코드/타입/테스트만. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 마이그레이션이 기존 상태·전이를 **보존하며** `research_scoped`·새 전이·`stage='research'`만 additive로 추가하는가.
   - `enums.ts` `ALLOWED_TRANSITIONS`가 마이그레이션 전이표와 **정확히 일치**하는가(structure_selected→research_scoped→researching).
   - standalone 시딩(seed.ts)·전이 테스트가 새 경로로 보정돼 그린인가.
   - 셀(researchCell)·UI·서버액션을 **안 건드렸는가**(다음 step 몫).
3. `phases/research-scope-gate/index.json`의 step 0 갱신(completed+summary / error / blocked). **index.json은 반드시 유효한 JSON으로 저장하라.**

## 금지사항

- 기존 상태·전이를 삭제/변경하지 마라(단, `structure_selected→researching`만 새 경로로 교체 — 이건 의도된 변경). 이유: 다른 단계 전이가 깨진다.
- 코드 `ALLOWED_TRANSITIONS`와 DB 전이표를 어긋나게 두지 마라. 이유: transitionRun이 코드 가드와 DB 트리거 둘 다 통과해야 함 — 불일치 시 런 고착.
- researchCell·scopeStep·UI·서버액션을 수정하지 마라. 이유: 이 step은 상태머신만, 셀 분리는 step1·2.
- standalone 시딩이 새 경로에서 깨지게 두지 마라(검증 후 보정).
- 기존 테스트를 약화/삭제하지 마라(경로 변경만 반영).
