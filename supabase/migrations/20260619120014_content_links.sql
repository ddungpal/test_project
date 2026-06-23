-- 14 — 콘텐츠 연결(시리즈/참조). 씨앗 모드: 새 편(produced)이 기존편(주로 imported)을
--   'reference'(참고) 또는 'series_followup'(이어보기/후속)으로 링크 + 연결 의도 기록.
--   나중에 시리즈 학습 쿼리("이 시리즈 편들")의 토대. 배열 금지·FK조인 원칙.
--   ⚠️ 운영 전 SQL 에디터로 수동 적용(migration 12·13과 동일 방식).
create table if not exists public.content_links (
  id uuid primary key default gen_random_uuid(),
  from_content_id uuid not null references public.contents(id) on delete cascade,   -- 새 편
  to_content_id   uuid not null references public.contents(id) on delete restrict,  -- 참조 대상(기존편)
  relation text not null check (relation in ('reference', 'series_followup')),
  intent text,                                   -- 사용자가 쓴 연결 의도(어떻게 이을지)
  created_at timestamptz not null default now(),
  check (from_content_id <> to_content_id),
  unique (from_content_id, to_content_id, relation)
);
create index if not exists idx_content_links_from on public.content_links(from_content_id);
create index if not exists idx_content_links_to   on public.content_links(to_content_id);

-- 다른 테이블과 동일하게 RLS 활성(서버 service_role은 우회). 대시보드 읽기는 현재 admin 경로.
alter table public.content_links enable row level security;
