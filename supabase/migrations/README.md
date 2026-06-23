# Supabase 마이그레이션 (Phase 1 — DB)

설계: `docs/tech.md` §3(DDL)·§17(강제 체크리스트). 파일은 **의존성 순서**(번호순)로 실행 — tech.md DDL의 forward-ref를 피하려 재배열함(§17).

## 적용

```bash
# Supabase 프로젝트 생성 후
supabase link --project-ref <ref>
supabase db push        # migrations/ 순서대로 적용
# 최초 운영자 승격:
#   update public.profiles set role='owner' where id = (select id from auth.users order by created_at limit 1);
```
(또는 SQL 에디터에 번호순으로 붙여넣기.)

## 파일 순서

| # | 파일 | 내용 |
|---|---|---|
| 01 | extensions_functions | pgcrypto · set_updated_at · forbid_mutation |
| 02 | config_profiles | profiles → **app_role()**(profiles 뒤·재귀방지) → **guard_role_change**(자가승격 차단) → config_registry |
| 03 | contents_runs | 단일 척추 + production_runs (**state CHECK enum**) |
| 04 | l1_sources | L1 원본 (comments_raw = author 없음·HMAC·삭제예외) |
| 05 | l2_pipeline | 제안/선택/research_facts(**verified CHECK**)/lineage 조인/원장 |
| 06 | l3_knowledge_corpus | 말투·인사이트·코퍼스(**include_in_training NULL 수정**)·provenance FK |
| 07 | indexes | **hot FK 인덱스** |
| 08 | state_transitions | 전이표 + **전이 가드 트리거** |
| 09 | immutability | **L1 불변 트리거** (comments_raw 제외) |
| 10 | rls | **RLS 정책 실체화** (역할 기반·L1 insert전용·comments_raw 삭제 service-role 전용) |
| 11 | seed_config | config_registry 확정값 시드 + 신규가입 프로필 자동생성 |

## §17 DB 강제분 매핑 (코드리뷰 반영)

- **FK 순서/forward-ref** → 의존성 순서 분할(02 profiles 먼저 등).
- **RLS 정책** → 10_rls (service_role 우회 + authenticated 역할 정책).
- **verified CHECK** → 05 `research_facts_verified_rule` (독립출처≥2·인용실재·금융→1차).
- **hot FK 인덱스** → 07.
- **state enum + 전이가드** → 03 CHECK + 08 트리거(`src/domain/enums.ts`와 동기화).
- **L1 불변 + comments_raw 예외** → 09 (P0·governance §3).
- **include_in_training NULL 버그** → 06 NOT NULL + coalesce.
- **lineage polymorphic 제거** → 06 profile_training_sources tone/style 분리 FK + CHECK.

## 주의

- 코드(`src/domain/enums.ts`)의 enum·전이표와 DB가 **이중 정의**다. 변경 시 양쪽 동기화(향후 단일 생성기로 통합 검토).
- 미적용: 실제 Postgres에서 아직 실행 안 함(Supabase 프로젝트 생성 후 첫 push 때 검증).
