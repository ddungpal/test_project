# Step 0: thumbnail-stage-constraint

**썸네일 제안이 DB CHECK 제약에서 막히는 버그를 마이그레이션 1개로 푼다.** 썸네일 단계가 `stage_proposals`에 `stage='thumbnail'` 행을 INSERT하는데, 이 컬럼의 CHECK 제약(`stage_proposals_stage_check`)에 `'thumbnail'`이 빠져 있어 Postgres가 거부한다. **코드 변경은 필요 없다** — 새 마이그레이션 SQL 1개만 만든다.

## 배경 (왜 이렇게)
- 실사용 테스트에서 썸네일 제안 시 발생한 실제 에러:
  ```
  stage_proposals insert 실패: new row for relation "stage_proposals"
  violates check constraint "stage_proposals_stage_check"
  ```
- INSERT 지점: `src/pipeline/stageContract.ts:135`(`runProposalStage`)와 `src/pipeline/thumbnailSlot.ts:114`(`regenerateThumbnailSlot`)가 `stage='thumbnail'`로 넣는다.
- 코드 enum `src/domain/enums.ts:67`의 `STAGES`는 이미 `"thumbnail"`을 포함하고, 상태 분리 마이그레이션 `supabase/migrations/20260624120022_thumbnail_stage_states.sql`도 `production_runs.state`에 thumbnails_* 를 추가했다.
- **그러나 그 마이그레이션이 `stage_proposals.stage`의 CHECK는 갱신하지 않았다.** 현재 제약은 `supabase/migrations/20260618120005_l2_pipeline.sql:7`에:
  ```sql
  stage text not null check (stage in ('topic','title_thumb','structure','research','script')),
  ```
  → `'thumbnail'`이 없다. 이 한 곳만 고치면 된다.

## 읽어야 할 파일 (먼저 정독)
- `/Users/dongwonchoi/Desktop/동원 백업/동원폴더/claude-code/produce script/CLAUDE.md` — 프로젝트 규칙·보안.
- `supabase/migrations/20260618120005_l2_pipeline.sql` — stage_proposals 원래 정의(7줄 CHECK).
- `supabase/migrations/20260624120022_thumbnail_stage_states.sql` — **그대로 따를 DROP/ADD 패턴**(production_runs_state_check를 drop 후 전체 리스트로 add). 네이밍·헤더 주석 컨벤션도 여기를 본뜬다.
- `src/domain/enums.ts` — `STAGES`에 'thumbnail' 이미 있음(코드 변경 불필요 확인용).
- `supabase/migrations/README.md` — 적용 방법(수동 SQL/`supabase db push`).

## 작업
### 1) 새 마이그레이션 파일 생성
`supabase/migrations/20260625120023_stage_proposals_thumbnail.sql` (번호·날짜는 직전 22 다음, 컨벤션 `YYYYMMDD120NNN_name.sql`):

```sql
-- 23 — stage_proposals.stage CHECK에 'thumbnail' 추가.
-- 단계분리(22)가 production_runs.state만 갱신하고 이 제약을 빠뜨려, 썸네일 제안 insert가 거부됐다.
alter table public.stage_proposals drop constraint stage_proposals_stage_check;
alter table public.stage_proposals add constraint stage_proposals_stage_check
  check (stage in ('topic','title_thumb','thumbnail','structure','research','script'));
```

- 허용값은 `src/domain/enums.ts`의 `STAGES`와 **정확히 일치**시켜라(topic·title_thumb·thumbnail·structure·research·script).

### 2) database.types.ts 확인 (조건부)
`src/lib/database.types.ts`(또는 `database.types.ts`)에서 `stage_proposals.stage`의 타입을 확인하라.
- `string`이면 → 변경 없음(현재 build가 통과하므로 대부분 이 경우).
- 만약 리터럴 union(예: `"topic" | "title_thumb" | ...`)이고 'thumbnail'이 빠져 있으면 → 'thumbnail'을 추가한다.

## 주의 (구체)
- **기존 마이그레이션 파일을 수정하지 마라. 새 파일로만 추가하라.** 이유: 이미 적용된 마이그레이션을 바꾸면 적용 이력이 어긋나 재현 불가능해진다.
- **DB에 직접 적용하지 마라(라이브 적용은 사람 게이트).** 이유: 하네스 에이전트는 Supabase 자격이 없고, 적용은 사용자가 SQL 에디터/`supabase db push`로 한다. 이 step은 **파일 생성까지만**.
- 코드 로직(stageContract.ts·thumbnailSlot.ts·enums.ts)은 **건드리지 마라**. 이미 옳다 — DB 제약만 못 따라온 것.

## Acceptance Criteria
```bash
npm run typecheck   # 컴파일 에러 없음(회귀 없음)
npm test            # 기존 테스트 통과
npm run build       # 빌드 통과
grep -q "'thumbnail'" supabase/migrations/20260625120023_stage_proposals_thumbnail.sql && \
  grep -q "stage_proposals_stage_check" supabase/migrations/20260625120023_stage_proposals_thumbnail.sql && echo MIGRATION_OK
```
(마지막 줄이 `MIGRATION_OK`를 출력해야 한다 — 새 마이그레이션이 thumbnail을 포함한 CHECK를 재정의하는지 확인.)

## 검증 절차
1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크: 보안 규칙(`.env`·키 비커밋) 위반 없음, 마이그레이션 네이밍/패턴이 22번과 동형인지.
3. 결과에 따라 `phases/usertest-fixes-1/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 **"⚠️ 라이브 미적용 — 사용자가 Supabase SQL 에디터/`supabase db push`로 마이그레이션 23을 적용해야 썸네일 제안 에러가 풀림"**을 반드시 포함.
   - 실패(3회 수정 후) → `"status": "error"`, `"error_message"`.
   - 외부 자격 필요 등 → `"status": "blocked"`, `"blocked_reason"`.

## 금지사항
- 기존 마이그레이션 파일 수정 금지(새 파일로만). 이유: 적용 이력 무결성.
- 라이브 DB 적용 금지(사람 게이트). 이유: 자격 없음·사용자 책임.
- 코드 로직 변경 금지(DB 제약만 문제). 이유: 불필요한 회귀 위험.
- 기존 테스트를 깨뜨리지 마라.
