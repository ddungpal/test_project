-- 28 — 리서치 단계 내부 되돌림(re-entry) 전이. research_ready/research_review에서
-- 이전 단계(scope 재조정·재검증)로 되돌아갈 수 있게 4개 전이를 additive로 추가한다.
-- src/domain/enums.ts ALLOWED_TRANSITIONS 와 동기화. additive·멱등(기존 상태·전이 전부 보존). up only.
--
-- ⚠ state CHECK 무변경: 되돌림 전이는 전부 기존 상태(research_scoped·researching)만 사용한다
--    → production_runs.state CHECK는 그대로 둔다(불필요한 drop/add 안 함).
-- ⚠ 27번이 만든 단방향 전이(structure_selected→research_scoped→researching)는 보존(delete 금지) — 본 마이그레이션은 add only.

begin;

-- ── run_state_transitions 되돌림 전이 추가(additive) ───────────────────────
--   research_ready  → research_scoped : 검증 완료본을 보고 scope를 다시 고르러 되돌아감.
--   research_review → research_scoped : 트리아지 검수 중 scope를 다시 고르러 되돌아감.
--   research_ready  → researching     : 같은 scope로 예시(숫자·비유)만 다시 돌리러 재진입.
--   research_review → researching     : (이미 27 이전부터 존재할 수 있음) 검수 중 재검증 재진입.
-- on conflict do nothing 으로 멱등 보장(이미 있는 (from,to)는 무시).
insert into public.run_state_transitions (from_state, to_state) values
  ('research_ready','research_scoped'),
  ('research_review','research_scoped'),
  ('research_ready','researching'),
  ('research_review','researching')
on conflict (from_state, to_state) do nothing;

commit;
