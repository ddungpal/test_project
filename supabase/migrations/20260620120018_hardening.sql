-- 18 — ERD 하드닝(migration 17 후속 + GPT-5.5 codex 교차검토 P1~P2)
-- 17이 추가한 FK를 'DB에서 강제'되게 + 독립 발견 무결성 가드들.
-- ⚠️ 적용 전 SQL 에디터 수동(12~17과 동일). 사전점검 통과(2026-06-20):
--   script_segments 0행 · tone_profile active 1 · style_profiles active 0 · transcripts/insights content_id null 0 · insights 0행.

begin;

-- ── A1+A2: transcripts/comments_raw content_id 강제 + youtube_video_id 일치 보장 ──
-- content_id를 youtube_video_id에서 파생하는 트리거 → 자동연결(누락 방지) + 불일치 차단(A2).
-- (앱/ingest가 content_id를 직접 넣어도 트리거가 덮어써 항상 youtube_video_id와 정합.)
create or replace function public.link_content_by_video_id()
returns trigger language plpgsql as $$
begin
  new.content_id := (select id from public.contents where youtube_video_id = new.youtube_video_id);
  return new;
end;
$$;

-- transcripts: before insert(불변 트리거는 update/delete만 → 이벤트 분리, 충돌 없음).
create trigger trg_link_content_transcripts
  before insert on public.transcripts
  for each row execute function public.link_content_by_video_id();
-- 매칭 content 없으면 트리거가 null 세팅 → NOT NULL이 거부(척추 없는 자막 저장 금지).
alter table public.transcripts alter column content_id set not null;

-- comments_raw: before insert 파생. content_id는 nullable 유지(on delete set null=댓글 풀 보존 의도).
create trigger trg_link_content_comments
  before insert on public.comments_raw
  for each row execute function public.link_content_by_video_id();

-- ── A3: insights provenance 정합 — retrospective FK ⇔ source_type='retrospective' ──
-- retrospective 타입인데 FK 누락, 또는 비-retrospective인데 retro FK 보유를 둘 다 차단.
alter table public.insights add constraint insights_retro_consistent check (
  (source_retrospective_id is null) = (source_type is distinct from 'retrospective')
);

-- ── B1: content_links RLS 정책(migration 14가 enable만, 정책 0 → 진짜 인증 시 전면 차단) ──
-- contents 패턴과 동일: 읽기 viewer+, 쓰기 editor+. (현재는 service-role 우회로 미발현, Phase 5 대비.)
create policy content_links_select on public.content_links for select to authenticated
  using (public.app_role() is not null);
create policy content_links_write on public.content_links for all to authenticated
  using (public.app_role() in ('owner','editor')) with check (public.app_role() in ('owner','editor'));

-- ── B2: script_segments.ord 순서 무결성(중복/음수 차단) ──
alter table public.script_segments add constraint script_segments_ord_nonneg check (ord >= 0);
create unique index uniq_script_segments_run_ord on public.script_segments (run_id, ord);

-- ── B3: active 프로파일 단일성(현재 프로필 조회 모호성 제거) ──
create unique index uniq_tone_profile_active   on public.tone_profile  (status)         where status = 'active';
create unique index uniq_style_profiles_active on public.style_profiles (component_type) where status = 'active';

commit;

-- 동반 코드: database.types.ts transcripts.content_id 를 NOT NULL(string)로 반영.
-- 보류(이번 제외): B4 lineage 복합FK(무거움) · B5 pts on delete restrict · B6 수치 도메인 CHECK · 후보A(Phase4) · 후보B(의도).
