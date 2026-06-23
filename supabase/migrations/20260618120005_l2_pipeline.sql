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
