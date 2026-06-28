# Step 1: standalone-run-flag

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙(새 환경변수 아님, 마이그레이션 컨벤션)
- `src/lib/dashboard/queries.ts:23-55` — `listRuns`(메인 목록 쿼리, 여기 필터 추가)
- `src/app/page.tsx:50-52` — `listRuns()` 호출부(영향 범위 확인)
- `supabase/migrations/` 최근 파일 1~2개 — 마이그레이션 SQL 작성 컨벤션(파일명 타임스탬프·idempotent 스타일)
- `src/lib/supabase/database.types.ts` — `production_runs` Row/Insert/Update 타입(컬럼 추가 반영처)

## 목표

단독 실행으로 만든 임시 run을 **메인 목록에서 숨긴다.** `production_runs.is_standalone` 컬럼 추가 + `listRuns`가 기본(파이프라인) run만 반환.

## 작업

- 마이그레이션 신규 1개: `production_runs`에 `is_standalone boolean not null default false` 추가.
  - **순수 additive** — default false라 기존 run·트리거·전이표에 영향 0(기존 행 전부 false).
  - 상태 전이 트리거(`enforce_run_transition`)·`run_state_transitions`를 건드리지 마라(이 컬럼은 state와 무관).
- `src/lib/supabase/database.types.ts`의 `production_runs` Row/Insert/Update에 `is_standalone: boolean`(Insert는 optional) 반영.
- `listRuns`(queries.ts): select에 `is_standalone` 포함하고 `.eq("is_standalone", false)`로 필터 → 메인 목록은 파이프라인 run만.
  - 다른 소비처(run 상세 등)는 건드리지 마라 — 상세는 id 직접 조회라 is_standalone 무관(단독 run도 /runs/[id]로 열려야 함).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 마이그레이션이 additive·default false(기존 데이터·전이 트리거 무영향).
   - `listRuns`만 필터(목록 보호), 상세 조회 경로는 불변.
   - database.types.ts에 컬럼 반영(typecheck 통과 근거).
3. `phases/standalone-stages/index.json`의 step 1 갱신. **summary에 '마이그레이션 사용자 적용 필요'를 명시**(이 프로젝트는 마이그레이션을 사람이 적용한다 — 적용 전엔 listRuns가 컬럼 부재로 런타임 에러).

## 금지사항

- 상태 전이 트리거·전이표(`run_state_transitions`)를 수정하지 마라. 이유: is_standalone은 state와 직교, 트리거 변경은 전체 파이프라인 안전망을 흔든다.
- listRuns 외 다른 run 조회에 is_standalone 필터를 넣지 마라. 이유: 단독 run도 `/runs/[id]` 상세로 열려야 결과를 본다.
- 기존 테스트를 깨뜨리지 마라.
