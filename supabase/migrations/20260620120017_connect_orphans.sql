-- 17 — 고립 테이블 정리(ERD 개선 사이클 ②해결)
-- FK 그래프 고립 5개 중 4개 연결, 1개(run_state_transitions=룩업)는 의도된 단독으로 유지.
-- ⚠️ 초안: 적용 전 검토. database.types.ts 재생성 + ingest-youtube.ts content_id 세팅 코드 동반 필요(파일 하단 메모).

begin;

-- ── (1) script_imports 드롭 — 죽은/중복 테이블 ──
-- 코드 0회 사용(타입 정의·ERD 노드만), 링크키 0(external_ref 텍스트뿐).
-- 과거 대본 학습은 corpus_editions(content_id FK 보유)가 담당 → 제거. 불변 트리거도 함께 사라짐.
drop table if exists public.script_imports;

-- ── (2) insights — 학습루프 종착점에 provenance FK 부여 ──
-- "회고 성과연결 → 인사이트 승격"의 역추적 경로. 둘 다 nullable(human_authored는 출처 없음).
alter table public.insights
  add column source_retrospective_id uuid references public.retrospectives(id) on delete set null,
  add column source_content_id       uuid references public.contents(id)       on delete set null;
create index idx_insights_src_retro   on public.insights (source_retrospective_id);
create index idx_insights_src_content on public.insights (source_content_id);

-- ── (3) transcripts — youtube_video_id(text) 느슨연결 → content_id FK 승격 ──
-- L1 불변 테이블이라 on delete cascade/set null 은 불변 트리거와 충돌 → restrict 채택
-- (raw L1 보존 위해 transcript 가진 content 는 하드삭제 불가가 올바름).
alter table public.transcripts
  add column content_id uuid references public.contents(id) on delete restrict;
-- 백필: 불변 트리거 일시 해제 → youtube_video_id 매칭 → 재부착.
alter table public.transcripts disable trigger trg_immutable_transcripts;
update public.transcripts t
   set content_id = c.id
  from public.contents c
 where c.youtube_video_id = t.youtube_video_id
   and t.content_id is null;
alter table public.transcripts enable trigger trg_immutable_transcripts;
create index idx_transcripts_content on public.transcripts (content_id);

-- ── (4) comments_raw — youtube_video_id(text) → content_id FK 승격(거버넌스 귀속) ──
-- 불변 트리거 없음(프라이버시 삭제 예외) → 직접 백필.
-- on delete set null: 편 삭제돼도 범채널 댓글 신호 풀(촉이 전역 읽기)은 보존.
alter table public.comments_raw
  add column content_id uuid references public.contents(id) on delete set null;
update public.comments_raw cr
   set content_id = c.id
  from public.contents c
 where c.youtube_video_id = cr.youtube_video_id
   and cr.content_id is null;
create index idx_comments_content on public.comments_raw (content_id);

commit;

-- ── 동반 코드 변경(마이그레이션 외부) ──
-- 1. src/lib/supabase/database.types.ts 재생성: script_imports 타입 제거 + 3테이블 content_id 컬럼 반영.
-- 2. scripts/ingest-youtube.ts: transcripts/comments_raw INSERT 시 content_id 채우기
--    (youtube_video_id → contents.id 조회 후 함께 insert). 신규 행이 다시 고립되지 않도록.
-- 3. scripts/generate-erd.mjs: script_imports 노드 삭제 + 3 FK 엣지 추가 → ERD 재생성(③결과 확인).
