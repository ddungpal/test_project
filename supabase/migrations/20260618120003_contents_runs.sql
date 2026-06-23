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
