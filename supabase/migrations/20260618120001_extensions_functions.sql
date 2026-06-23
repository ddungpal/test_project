-- Phase 1 마이그레이션 01 — 확장 + 공용 트리거 함수
-- 설계: docs/tech.md §3 · §17 강제분(불변성·state·verified·RLS·인덱스). 의존성 순서로 분할.
-- 적용: Supabase 프로젝트 생성 후 `supabase db push` (또는 SQL 에디터 순서대로).

create extension if not exists pgcrypto; -- gen_random_uuid()

-- updated_at 자동 갱신(가변 테이블).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- L1 불변성 강제(§3.0·§17): UPDATE/DELETE 차단. 선언만으론 부족하므로 트리거로 막는다.
-- comments_raw 는 프라이버시 삭제 예외라 이 트리거를 붙이지 않는다(governance §3).
create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'L1 원본 테이블 %는 불변이다(INSERT만 허용). 시도: %', tg_table_name, tg_op;
end;
$$;

-- NOTE: app_role()은 profiles 테이블 생성 후(02)에 정의한다.
-- LANGUAGE sql 함수는 check_function_bodies(기본 ON)로 본문이 즉시 검증돼,
-- profiles가 없으면 여기서 생성이 실패하기 때문(코드리뷰 P0).
