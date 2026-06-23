-- produce script — 전체 마이그레이션 일괄 적용 (01~11, 트랜잭션 래핑)
-- Supabase SQL Editor 에 전체 붙여넣고 Run. 에러 시 메시지 공유.

begin;

-- ============================================================
-- 20260618120001_extensions_functions.sql
-- ============================================================
-- Phase 1 마이그레이션 01 — 확장 + 공용 트리거 함수
-- 설계: docs/tech.md §3 · §17 강제분(불변성·state·verified·RLS·인덱스). 의존성 순서로 분할.
-- 적용: Supabase 프로젝트 생성 후 `supabase db push` (또는 SQL 에디터 순서대로).

create extension if not exists pgcrypto; -- gen_random_uuid()

-- updated_at 자동 갱신(가변 테이블).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- L1 불변성 강제(§3.0·§17): UPDATE/DELETE 차단. 선언만으론 부족하므로 트리거로 막는다.
-- comments_raw 는 프라이버시 삭제 예외라 이 트리거를 붙이지 않는다(governance §3).
create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'L1 원본 테이블 %는 불변이다(INSERT만 허용). 시도: %', tg_table_name, tg_op;
end;
$$;

-- NOTE: app_role()은 profiles 테이블 생성 후(02)에 정의한다.
-- LANGUAGE sql 함수는 check_function_bodies(기본 ON)로 본문이 즉시 검증돼,
-- profiles가 없으면 여기서 생성이 실패하기 때문(코드리뷰 P0).

-- ============================================================
-- 20260618120002_config_profiles.sql
-- ============================================================
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

-- ============================================================
-- 20260618120003_contents_runs.sql
-- ============================================================
-- 03 — 단일 척추(contents) + 실행(production_runs). tech.md §3.3.
-- §17: production_runs.state 를 free text → CHECK enum(+paused_soft_cap/aborted)으로 강제.

create table public.contents (                 -- 과거 편(imported)·신규 제작(produced) 공통 척추
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('imported','produced')) default 'produced',
  title text,
  topic text,
  format text not null check (format in ('info','vlog','hybrid')) default 'info',
  sponsored boolean not null default false,    -- 협찬(직교: 정보형이면 학습)
  status text not null check (status in ('draft','in_production','published','archived')) default 'draft',
  youtube_video_id text unique,
  thumbnail_url text,
  upload_date date,
  -- A/B 결과(지연 회수). 단일 출처는 ab_variants/performance_metrics, 여기는 요약 캐시(코드리뷰 P2 — Phase에서 정리).
  ab_margin numeric,
  ab_decisiveness text check (ab_decisiveness in ('decisive','marginal','inconclusive')),
  ab_result_status text not null check (ab_result_status in ('pending','decided')) default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_contents_updated before update on public.contents
  for each row execute function public.set_updated_at();

create table public.production_runs (          -- 1편이 파이프라인 1회 도는 실행
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents(id) on delete cascade,
  -- §17: 상태 enum 강제(§8 전체 + 비용/중단 상태). 전이 제한은 20260618120007_state_transitions.sql.
  state text not null check (state in (
    'created',
    'topic_proposed','topic_selected',
    'titles_proposed','titles_selected',
    'structure_proposed','structure_selected',
    'researching','research_ready','research_review','research_approved',
    'scripting','script_ready','script_review',
    'approved','published',
    'paused_soft_cap','aborted'
  )) default 'created',
  as_of_date date not null default current_date,   -- 기준일(최신성)
  prompt_version text,
  model text,
  context_ref text,                                -- 재현성(전체저장 X, hash/ref)
  cost_usd numeric not null default 0,
  latency_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_runs_updated before update on public.production_runs
  for each row execute function public.set_updated_at();

-- ============================================================
-- 20260618120004_l1_sources.sql
-- ============================================================
-- 04 — L1 원본 기록층(불변) + 페치 소스. tech.md §3.2.
-- 불변성 트리거는 08(immutability)에서 일괄 부착. comments_raw 는 예외(P0·governance §3).

create table public.script_imports (          -- 구글독스 과거 스크립트(말투 코퍼스)
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('gdoc','manual')),
  external_ref text,                            -- gdoc id/url + 탭(편) 참조
  title text,
  body text not null,
  published_at date,
  created_at timestamptz not null default now()
);

create table public.transcripts (             -- 유튜브 자막
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text unique not null,
  lang text,
  full_text text not null,
  segments jsonb,
  source text check (source in ('subtitle','whisper')),
  fetched_at timestamptz not null default now()
);

