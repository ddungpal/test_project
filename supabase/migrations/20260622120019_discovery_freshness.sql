-- 19 — 발굴 신선도(B): topic_candidates 멱등 upsert + 최근성 추적
-- 매일 발굴 Cron이 외부 트렌드·경쟁·댓글 신호를 topic_candidates 에 반복 적재한다.
-- 기존 스키마엔 dedup 키가 없어 매 실행이 중복 행을 양산 → unique 키 + last_seen_at 추가.
-- ⚠️ 초안: SQL 에디터 수동 적용(프로젝트 관례). 동반 코드 = database.types.ts 갱신(파일 하단 메모).

begin;

-- ── dedup_key: 같은 신호의 재발견을 한 행으로 합치는 멱등 키 ──
-- 형식 예: "trend:https://...", "competitor:https://youtu.be/...", "comment:<정규화 용어>".
-- nullable(과거 행·수동 입력 후보엔 키 없음) → partial unique 로 NULL 다중 허용.
alter table public.topic_candidates
  add column if not exists dedup_key    text,
  add column if not exists last_seen_at timestamptz not null default now();

-- 멱등 upsert(ON CONFLICT (dedup_key))의 충돌 타깃.
-- Postgres 표준: unique 인덱스는 NULL 을 서로 distinct 로 취급 → 과거/수동 후보(dedup_key NULL) 다중 허용.
--   (partial index `where dedup_key is not null` 는 supabase onConflict 추론과 안 맞아 일반 unique 채택.)
create unique index if not exists uq_topic_candidates_dedup
  on public.topic_candidates (dedup_key);

-- 신선도 정렬(최근 본 후보 우선) — 촉이 prep·대시보드 조회용.
create index if not exists idx_topic_candidates_last_seen
  on public.topic_candidates (last_seen_at desc);

commit;

-- ── 동반 코드 변경(마이그레이션 외부) ──
-- 1. src/lib/supabase/database.types.ts: TopicCandidates 타입에 dedup_key/last_seen_at 추가.
-- 2. 발굴 Cron(src/inngest/functions/discoveryCron.ts + src/agents/topic_scout/discovery.ts):
--    upsert({...}, { onConflict: 'dedup_key' }) — status 미포함(승격/반려 상태 보존), last_seen_at·signal_score 갱신.
