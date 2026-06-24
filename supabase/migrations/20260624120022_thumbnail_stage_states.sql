-- 22 — 썸네일 단계 분리. 제목(title_thumb=역사적 이름, 현재 제목 전용) → 썸네일(thumbnail) 분리.
-- src/domain/enums.ts ALLOWED_TRANSITIONS 와 동기화. up only(되돌릴 일 없음 — 상태값 추가만).
-- 새 상태: thumbnails_proposed, thumbnails_selected. 단계 경계: titles_selected → 썸네일 → structure.

-- ── production_runs.state CHECK 재정의 ──────────────────────────────────────
-- 003(20260618120003)의 inline check는 익명 제약 → Postgres 기본명 'production_runs_state_check' 가정.
-- 다르면 `\d public.production_runs` 로 실제 제약명 확인 후 교체.
alter table public.production_runs drop constraint production_runs_state_check;
alter table public.production_runs add constraint production_runs_state_check check (state in (
  'created',
  'topic_proposed','topic_selected',
  'titles_proposed','titles_selected',
  'thumbnails_proposed','thumbnails_selected',  -- 신규(썸네일 단계)
  'structure_proposed','structure_selected',
  'researching','research_ready','research_review','research_approved',
  'scripting','script_ready','script_review',
  'approved','published',
  'paused_soft_cap','aborted'
));

-- ── run_state_transitions 갱신(008과 동기화) ───────────────────────────────
-- 기존 전이 제거: 제목 확정 후 바로 구성으로 가던 경로를 막는다(이제 썸네일 단계 경유).
delete from public.run_state_transitions
  where from_state = 'titles_selected' and to_state = 'structure_proposed';

-- 신규 전이: 제목 → 썸네일 → 구성.
insert into public.run_state_transitions (from_state, to_state) values
  ('titles_selected','thumbnails_proposed'),
  ('thumbnails_proposed','thumbnails_selected'),
  ('thumbnails_proposed','aborted'),
  ('thumbnails_selected','structure_proposed'),
  ('thumbnails_selected','aborted');
