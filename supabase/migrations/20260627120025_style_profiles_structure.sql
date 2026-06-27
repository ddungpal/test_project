-- style_profiles / profile_training_sources 에 component_type='structure' 추가 (a안).
--   구다리(structurer) 구성/전개 패턴을 style_profiles 에 component_type='structure' draft 로 저장하기 위함.
--   기존 'title','thumbnail_copy','description'(및 profile_type 'tone' 포함) 값은 전부 보존하고 'structure'만 추가한다.
--   멱등: 각 CHECK 제약을 'drop constraint if exists' 후 동일 이름으로 재생성한다(여러 번 실행해도 안전).
--   ⚠️ 사람이 적용한다(라이브 활성화 시) — 하네스/AC 는 이 마이그레이션을 자동 적용하지 않는다.

-- 1) style_profiles.component_type — 'structure' 추가(기존 3종 보존).
alter table public.style_profiles drop constraint if exists style_profiles_component_type_check;
alter table public.style_profiles add constraint style_profiles_component_type_check
  check (component_type in ('title','thumbnail_copy','description','structure'));

-- 2) profile_training_sources.profile_type — 'structure' 추가(기존 tone/title/thumbnail_copy/description 보존).
alter table public.profile_training_sources drop constraint if exists profile_training_sources_profile_type_check;
alter table public.profile_training_sources add constraint profile_training_sources_profile_type_check
  check (profile_type in ('tone','title','thumbnail_copy','description','structure'));

-- 3) profile_training_sources 의 프로필 매칭 제약 — 'structure'는 style_profile_id 쪽(tone 만 tone_profile_id).
alter table public.profile_training_sources drop constraint if exists pts_profile_match;
alter table public.profile_training_sources add constraint pts_profile_match check (
  (profile_type = 'tone' and tone_profile_id is not null and style_profile_id is null)
  or (profile_type in ('title','thumbnail_copy','description','structure') and style_profile_id is not null and tone_profile_id is null)
);
