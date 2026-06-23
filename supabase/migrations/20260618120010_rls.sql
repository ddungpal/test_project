-- 10 — RLS 정책 실체화(§17). "전 테이블 ON" 선언만 있던 것을 실제 정책으로.
-- 모델:
--  * service_role(서버 ingest/파이프라인)은 RLS 우회(Supabase 기본) → 정책은 대시보드 사용자(authenticated) 대상.
--  * 읽기 = 프로필 보유 authenticated(viewer+). 쓰기 = editor+(owner/editor). 민감(config/L3/profiles) = owner.
--  * L1 원본 = INSERT만(UPDATE/DELETE는 불변 트리거+정책으로 차단). comments_raw 삭제/레닥션은 service-role 전용.
-- app_role(): SECURITY DEFINER라 profiles RLS 재귀 없이 호출자 역할 조회.

-- ── RLS 활성화 (전 테이블) ──
alter table public.profiles               enable row level security;
alter table public.config_registry        enable row level security;
alter table public.contents               enable row level security;
alter table public.production_runs        enable row level security;
alter table public.script_imports         enable row level security;
alter table public.transcripts            enable row level security;
alter table public.comments_raw           enable row level security;
alter table public.topic_interviews       enable row level security;
alter table public.source_documents       enable row level security;
alter table public.source_parses          enable row level security;
alter table public.stage_proposals        enable row level security;
alter table public.stage_selections       enable row level security;
alter table public.research_facts         enable row level security;
alter table public.explanation_assets     enable row level security;
alter table public.script_segments        enable row level security;
alter table public.script_segment_facts   enable row level security;
alter table public.script_segment_explanation_assets enable row level security;
alter table public.topic_candidates       enable row level security;
alter table public.performance_metrics    enable row level security;
alter table public.cost_ledger            enable row level security;
alter table public.tone_profile           enable row level security;
alter table public.insights               enable row level security;
alter table public.retrospectives         enable row level security;
alter table public.corpus_editions        enable row level security;
alter table public.corpus_components      enable row level security;
alter table public.ab_variants            enable row level security;
alter table public.style_profiles         enable row level security;
alter table public.profile_training_sources enable row level security;
alter table public.run_state_transitions  enable row level security;

-- ── profiles: 본인 행 읽기/수정. 역할 관리(타인)는 서버(service-role). 재귀 방지 위해 app_role() 미사용. ──
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ── config_registry: 읽기 authenticated, 쓰기 owner ──
create policy config_select on public.config_registry for select to authenticated using (true);
create policy config_write on public.config_registry for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

-- ── 참조 테이블(읽기 전용) ──
create policy transitions_select on public.run_state_transitions for select to authenticated using (true);

