-- 11 — 정적-A 설정 시드(확정값) + 신규 가입자 프로필 자동생성.
-- 값 출처: docs/tech.md §15 확정분 + §17. 운영 중 변경은 새 version 행 추가(이력 보존).

insert into public.config_registry (key, value, note) values
  ('cost.soft_cap_usd',          '7'::jsonb,                                      '편당 소프트캡(사람 확인)'),
  ('cost.hard_cap_usd',          '10'::jsonb,                                     '편당 하드캡(자동 중단)'),
  ('pipeline.max_rework',        '2'::jsonb,                                      '단계당 재시도 상한'),
  ('triage.min_independent_origins', '2'::jsonb,                                  '교차검증 독립출처 최소'),
  ('ab.margin_decisive',         '0.10'::jsonb,                                   'A/B decisive 임계(1위-2위)/1위'),
  ('ab.margin_marginal',         '0.03'::jsonb,                                   'A/B marginal 하한(미만=inconclusive)'),
  ('ttl.by_volatility',          '{"static":null,"slow":"30d","fast":"24h"}'::jsonb, '변동성→TTL 매핑(§6)'),
  ('search.kr_official_domains', '["nts.go.kr","fsc.go.kr","bok.or.kr","kostat.go.kr","law.go.kr"]'::jsonb, '한국 1차 출처 화이트리스트'),
  ('model.routing',              '{"classify":"haiku","verify":"sonnet","generate":"sonnet","final":"opus"}'::jsonb, '단계별 기본 모델(§14)');

-- 신규 auth 가입 → viewer 프로필 자동 생성. 최초 운영자는 가입 후 SQL로 owner 승격:
--   update public.profiles set role='owner' where id = (select id from auth.users order by created_at limit 1);
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, 'viewer', coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
