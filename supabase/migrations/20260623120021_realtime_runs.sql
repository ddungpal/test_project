-- migration 21: 실시간 구독 — production_runs를 supabase_realtime publication에 추가.
--   대시보드가 폴링 대신 Realtime으로 파이프라인 진행(state·progress_note)을 즉시 반영.
--   ★ RLS는 그대로 적용 — authenticated(owner/editor/viewer) 세션만 변경 이벤트 수신.
--     dev 바이패스(세션 없음)는 이벤트 미수신 → 클라의 느린 폴링 폴백이 커버.
--   미적용이어도 앱은 폴링으로 degrade(ship-safe).

-- publication에 없으면 추가(멱등). Supabase는 supabase_realtime publication을 기본 제공.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'production_runs'
  ) then
    alter publication supabase_realtime add table public.production_runs;
  end if;
end $$;