-- ★ 프라이버시 삭제 예외 테이블(P0·governance §2·§3): author 컬럼 없음, external_id 는 HMAC 해시.
create table public.comments_raw (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text not null,
  external_id_hash text not null unique,        -- 유튜브 댓글ID의 HMAC(원본·작성자 미보관). dedup/삭제동기화 키라 NOT NULL(코드리뷰 P1)
  body text,
  like_count int,
  posted_at timestamptz,
  redacted_at timestamptz,                       -- 삭제요청/소스삭제 시 body=null + 스탬프
  fetched_at timestamptz not null default now()
);

create table public.topic_interviews (        -- "왜 이 주제를 골랐나" 주관식
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.contents(id) on delete cascade,
  question text,
  answer text not null,
  created_at timestamptz not null default now()
);

create table public.source_documents (        -- 페치 원문 스냅샷(불변, 링크로트 대비)
  id uuid primary key default gen_random_uuid(),
  -- 불변 테이블이라 on delete set null 금지(코드리뷰 P1: 불변 트리거와 충돌해 run 삭제 실패). NO ACTION.
  run_id uuid references public.production_runs(id),
  url text not null,
  content_type text,                            -- html|pdf|table|image|dynamic
  archived_copy text,
  publisher text,
  source_published_at timestamptz,
  fetched_at timestamptz not null default now()
);

