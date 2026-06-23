-- 16 — 제안에 사용한 '검색 출처' 저장. 촉이가 외부검색(웹·YouTube)으로 모은 출처 링크를
--   stage_proposals에 남겨, 대시보드에서 토글로 열어 원문을 확인할 수 있게 한다(출처명시·검증 원칙).
--   jsonb 배열: [{ id, source, title, url, publisher }]. nullable·best-effort.
--   ⚠️ 운영/적용 전 SQL 에디터로 수동 적용(migration 12~15와 동일).
alter table public.stage_proposals
  add column if not exists sources jsonb;
