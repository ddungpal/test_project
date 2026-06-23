-- 02 — 인증/팀(profiles) + 정적-A 설정(config_registry). tech.md §3.0.1·§3.1.
-- 순서: profiles 먼저(config_registry.updated_by가 참조 — tech.md DDL forward-ref 수정, §17).

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')) default 'viewer',
  display_name text,
  created_at timestamptz not null default now()
);

-- 현재 호출자의 역할(profiles.role) — RLS 정책에서 사용. profiles 생성 후 정의(코드리뷰 P0-1).
-- SECURITY DEFINER라 profiles RLS 재귀 없이 조회.
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ★ 권한 상승 차단(코드리뷰 P0-2): 사용자(authenticated)는 자기 role을 못 바꾼다.
-- role 변경은 service-role(서버, auth.uid() IS NULL) 컨텍스트에서만 허용 → 자가 owner 승격 봉쇄.
create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception '역할 변경은 service-role(서버)만 가능하다. 자가 승격 금지.';
  end if;
  return new;
end;
$$;

create trigger trg_guard_role_change before update on public.profiles
  for each row execute function public.guard_role_change();

-- 정적-A: 모든 고정값/임계/whitelist 단일 출처(버전·effective_from 이력).
create table public.config_registry (
  id uuid primary key default gen_random_uuid(),
  key text not null,            -- 'ttl.market','triage.min_origins','ab.margin_decisive','cost.hard_cap'...
  value jsonb not null,
  version int not null default 1,
  effective_from date not null default current_date,
  note text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (key, version)
);
