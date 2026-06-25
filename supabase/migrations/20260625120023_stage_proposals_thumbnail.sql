-- 23 — stage_proposals.stage CHECK에 'thumbnail' 추가.
-- 단계분리(22)가 production_runs.state만 갱신하고 이 제약을 빠뜨려, 썸네일 제안 insert가 거부됐다.
alter table public.stage_proposals drop constraint stage_proposals_stage_check;
alter table public.stage_proposals add constraint stage_proposals_stage_check
  check (stage in ('topic','title_thumb','thumbnail','structure','research','script'));
