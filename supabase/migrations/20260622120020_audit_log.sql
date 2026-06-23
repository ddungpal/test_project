-- migration 20: audit_log — 사람 게이트 결정·변경의 감사 로그(누가·무엇을·언제).
--   김짠부의 '선택'(단계 선택·승인·반려·폐기·인사이트 상태)을 영속 기록 → 학습 추적·책임 추적.
--   쓰기 = service-role(앱 액션, RLS 우회). 읽기 = owner만(민감).

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null, -- 행위자(owner). 삭제돼도 로그 보존.
  action      text not null,        -- 'run_started'|'stage_selected'|'research_approved'|'script_approved'|'script_rework'|'run_aborted'|'run_deleted'|'insight_status'|'insight_edited'
  target_type text,                 -- 'run'|'insight'|'content'
  target_id   uuid,
  detail      jsonb,                -- 부가 컨텍스트(stage·from→to·reason 등)
  created_at  timestamptz not null default now()
);
create index idx_audit_log_created on public.audit_log (created_at desc);
create index idx_audit_log_target  on public.audit_log (target_type, target_id);

alter table public.audit_log enable row level security;
-- 읽기: owner만(감사 로그는 민감). 쓰기 정책 없음 → authenticated 쓰기 차단, service-role(앱)만 insert.
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.app_role() = 'owner');
