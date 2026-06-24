# Step 0: state-machine-split

**제목·썸네일 분리의 토대 — 상태머신 + 스테이지 디스크립터 + 타입 + 마이그레이션 SQL.** 코드/오프라인 테스트는 다 통과시키되, DB 적용은 사용자 수동(아래 ⚠️).

## 목표 흐름 (바뀐 단계 경계)
```
topic_selected → titles_proposed → titles_selected        (제목: 3개 생성→1개 선택, 기존 title_thumb 유지)
              → thumbnails_proposed → thumbnails_selected  (썸네일: 3개 생성→3개 확정, 신규 thumbnail)
              → structure_proposed → …                     (구성: fromState가 titles_selected→thumbnails_selected로 변경)
```

## 핵심 설계 결정 (이대로 따를 것)
- **`title_thumb` 스테이지는 rename하지 않는다**(`src/` `tests/` 17파일이 문자열 참조 → 광범위 rename은 리스크·픽스처/eval 영향). 대신 **의미만 '제목 전용'으로** 바꾸고(썸네일 필드는 step1에서 출력에서 제거), **새 `thumbnail` 스테이지를 추가**한다. 주석으로 "title_thumb=역사적 이름, 현재 제목 전용" 명시.
- 새 역할 `thumbnail_maker`(roleId 안정·영구). step1에서 roles.ts에 추가하지만, **여기 step0의 STAGE_DESCRIPTORS.thumbnail.roleId는 "thumbnail_maker" 문자열로 미리 박아둔다**(roles.ts 추가는 step1).
- 썸네일 산출물 = **정확히 3개**(A/B/C 변형 세트). 1개 고르는 게 아니라 3개 확정.

## 읽어야 할 파일 (먼저 정독)
- `src/domain/enums.ts` — `RUN_STATES`·`ALLOWED_TRANSITIONS`·`canTransition`·`STAGES`·`Stage`. **여기에 새 상태/스테이지 추가.**
- `src/pipeline/stages.ts` — `STAGE_DESCRIPTORS`(title_thumb·structure)·`PIPELINE`. **thumbnail 디스크립터 추가 + structure.fromState/enters 변경.**
- `src/lib/dashboard/proposalTypes.ts` — `PROPOSAL_STAGES`·`ProposalStage`·`TitlePayload`(thumbnail_main?/thumbnail_boxes?)·`STAGE_TITLE`·`isProposalStage`. **thumbnail 추가 + ThumbnailPayload 신설.**
- `supabase/migrations/20260618120003_contents_runs.sql`(line 29: `state text not null check (state in (...))`) — **상태 CHECK enum**. 새 상태 2개 추가 필요.
- `supabase/migrations/20260618120008_state_transitions.sql` — `run_state_transitions` 표 + `enforce_run_transition` 트리거. **새 전이 추가 + titles_selected→structure_proposed 제거.**
- `tests/pipeline.test.ts`·기존 전이 테스트 — 패턴 참고.

## 작업
### 1) `enums.ts`
- `RUN_STATES`에 `titles_selected` 바로 뒤에 **`"thumbnails_proposed"`, `"thumbnails_selected"`** 추가.
- `ALLOWED_TRANSITIONS` 수정:
  - `titles_selected: ["thumbnails_proposed", "aborted"]`  ← (기존 `["structure_proposed","aborted"]`에서 변경)
  - `thumbnails_proposed: ["thumbnails_selected", "aborted"]`  ← 신규
  - `thumbnails_selected: ["structure_proposed", "aborted"]`  ← 신규
  - (structure_proposed 이후는 그대로)
- `STAGES`에 `"thumbnail"` 추가(예: `["topic","title_thumb","thumbnail","structure","research","script"]`).

### 2) `stages.ts`
- `STAGE_DESCRIPTORS`에 **thumbnail** 추가:
  ```ts
  thumbnail: { stage: "thumbnail", roleId: "thumbnail_maker",
    fromState: "titles_selected", proposedState: "thumbnails_proposed", selectedState: "thumbnails_selected" },
  ```
- `STAGE_DESCRIPTORS.structure.fromState` → **"thumbnails_selected"**(기존 titles_selected).
- `PIPELINE`에 thumbnail 엔트리 추가(shape:"linear", roleIds:["thumbnail_maker"], event:**"run/thumbnails.requested"**, enters:"titles_selected", produces:"thumbnails_proposed", proposal:STAGE_DESCRIPTORS.thumbnail). `PIPELINE.structure.enters` → "thumbnails_selected". (title_thumb 엔트리는 그대로 둔다.)
- `satisfies Record<Stage, PipelineStage>` 만족하도록 키 누락 없게.

### 3) `proposalTypes.ts`
- `PROPOSAL_STAGES`에 **"thumbnail"** 추가(`["topic","title_thumb","thumbnail","structure"]`).
- **`ThumbnailPayload` 신설**: `{ thumbnail_main: string[]; thumbnail_boxes: string[]; thumbnail_layout?: string }`(메인2·박스2). `TitlePayload`는 **title 중심**으로 두되 thumbnail_main?/thumbnail_boxes?는 **레거시 호환 위해 옵셔널 유지**(기존 데이터·픽스처 안 깨지게 — 지우지 마라).
- `STAGE_TITLE`에 `thumbnail: "썸네일"`(또는 적절한 한국어) 추가. `ProposalStage` 파생이 thumbnail 포함하는지 확인.