create table public.source_parses (           -- 파싱 결과(가변·재파싱 가능). 스냅샷과 분리
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  parse_status text check (parse_status in ('ok','partial','failed','blocked')),
  parsed_text text,
  parser_version text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 20260618120005_l2_pipeline.sql
-- ============================================================
-- 05 — L2 의미 정리층(가변, lineage 핵심). tech.md §3.3.
-- §17: research_facts 에 verified 합격 CHECK(§5) 강제 — 코드 버그로 허위 verified 저장 차단.

create table public.stage_proposals (         -- 단계별 AI 후보 N + 이유 + 근거
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.production_runs(id) on delete cascade,
  stage text not null check (stage in ('topic','title_thumb','structure','research','script')),
  candidates jsonb not null,                    -- [{idx,payload,reason,evidence_ids[]}] (제안=임시, lineage 정규화는 채택 후)
  prompt_run_ref text,
  created_at timestamptz not null default now()
);

create table public.stage_selections (        -- 김짠부 선택 + 수정 + 채택률
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.stage_proposals(id) on delete cascade,
  chosen_idx int,
  edited_payload jsonb,
  edit_distance numeric,
  selection_reason text,                        -- 선택패턴 학습 입력
  selected_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.research_facts (          -- 검증된 사실 단위(무결성+최신성)
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.production_runs(id) on delete cascade,
  claim text not null,
  verification_status text not null check (verification_status in
    ('verified','conflicting','unverified','could_not_verify')),
  source_tier text check (source_tier in ('primary','press','secondary','blog','unknown')),
  primary_source_url text,
  source_document_id uuid references public.source_documents(id) on delete set null,
  independent_origin_count int not null default 0,
  quote_excerpt text,
  citation_verified boolean not null default false,
  is_financial boolean not null default false,
  misleading_check text,
  -- 최신성/금융 심화:
  as_of_date date,
  source_published_at timestamptz,
  data_reference_period text,
  effective_date date,
  applies_to text,
  grace_period text,
  bill_status text not null check (bill_status in ('draft','enacted','na')) default 'na',
  volatility text check (volatility in ('static','slow','fast')),
  freshness text check (freshness in ('fresh','aging','stale','unknown')),
  recheck_after timestamptz,
  escalated_to_human boolean not null default false,
  human_approved boolean,
  created_at timestamptz not null default now(),
  -- ★ §17: verified 합격 정의(§5)를 DB가 강제. verified면 독립출처≥2 + 인용실재 + (금융→1차출처).
  -- NULL-safe(코드리뷰 P1): source_tier=NULL이 UNKNOWN으로 새지 않도록 coalesce.
  constraint research_facts_verified_rule check (
    verification_status <> 'verified'
    or (
      independent_origin_count >= 2
      and citation_verified = true
      and quote_excerpt is not null
      and (is_financial = false or coalesce(source_tier, '') = 'primary')
    )
  )
);

create table public.explanation_assets (      -- 개념별 숫자예시·비유(쉬운 설명)
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.production_runs(id) on delete cascade,
  concept text not null,
  kind text not null check (kind in ('number','analogy')),
  numeric_example text,
  analogy text,
  created_by text,                              -- role_id: numbers|analogist
  source_fact_id uuid references public.research_facts(id) on delete set null,
  math_verified boolean,
  distortion_checked boolean,
  used_in_script boolean not null default false,
  landed_score numeric,
  created_at timestamptz not null default now()
);

create table public.script_segments (         -- ★ lineage 핵심: 대본 문장 → 근거 역추적
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents(id) on delete cascade,
  run_id uuid not null references public.production_runs(id) on delete cascade,
  ord int not null,
  text text not null,
  prompt_run_ref text,
  created_at timestamptz not null default now()
);

create table public.script_segment_facts (    -- lineage 정규화: 문장 ↔ 근거 fact
  segment_id uuid not null references public.script_segments(id) on delete cascade,
  fact_id uuid not null references public.research_facts(id) on delete cascade,
  primary key (segment_id, fact_id)
);

create table public.script_segment_explanation_assets ( -- 문장 ↔ 사용한 숫자/비유
  segment_id uuid not null references public.script_segments(id) on delete cascade,
  asset_id uuid not null references public.explanation_assets(id) on delete cascade,
  primary key (segment_id, asset_id)
);

create table public.topic_candidates (        -- 촉이 발굴 풀
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('comment','trend','competitor','community','econ_calendar')),
  title text,
  rationale text,
  signal_score numeric,
  evidence jsonb,
  status text not null check (status in ('new','shortlisted','used','dropped')) default 'new',
  content_id uuid references public.contents(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents(id) on delete cascade,
  -- 'window'은 Postgres 예약어(윈도우 함수)라 metric_window 로 명명.
  metric_window text not null check (metric_window in ('d1','d7','d14','d30')),
  views int,
  ctr numeric,
  avg_view_pct numeric,
  traffic_source jsonb,
  ab_variant text not null default 'overall',
  recorded_at timestamptz not null default now(),
  unique (content_id, metric_window, ab_variant)
);

create table public.cost_ledger (             -- 편당 실비(LLM+검색+임베딩+DB+사람검수…)
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.production_runs(id) on delete cascade,
  category text not null check (category in ('llm','search','embedding','storage','infra','human_review')),
  detail text,
  cost_usd numeric not null,
  tokens int,
  latency_ms int,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 20260618120006_l3_knowledge_corpus.sql
-- ============================================================
-- 06 — L3 학습 지식층 + 학습 코퍼스(구글독스). tech.md §3.4·§3.5.
-- §17: corpus_editions.include_in_training NULL 버그 수정 — 입력 3컬럼 NOT NULL + coalesce 방어.

create table public.tone_profile (            -- 짠펜 말투(§12)
  id uuid primary key default gen_random_uuid(),
  version int not null,
  components jsonb not null,                    -- {vocab,sentence_len,rhythm,hooks,phrases,banned,persona,easy_tone}
  source_ref text,
  status text not null check (status in ('draft','active','retired')) default 'draft',
  created_at timestamptz not null default now()
);

create table public.insights (                -- 운영 원칙(lean)
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in
    ('topic','thumbnail','title','structure','tone','research','cta','analogy')),
  title text,
  body text,
  confidence numeric,
  valid_until date,
  status text not null check (status in ('draft','reviewed','approved','deprecated')) default 'draft',
  source_type text check (source_type in ('ai_suggested','human_authored','retrospective')),
  created_at timestamptz not null default now()
);

create table public.retrospectives (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.contents(id) on delete cascade,
  scope text check (scope in ('content','campaign')),
  good_points text,
  improvements text,
  lessons text,
  created_at timestamptz not null default now()
);

create table public.corpus_editions (         -- 롤링 구글독스에서 쪼갠 '편' 1개(1탭=1편)
  id uuid primary key default gen_random_uuid(),
  -- 불변 테이블이라 on delete set null 금지(코드리뷰 P1: 불변 트리거와 충돌). NO ACTION.
  content_id uuid references public.contents(id),
  source_ref text,                              -- gdoc id + 탭(편) 참조
  edition_date date,
  topic text,
  -- §17: NOT NULL + default 로 generated column NULL 버그 차단.
  format text not null check (format in ('info','vlog','hybrid')) default 'info',
  is_long_form boolean not null default true,
  sponsored boolean not null default false,
  status text not null check (status in ('done','todo','drafting')) default 'drafting',
  -- 학습 게이트: coalesce 로 방어(세 컬럼 NOT NULL이라 사실상 항상 결정적).
  include_in_training boolean generated always as (
    coalesce(format, 'x') = 'info'
    and coalesce(is_long_form, false)
    and coalesce(status, 'x') = 'done'
  ) stored,
  created_at timestamptz not null default now()
);

create table public.corpus_components (       -- 한 편 → 컴포넌트별 분리 학습
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.corpus_editions(id) on delete cascade,
  type text not null check (type in ('title','thumbnail_copy','description','script')),
  variant_idx int,                              -- [1안][2안][3안] (없으면 null)
  content text not null,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ab_variants (             -- 썸네일/제목 A·B·C 성과(업로드 ~d7 후 회수)
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents(id) on delete cascade,
  component_type text not null check (component_type in ('title','thumbnail')),
  variant text not null check (variant in ('A','B','C')),
  payload jsonb,
  ctr_pct numeric,
  impressions int,
  weight numeric,
  rank int,
  is_winner boolean not null default false,
  created_at timestamptz not null default now(),
  unique (content_id, component_type, variant)
);

create table public.style_profiles (          -- 컴포넌트별 스타일(제목/썸네일/더보기)
  id uuid primary key default gen_random_uuid(),
  component_type text not null check (component_type in ('title','thumbnail_copy','description')),
  version int,
  patterns jsonb,
  status text not null check (status in ('draft','active','retired')) default 'draft',
  created_at timestamptz not null default now()
);

create table public.profile_training_sources ( -- ★ provenance: 어떤 데이터가 이 프로파일을 학습시켰나
  id uuid primary key default gen_random_uuid(),
  profile_type text not null check (profile_type in ('tone','title','thumbnail_copy','description')),
  -- polymorphic ref(코드리뷰 P1) → tone/style 분리 FK로 무결성 보장. 정확히 하나만 채운다.
  tone_profile_id uuid references public.tone_profile(id) on delete cascade,
  style_profile_id uuid references public.style_profiles(id) on delete cascade,
  edition_id uuid references public.corpus_editions(id) on delete set null,
  component_id uuid references public.corpus_components(id) on delete set null,
  ab_variant_id uuid references public.ab_variants(id) on delete set null,
  metric_id uuid references public.performance_metrics(id) on delete set null,
  weight numeric,
  created_at timestamptz not null default now(),
  -- profile_type ↔ FK 일치 강제(코드리뷰 P1): tone은 tone_profile_id만, 나머지는 style_profile_id만.
  constraint pts_profile_match check (
    (profile_type = 'tone' and tone_profile_id is not null and style_profile_id is null)
    or (profile_type in ('title','thumbnail_copy','description') and style_profile_id is not null and tone_profile_id is null)
  ),
  -- 최소 1개 출처(provenance) 보유 — 학습 근거 없는 행 금지.
  constraint pts_has_source check (
    num_nonnulls(edition_id, component_id, ab_variant_id, metric_id) >= 1
  )
);

-- ============================================================
-- 20260618120007_indexes.sql
-- ============================================================
-- 07 — hot FK 인덱스(§17). Postgres는 FK에 자동 인덱스를 만들지 않는다 → 조인·삭제 성능.

create index idx_production_runs_content on public.production_runs(content_id);
create index idx_topic_interviews_content on public.topic_interviews(content_id);
create index idx_source_documents_run on public.source_documents(run_id);
create index idx_source_parses_doc on public.source_parses(source_document_id);

create index idx_stage_proposals_run on public.stage_proposals(run_id);
create index idx_stage_selections_proposal on public.stage_selections(proposal_id);
create index idx_research_facts_run on public.research_facts(run_id);
create index idx_research_facts_source_doc on public.research_facts(source_document_id);
create index idx_explanation_assets_run on public.explanation_assets(run_id);
create index idx_explanation_assets_fact on public.explanation_assets(source_fact_id);
create index idx_script_segments_run on public.script_segments(run_id);
create index idx_script_segments_content on public.script_segments(content_id);
create index idx_seg_facts_fact on public.script_segment_facts(fact_id);
create index idx_seg_assets_asset on public.script_segment_explanation_assets(asset_id);
create index idx_topic_candidates_content on public.topic_candidates(content_id);
create index idx_performance_metrics_content on public.performance_metrics(content_id);
create index idx_cost_ledger_run on public.cost_ledger(run_id, created_at);

create index idx_corpus_components_edition on public.corpus_components(edition_id);
create index idx_corpus_editions_content on public.corpus_editions(content_id);
create index idx_ab_variants_content on public.ab_variants(content_id);
create index idx_pts_tone on public.profile_training_sources(tone_profile_id);
create index idx_pts_style on public.profile_training_sources(style_profile_id);
create index idx_config_registry_key on public.config_registry(key, effective_from);

-- 학습 대상 빠른 필터(생성 컬럼).
create index idx_corpus_editions_training on public.corpus_editions(include_in_training) where include_in_training;

-- ============================================================
-- 20260618120008_state_transitions.sql
-- ============================================================
-- 08 — production_runs 상태 전이 가드(§17). src/domain/enums.ts ALLOWED_TRANSITIONS 와 동기화.
-- 전이표 + 트리거로 불법 전이(예: created→published)를 DB에서 차단.

create table public.run_state_transitions (
  from_state text not null,
  to_state text not null,
  primary key (from_state, to_state)
);

insert into public.run_state_transitions (from_state, to_state) values
  ('created','topic_proposed'),('created','aborted'),
  ('topic_proposed','topic_selected'),('topic_proposed','aborted'),
  ('topic_selected','titles_proposed'),('topic_selected','aborted'),
  ('titles_proposed','titles_selected'),('titles_proposed','aborted'),
  ('titles_selected','structure_proposed'),('titles_selected','aborted'),
  ('structure_proposed','structure_selected'),('structure_proposed','aborted'),
  ('structure_selected','researching'),('structure_selected','aborted'),
  ('researching','research_ready'),('researching','paused_soft_cap'),('researching','aborted'),
  ('research_ready','research_review'),('research_ready','aborted'),
  ('research_review','research_approved'),('research_review','researching'),('research_review','aborted'),
  ('research_approved','scripting'),('research_approved','aborted'),
  ('scripting','script_ready'),('scripting','researching'),('scripting','paused_soft_cap'),('scripting','aborted'),
  ('script_ready','script_review'),('script_ready','aborted'),
  ('script_review','approved'),('script_review','scripting'),('script_review','aborted'),
  ('approved','published'),('approved','aborted'),
  ('paused_soft_cap','researching'),('paused_soft_cap','scripting'),('paused_soft_cap','aborted');

create or replace function public.enforce_run_transition()
returns trigger language plpgsql as $$
begin
  -- INSERT는 반드시 'created'에서 시작(코드리뷰 P1: published 등으로 바로 생성 차단).
  if tg_op = 'INSERT' then
    if new.state <> 'created' then
      raise exception 'production_runs는 state=created로만 생성된다(시작값: %).', new.state;
    end if;
    return new;
  end if;
  -- UPDATE: 허용된 전이만.
  if new.state is distinct from old.state then
    if not exists (
      select 1 from public.run_state_transitions
      where from_state = old.state and to_state = new.state
    ) then
      raise exception '불법 상태 전이: % → %', old.state, new.state;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_run_transition before insert or update on public.production_runs
  for each row execute function public.enforce_run_transition();

-- ============================================================
-- 20260618120009_immutability.sql
-- ============================================================
-- 09 — L1 불변성 트리거(§3.0·§17). UPDATE/DELETE 차단.
-- ★ comments_raw 는 부착하지 않는다 — 프라이버시 삭제 예외(P0·governance §3).

create trigger trg_immutable_script_imports
  before update or delete on public.script_imports
  for each row execute function public.forbid_mutation();

create trigger trg_immutable_transcripts
  before update or delete on public.transcripts
  for each row execute function public.forbid_mutation();

create trigger trg_immutable_source_documents
  before update or delete on public.source_documents
  for each row execute function public.forbid_mutation();

create trigger trg_immutable_corpus_editions
  before update or delete on public.corpus_editions
  for each row execute function public.forbid_mutation();

create trigger trg_immutable_corpus_components
  before update or delete on public.corpus_components
  for each row execute function public.forbid_mutation();

-- comments_raw: 의도적으로 불변 트리거 없음. 삭제/레닥션은 RLS(service-role)로 통제(다음 파일).

-- ============================================================
-- 20260618120010_rls.sql
-- ============================================================
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

-- ============================================================
-- 20260618120011_seed_config.sql
-- ============================================================
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

commit;
