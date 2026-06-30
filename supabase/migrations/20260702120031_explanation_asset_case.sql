-- 31 — explanation_assets 케이스 분기(case) 자산 토대(P4 case-branching step0).
-- 조건→결과 분기(branches)를 셈이(number)·유이(analogy)·비교(comparison)와 같은 "쉬운 설명 자산" 계열로 얹는다.
-- 새 kind 'case' 허용 + 구조화 분기 데이터는 마이그30이 추가한 payload(jsonb)에 담는다(컬럼 추가 없음).
-- src/pipeline/caseAsset.ts(normalizeCaseAsset)가 적재 전 정규화한다. additive·멱등·up only.
--
-- ⚠ 기존 행 하위호환: number/analogy/comparison 행은 그대로 유효. 데이터 무손상.
-- ⚠ payload 컬럼은 마이그30이 이미 추가했다 — 여기서 다시 추가 금지(중복 컬럼 에러).
-- ⚠ kind CHECK 교체(drop+add)는 같은 트랜잭션 안에서 — 기존 값은 신·구 제약 모두 허용해 무중단.
-- ⚠ 마이그레이션 적용 금지(파일 생성까지가 산출물) — phase 머지 후 사용자가 수동 적용.

begin;

-- ── kind CHECK 확장: ('number','analogy','comparison') → (+'case') ──
--   기존 inline check 제약명은 explanation_assets_kind_check. 멱등: 있으면 drop 후 재add.
--   drop+add를 같은 트랜잭션에서 묶어 기존 행이 어느 시점에도 위반되지 않게 한다.
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
    check (kind in ('number','analogy','comparison','case'));
end $$;

commit;
