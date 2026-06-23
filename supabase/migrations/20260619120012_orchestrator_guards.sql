-- 12 — 반장 마감: rework 카운터 + 중단 사유. tech.md §8(가드 P2).
--   max_rework=2(config_registry pipeline.max_rework)를 durable하게 강제하기 위한 카운터.
--   abort_reason: kill switch/HARD캡/rework초과 등 중단 사유 기록(감사·대시보드).
alter table public.production_runs
  add column if not exists rework_count int not null default 0,
  add column if not exists abort_reason text;
