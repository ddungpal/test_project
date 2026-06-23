-- 08 — production_runs 상태 전이 가드(§17). src/domain/enums.ts ALLOWED_TRANSITIONS 와 동기화.
-- 전이표 + 트리거로 불법 전이(예: created→published)를 DB에서 차단.

create table public.run_state_transitions (
  from_state text not null,
  to_state text not null,
  primary key (from_state, to_state)
);

insert into public.run_state_transitions (from_state, to_state) values
  ('created','topic_proposed'),('created','aborted'),
  ('topic_proposed','topic_selected'),('topic_proposed','aborted'),
  ('topic_selected','titles_proposed'),('topic_selected','aborted'),
  ('titles_proposed','titles_selected'),('titles_proposed','aborted'),
  ('titles_selected','structure_proposed'),('titles_selected','aborted'),
  ('structure_proposed','structure_selected'),('structure_proposed','aborted'),
  ('structure_selected','researching'),('structure_selected','aborted'),
  ('researching','research_ready'),('researching','paused_soft_cap'),('researching','aborted'),
  ('research_ready','research_review'),('research_ready','aborted'),
  ('research_review','research_approved'),('research_review','researching'),('research_review','aborted'),
  ('research_approved','scripting'),('research_approved','aborted'),
  ('scripting','script_ready'),('scripting','researching'),('scripting','paused_soft_cap'),('scripting','aborted'),
  ('script_ready','script_review'),('script_ready','aborted'),
  ('script_review','approved'),('script_review','scripting'),('script_review','aborted'),
  ('approved','published'),('approved','aborted'),
  ('paused_soft_cap','researching'),('paused_soft_cap','scripting'),('paused_soft_cap','aborted');

create or replace function public.enforce_run_transition()
returns trigger language plpgsql as $$
begin
  -- INSERT는 반드시 'created'에서 시작(코드리뷰 P1: published 등으로 바로 생성 차단).
  if tg_op = 'INSERT' then
    if new.state <> 'created' then
      raise exception 'production_runs는 state=created로만 생성된다(시작값: %).', new.state;
    end if;
    return new;
  end if;
  -- UPDATE: 허용된 전이만.
  if new.state is distinct from old.state then
    if not exists (
      select 1 from public.run_state_transitions
      where from_state = old.state and to_state = new.state
    ) then
      raise exception '불법 상태 전이: % → %', old.state, new.state;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_run_transition before insert or update on public.production_runs
  for each row execute function public.enforce_run_transition();
