-- 09 — L1 불변성 트리거(§3.0·§17). UPDATE/DELETE 차단.
-- ★ comments_raw 는 부착하지 않는다 — 프라이버시 삭제 예외(P0·governance §3).

create trigger trg_immutable_script_imports
  before update or delete on public.script_imports
  for each row execute function public.forbid_mutation();

create trigger trg_immutable_transcripts
  before update or delete on public.transcripts
  for each row execute function public.forbid_mutation();

create trigger trg_immutable_source_documents
  before update or delete on public.source_documents
  for each row execute function public.forbid_mutation();

create trigger trg_immutable_corpus_editions
  before update or delete on public.corpus_editions
  for each row execute function public.forbid_mutation();

create trigger trg_immutable_corpus_components
  before update or delete on public.corpus_components
  for each row execute function public.forbid_mutation();

-- comments_raw: 의도적으로 불변 트리거 없음. 삭제/레닥션은 RLS(service-role)로 통제(다음 파일).