### 4) 마이그레이션 SQL (새 파일 `supabase/migrations/<타임스탬프>_thumbnail_stage_states.sql`)
- 타임스탬프는 기존 최신 마이그레이션보다 큰 값(파일명 규칙 따름). **Date.now() 쓰지 말고**(스크립트 아님, SQL 파일) 적절한 숫자 문자열로.
- 내용:
  - `production_runs.state` CHECK enum에 `'thumbnails_proposed'`, `'thumbnails_selected'` 추가(003의 CHECK를 `alter table ... drop constraint ...; add constraint ... check (state in (...))`로 재정의 — 기존 값 전부 + 신규 2개).
  - `run_state_transitions`에 insert: `('titles_selected','thumbnails_proposed')`, `('thumbnails_proposed','thumbnails_selected')`, `('thumbnails_proposed','aborted')`, `('thumbnails_selected','structure_proposed')`, `('thumbnails_selected','aborted')`.
  - **기존 전이 제거**: `delete from run_state_transitions where from_state='titles_selected' and to_state='structure_proposed';`(새 흐름은 썸네일을 거친다).
- SQL 주석으로 "enums.ts ALLOWED_TRANSITIONS와 동기화" 명시. up만(이 프로젝트 관행).

## ⚠️ DB 적용은 사용자 수동 (이 step은 SQL 작성까지만)
- 이 프로젝트는 `SUPABASE_DB_URL`이 없어 **마이그레이션은 Supabase SQL 에디터로 사람이 직접 적용**한다. 이 step은 **SQL 파일 작성 + 코드/타입 변경 + 오프라인 테스트 통과**까지만 한다. **DB에 적용하려 하지 마라**(불가·범위 밖).
- summary에 "⚠️ 마이그레이션 미적용 — 라이브 전 사용자가 SQL 에디터로 적용 필요"를 반드시 적어, 다음 step·사용자가 알게 한다. (적용 전에는 titles_selected→thumbnails_proposed 전이가 DB 트리거에 막혀 라이브 새 흐름이 안 돈다. 오프라인 AC와는 무관.)

## 주의
- `ALLOWED_TRANSITIONS`는 `Record<RunState, ...>`라 **새 상태 2개의 키를 빠뜨리면 타입 에러** — 둘 다 넣어라.
- `STAGE_DESCRIPTORS`/`PIPELINE`의 `satisfies` 제약 깨지지 않게(키·타입 정합).
- `TitlePayload`의 thumbnail 옵셔널 필드를 **지우지 마라**(기존 title_thumb 데이터·픽스처 호환). 제목 전용 의미 전환은 step1(에이전트 출력)에서.
- 마이그레이션 파일명 타임스탬프는 기존보다 커야 순서 보장.
- exactOptionalPropertyTypes·noUncheckedIndexedAccess 준수.

## 테스트 (`tests/` 신규 또는 기존 전이 테스트에 추가)
- `canTransition("titles_selected","thumbnails_proposed")` true, `canTransition("titles_selected","structure_proposed")` **false**(이제 막힘), `canTransition("thumbnails_proposed","thumbnails_selected")` true, `canTransition("thumbnails_selected","structure_proposed")` true.
- `RUN_STATES`에 두 상태 포함. `STAGES`에 "thumbnail" 포함. `STAGE_DESCRIPTORS.structure.fromState==="thumbnails_selected"`.
- `ALLOWED_TRANSITIONS`의 모든 키가 RUN_STATES와 1:1(누락/잉여 없음) — 가능하면 이 불변식 테스트.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0. 기존 테스트(특히 title_thumb 참조분)가 안 깨졌는지 확인(스테이지 추가는 비파괴여야).
2. 새 마이그레이션 SQL이 003 CHECK 재정의 + 008 전이 insert/delete를 모두 포함하는지 육안 확인.
3. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"⚠️ 마이그레이션 미적용(사용자 수동). enums 새 상태 thumbnails_proposed/selected + 전이(titles_selected→thumbnails_proposed→thumbnails_selected→structure_proposed, titles_selected→structure_proposed 제거) + STAGES 'thumbnail' + STAGE_DESCRIPTORS.thumbnail(role thumbnail_maker)·structure.fromState 변경 + proposalTypes ThumbnailPayload·PROPOSAL_STAGES 'thumbnail' + 마이그레이션 SQL(003 CHECK+008 전이). title_thumb는 제목전용으로 유지(rename 안함). 전이 테스트. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- `title_thumb` 스테이지를 rename하지 마라(17파일·픽스처·eval 광역 파손). 이유: 의미 전환만으로 충분.
- DB에 마이그레이션을 적용하려 하지 마라(SUPABASE_DB_URL 없음·사람 게이트).
- `TitlePayload`의 thumbnail 옵셔널 필드 삭제 금지(레거시 호환).
- 에이전트·UI·서버액션은 이 step 범위 밖(step1~3). 손대지 마라.
- 기존 테스트를 깨뜨리지 마라.