-- ── 헬퍼 매크로 대신: 운영 테이블 공통 패턴을 테이블마다 명시 ──
-- 읽기: viewer+ (프로필 보유). 쓰기: editor+.
-- contents
create policy contents_select on public.contents for select to authenticated using (public.app_role() is not null);
create policy contents_write  on public.contents for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- production_runs
create policy runs_select on public.production_runs for select to authenticated using (public.app_role() is not null);
create policy runs_write  on public.production_runs for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- topic_interviews (L1 — insert-only, 코드리뷰 P1: UPDATE/DELETE 정책 없음 → 사실상 append-only)
create policy ti_select on public.topic_interviews for select to authenticated using (public.app_role() is not null);
create policy ti_insert on public.topic_interviews for insert to authenticated with check (public.app_role() in ('owner','editor'));
-- stage_proposals
create policy sp_select on public.stage_proposals for select to authenticated using (public.app_role() is not null);
create policy sp_write  on public.stage_proposals for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- stage_selections
create policy ss_select on public.stage_selections for select to authenticated using (public.app_role() is not null);
create policy ss_write  on public.stage_selections for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- research_facts
create policy rf_select on public.research_facts for select to authenticated using (public.app_role() is not null);
create policy rf_write  on public.research_facts for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- explanation_assets
create policy ea_select on public.explanation_assets for select to authenticated using (public.app_role() is not null);
create policy ea_write  on public.explanation_assets for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- script_segments (+ 조인)
create policy seg_select on public.script_segments for select to authenticated using (public.app_role() is not null);
create policy seg_write  on public.script_segments for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
create policy segf_select on public.script_segment_facts for select to authenticated using (public.app_role() is not null);
create policy segf_write  on public.script_segment_facts for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
create policy sega_select on public.script_segment_explanation_assets for select to authenticated using (public.app_role() is not null);
create policy sega_write  on public.script_segment_explanation_assets for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- topic_candidates
create policy tc_select on public.topic_candidates for select to authenticated using (public.app_role() is not null);
create policy tc_write  on public.topic_candidates for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- performance_metrics
create policy pm_select on public.performance_metrics for select to authenticated using (public.app_role() is not null);
create policy pm_write  on public.performance_metrics for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- cost_ledger
create policy cl_select on public.cost_ledger for select to authenticated using (public.app_role() is not null);
create policy cl_write  on public.cost_ledger for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- retrospectives
create policy retro_select on public.retrospectives for select to authenticated using (public.app_role() is not null);
create policy retro_write  on public.retrospectives for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- ab_variants
create policy ab_select on public.ab_variants for select to authenticated using (public.app_role() is not null);
create policy ab_write  on public.ab_variants for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- source_parses (가변 파싱)
create policy spar_select on public.source_parses for select to authenticated using (public.app_role() is not null);
create policy spar_write  on public.source_parses for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));
-- profile_training_sources (L3 provenance — owner-only 쓰기, 코드리뷰 P1)
create policy pts_select on public.profile_training_sources for select to authenticated using (public.app_role() is not null);
create policy pts_write  on public.profile_training_sources for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

-- ── L1 원본: SELECT(viewer+) + INSERT(editor+)만. UPDATE/DELETE 정책 없음 → 불변(트리거도 차단). ──
create policy si_select on public.script_imports for select to authenticated using (public.app_role() is not null);
create policy si_insert on public.script_imports for insert to authenticated with check (public.app_role() in ('owner','editor'));
create policy tr_select on public.transcripts for select to authenticated using (public.app_role() is not null);
create policy tr_insert on public.transcripts for insert to authenticated with check (public.app_role() in ('owner','editor'));
create policy sd_select on public.source_documents for select to authenticated using (public.app_role() is not null);
create policy sd_insert on public.source_documents for insert to authenticated with check (public.app_role() in ('owner','editor'));
create policy ce_select on public.corpus_editions for select to authenticated using (public.app_role() is not null);
create policy ce_insert on public.corpus_editions for insert to authenticated with check (public.app_role() in ('owner','editor'));
create policy cc_select on public.corpus_components for select to authenticated using (public.app_role() is not null);
create policy cc_insert on public.corpus_components for insert to authenticated with check (public.app_role() in ('owner','editor'));

-- ── comments_raw: SELECT(viewer+) + INSERT(editor+). UPDATE/DELETE 정책 없음 ──
--    → 삭제/레닥션은 service-role(서버) 전용. governance §3 삭제요청 처리.
create policy cr_select on public.comments_raw for select to authenticated using (public.app_role() is not null);
create policy cr_insert on public.comments_raw for insert to authenticated with check (public.app_role() in ('owner','editor'));

-- ── L3 승인 지식: 읽기 authenticated, 쓰기 owner(승인 워크플로우) ──
create policy tone_select on public.tone_profile for select to authenticated using (public.app_role() is not null);
create policy tone_write  on public.tone_profile for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');
create policy ins_select on public.insights for select to authenticated using (public.app_role() is not null);
create policy ins_write  on public.insights for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');
create policy stp_select on public.style_profiles for select to authenticated using (public.app_role() is not null);
create policy stp_write  on public.style_profiles for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');
