-- 30 — explanation_assets 비교(comparison) 자산 토대(P3 comparison-table step0).
-- 비교표(엔티티×차원×셀)를 셈이(number)·유이(analogy)와 같은 "쉬운 설명 자산" 계열로 얹는다.
-- 새 kind 'comparison' 허용 + 구조화 비교 데이터를 담을 payload(jsonb) 추가.
-- src/pipeline/comparisonAsset.ts(normalizeComparison)가 적재 전 정규화한다. additive·멱등·up only.
--
-- ⚠ 기존 행 하위호환: number/analogy 행은 그대로 유효(payload null). 데이터 무손상.
-- ⚠ 기존 컬럼(numeric_example·analogy·math_verified·distortion_checked) drop/alter 금지.
-- ⚠ kind CHECK 교체(drop+add)는 같은 트랜잭션 안에서 — number/analogy 값은 신·구 제약 모두 허용해 무중단.
-- ⚠ 마이그레이션 적용 금지(파일 생성까지가 산출물) — phase 머지 후 사용자가 수동 적용.

begin;

-- ── kind CHECK 확장: ('number','analogy') → ('number','analogy','comparison') ──
--   기존 inline check 제약명은 explanation_assets_kind_check. 멱등: 있으면 drop 후 재add.
--   drop+add를 같은 트랜잭션에서 묶어 기존 number/analogy 행이 어느 시점에도 위반되지 않게 한다.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'explanation_assets_kind_check'
      and conrelid = 'public.explanation_assets'::regclass
  ) then
    alter table public.explanation_assets
      drop constraint explanation_assets_kind_check;
  end if;

  alter table public.explanation_assets
    add constraint explanation_assets_kind_check
    check (kind in ('number','analogy','comparison'));
end $$;

-- ── payload 컬럼 추가(additive·멱등) ──────────────────────────────────────────
--   payload : 비교 데이터(entities/dimensions/cells). jsonb, nullable —
--             number/analogy 행은 null(기존 numeric_example/analogy 컬럼 사용).
alter table public.explanation_assets
  add column if not exists payload jsonb;

commit;
