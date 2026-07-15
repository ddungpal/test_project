-- approved 런의 대본 재생성을 위해 approved→scripting 전이를 additive로 추가.
-- src/domain/enums.ts ALLOWED_TRANSITIONS 와 동기화. 멱등·up only.
-- ⚠ state CHECK 무변경: approved·scripting 둘 다 기존 상태 → CHECK 그대로.
-- ⚠ 이 마이그레이션은 자동 반영되지 않는다 — 사람이 라이브 Supabase DB에 직접 적용해야 함
--    (과거 마이그34 미적용으로 버그 난 전례. 이 step은 파일만 만들고 적용은 사람 몫).
begin;
insert into public.run_state_transitions (from_state, to_state) values
  ('approved','scripting')
on conflict (from_state, to_state) do nothing;
commit;
