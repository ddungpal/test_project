-- 24 — thumbnail_corrections: 교정쌍(생성↔이상 카피) 저장. 교정 학습 모듈 step0.
--   김짠부가 입력한 '이상 카피'(ideal_payload)와 AI '생성 카피'(gen_payload)를 한 행에 묶어 보관.
--   diff(step1)·learned_at(step2 멱등 스탬프)는 후속 step에서 채운다(여기선 항상 null insert).
--   ★ FK 없음 — contents/ab_variants 를 참조하지 않는 독립 테이블.
--     교정쌍은 특정 영상에 묶이지 않는 카피 텍스트 학습 데이터라, 참조편 삭제 캐스케이드 함정을 의도적으로 회피.
--   쓰기 = service-role(앱 액션, RLS 우회). 읽기 = owner만(학습 데이터 — audit_log 패턴 미러).

create table public.thumbnail_corrections (
  id             uuid primary key default gen_random_uuid(),
  component_type text not null check (component_type in ('thumbnail','title')),
  topic          text,
  gen_payload    jsonb not null,        -- AI 생성 카피: 썸네일 {copy_main,copy_boxes} | 제목 {title} (ab_variants payload 모양과 일치)
  ideal_payload  jsonb not null,        -- 김짠부 이상 카피(같은 모양)
  diff           jsonb,                 -- step1 구조화 diff 결과(null 허용)
  learned_at     timestamptz,           -- step2 멱등 스탬프(학습 반영 시각). 이 step에선 항상 null.
  created_at     timestamptz not null default now()
);
create index idx_thumbnail_corrections_component on public.thumbnail_corrections (component_type);

alter table public.thumbnail_corrections enable row level security;
-- 읽기: owner만(학습 데이터). 쓰기 정책 없음 → authenticated 쓰기 차단, service-role(앱)만 insert/update.
create policy thumbnail_corrections_select on public.thumbnail_corrections for select to authenticated
  using (public.app_role() = 'owner');
