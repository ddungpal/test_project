-- 27 — 리서치 선택 게이트. 셜록 scope 완료 후 사용자 선택 대기 상태 research_scoped 추가.
-- 단계 경계 변경: structure_selected → researching (직행) → structure_selected → research_scoped → researching.
-- src/domain/enums.ts ALLOWED_TRANSITIONS 와 동기화. additive·멱등(기존 상태·전이 전부 보존). up only.
--
-- ⚠ stage CHECK 무변경: stage='research'는 migration 05/23에서 이미 허용됨, stage_selections엔 stage 컬럼 없음
--    (proposal_id로 참조) → 본 마이그레이션은 production_runs.state·전이표만 변경(불필요한 drop/add 안 함).

begin;

-- ── production_runs.state CHECK 재정의 ──────────────────────────────────────
-- 기존 전체 상태 목록(22) 그대로 + structure_selected 다음 줄에 research_scoped만 끼워 add.
alter table public.production_runs drop constraint production_runs_state_check;
alter table public.production_runs add constraint production_runs_state_check check (state in (
  'created',
  'topic_proposed','topic_selected',
  'titles_proposed','titles_selected',
  'thumbnails_proposed','thumbnails_selected',
  'structure_proposed','structure_selected',
  'research_scoped',  -- 신규(리서치 선택 게이트: 셜록 scope 후 사용자 선택 대기)
  'researching','research_ready','research_review','research_approved',
  'scripting','script_ready','script_review',
  'approved','published',
  'paused_soft_cap','aborted'
));

-- ── run_state_transitions 갱신 ─────────────────────────────────────────────
-- 기존 전이 제거: 구성 확정 후 바로 리서치로 가던 직행을 막는다(이제 scope 게이트 경유).
delete from public.run_state_transitions
  where from_state = 'structure_selected' and to_state = 'researching';

-- 신규 전이: 구성 → scope 게이트 → 리서치. (researching으로 들어오는 다른 from 전이는 그대로 둠.)
insert into public.run_state_transitions (from_state, to_state) values
  ('structure_selected','research_scoped'),
  ('research_scoped','researching'),
  ('research_scoped','aborted');

commit;
