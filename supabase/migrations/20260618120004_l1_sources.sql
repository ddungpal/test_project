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
