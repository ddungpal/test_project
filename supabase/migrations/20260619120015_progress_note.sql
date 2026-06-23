-- 15 — 단계 내부 서브진행 표시. 긴 단계(촉이 외부검색·셜록 셀·짠펜 대본)가 "작업 중"으로만 보이는
--   문제 해결: 백엔드가 현재 서브단계를 'i/n·라벨' 형식으로 기록 → 프론트(자동갱신)가 읽어 진행바 렌더.
--   nullable·휘발(단계 완료 시 null). best-effort 기록이라 컬럼 없어도 앱은 안 깨짐.
--   ⚠️ 운영/적용 전 SQL 에디터로 수동 적용(migration 12·13·14와 동일).
alter table public.production_runs
  add column if not exists progress_note text;
