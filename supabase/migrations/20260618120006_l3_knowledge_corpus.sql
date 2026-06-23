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
