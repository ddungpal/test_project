-- 13 — soft-cap 재개 단계 보존. 코드리뷰 P1(병렬리뷰): paused_soft_cap에서 멈춘 단계가
--   상태에 보존되지 않아, 재개 시 클라이언트가 research/script를 임의 선택 → 잘못된 단계 이벤트 발행 위험.
--   pause 시점에 단계를 기록하고, 재개는 이 값을 신뢰(클라 입력 무시). 셋 다 nullable(평시 null).
--   ⚠️ 운영(api) 전환 전 SQL 에디터로 수동 적용(migration 12와 동일 방식). 개발($0)은 캡 미발동이라 비차단.
alter table public.production_runs
  add column if not exists paused_stage text
    check (paused_stage in ('research', 'script'));
