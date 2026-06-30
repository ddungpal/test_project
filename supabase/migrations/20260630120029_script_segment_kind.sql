-- 29 — script_segments 형식 블록 레일(P1 script-format-model 토대). 짠펜 세그먼트가
-- prose 외에 표(table)·케이스분기(case)·시각큐(visual)를 담을 수 있도록 kind/payload를 additive로 추가한다.
-- src/pipeline/segmentBlock.ts(normalizeSegmentPayload)가 적재 전 정규화한다. additive·멱등·up only.
--
-- ⚠ 기존 행 하위호환: kind default 'prose' + payload null → 기존 데이터 무손상.
-- ⚠ 기존 컬럼 drop/alter 금지. add column if not exists 로 멱등 보장(재실행 안전).
-- ⚠ scribe SCRIBE_SCHEMA 무변경 — 짠펜은 이번 phase에서 여전히 prose만 emit(레일만 깐다, P2에서 실제 emit).

begin;

-- ── script_segments 형식 블록 컬럼 추가(additive·멱등) ──────────────────────
--   kind    : 세그먼트 형식. 기본 'prose'. 표/케이스/시각큐 허용(check 제약).
--   payload : 블록 데이터(jsonb, nullable — prose는 payload 불필요).
alter table public.script_segments
  add column if not exists kind text not null default 'prose';

alter table public.script_segments
  add column if not exists payload jsonb;

-- kind 허용값 제약(멱등: 이미 있으면 add 안 함).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'script_segments_kind_check'
      and conrelid = 'public.script_segments'::regclass
  ) then
    alter table public.script_segments
      add constraint script_segments_kind_check
      check (kind in ('prose','table','case','visual'));
  end if;
end $$;

commit;
