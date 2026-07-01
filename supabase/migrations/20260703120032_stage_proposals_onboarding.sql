-- 32 — stage_proposals.stage CHECK에 'onboarding' 추가.
-- 쏙이(온보더) 궁금증 아크를 stage_proposals에 재사용 저장(새 테이블 없음·마이그 1개 불가피).
-- 온보딩은 Stage enum(선형 파이프라인)에 넣지 않는다 — off-chain 이벤트+함수일 뿐(PIPELINE/STANDALONE 불변).
alter table public.stage_proposals drop constraint stage_proposals_stage_check;
alter table public.stage_proposals add constraint stage_proposals_stage_check
  check (stage in ('topic','title_thumb','thumbnail','structure','research','script','onboarding'));
