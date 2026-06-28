-- production_runs 에 is_standalone 플래그 추가.
--   단독 실행(특정 단계만 따로 돌린 임시 run)을 메인 목록(listRuns)에서 숨기기 위함.
--   순수 additive — default false 라 기존 run·상태전이 트리거·run_state_transitions 에 영향 0.
--   is_standalone 은 run state 와 직교하므로 enforce_run_transition 트리거/전이표는 건드리지 않는다.
--   멱등: add column if not exists (여러 번 실행해도 안전).
--   ⚠️ 사람이 적용한다(라이브 활성화 시) — 하네스/AC 는 이 마이그레이션을 자동 적용하지 않는다.

alter table public.production_runs add column if not exists is_standalone boolean not null default false;
