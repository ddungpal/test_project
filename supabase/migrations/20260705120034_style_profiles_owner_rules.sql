-- style_profiles 에 component_type='title_owner_rules'·'thumbnail_owner_rules' 추가 (김짠부 직접 피드백 학습).
--   김짠부(@zzanboo)가 후보를 보고 주는 정성 피드백을 증류한 '최우선 규칙'을 style_profiles 에
--   component_type='title_owner_rules'·'thumbnail_owner_rules' draft 로 저장하기 위함.
--   기존 5종('title','thumbnail_copy','description','structure','analogy_style')은 전부 보존하고 2종만 추가한다.
--   멱등: CHECK 제약을 'drop constraint if exists' 후 동일 이름으로 재생성한다(여러 번 실행해도 안전).
--   ⚠️ 사람이 적용한다(라이브 활성화 시) — 하네스/AC 는 이 마이그레이션을 자동 적용하지 않는다.
--   ⚠️ profile_training_sources 의 profile_type CHECK·pts_profile_match 는 건드리지 않는다 —
--      이번 v1 은 owner rules 학습에 training_sources 행을 삽입하지 않는다(YAGNI). style_profiles CHECK 만 넓힌다.

-- style_profiles.component_type — 'title_owner_rules'·'thumbnail_owner_rules' 추가(기존 5종 보존).
alter table public.style_profiles drop constraint if exists style_profiles_component_type_check;
alter table public.style_profiles add constraint style_profiles_component_type_check
  check (component_type in ('title','thumbnail_copy','description','structure','analogy_style','title_owner_rules','thumbnail_owner_rules'));
