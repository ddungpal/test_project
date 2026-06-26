# Step 0: content-lifecycle-actions (영상 삭제 + 업로드일 수정 백엔드)

**`/copy-learn` 영상의 삭제·업로드일 수정 서버 액션을 추가한다.** 삭제는 검증된 cascade 시퀀스를 **재사용**한다. UI는 step1.

## 배경 (왜 이렇게 — 삭제는 위험)
- contents 삭제는 함정 2개가 있다(과거 여러 세션에 걸쳐 고침):
  - `contents` 삭제 → `ab_variants`/`performance_metrics` 캐스케이드 → `profile_training_sources`의 FK가 `ON DELETE SET NULL` → 유일 출처였으면 `pts_has_source`(출처≥1) **CHECK 위반** → 삭제 트랜잭션 롤백.
  - `retrospectives` 캐스케이드 삭제 → `insights.source_retrospective_id` SET NULL → A3 CHECK(`insights_retro_consistent`) 위반.
- `deleteRun`(`src/app/actions/topicRun.ts:151`)이 이걸 **`detachOrphanTrainingSources` + `cleanupRetrospectives` + `source='produced'` 가드**로 안전 처리한다. **이 시퀀스를 그대로 재사용**해야 한다 — 복붙·재구현하면 드리프트(나중에 세 번째 가드가 늘면 한쪽이 누락).
- 문제: `topicRun.ts`는 `"use server"`라 액션 외 헬퍼를 export하면 안 된다(모든 export가 server action으로 노출됨). → **cascade를 비-'use server' 모듈로 추출**해 `deleteRun`과 새 `deleteLearningVideo`가 공유한다.
- 업로드일 수정은 직전 phase의 `updateContentTitle`(같은 파일)을 미러.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md` — 계층·보안(requireOwner)·데이터 무결성.
- `src/app/actions/topicRun.ts:108-168` — **`detachOrphanTrainingSources`(115·private)·`deleteRun`(151)**. 두 CHECK 가드 주석을 정독. 이 로직이 추출 대상.
- `src/agents/retrospectivist/runRetrospective.ts` — `cleanupRetrospectives`(140·이미 export·비-'use server'). 추출 모듈이 이걸 호출.
- `src/app/actions/copyLearn.ts` — `updateContentTitle`(직전 phase)·`createLearningVideo`. **새 액션도 이 패턴(requireOwner→service-role→audit) 미러.**
- `src/lib/observability/auditLog.ts:8` — `AuditAction` union(새 액션 추가).
- `src/lib/dashboard/auditView.ts:8` — `AUDIT_ACTION_LABEL` 맵(새 라벨 추가).
- `supabase/migrations/20260618120003_contents_runs.sql` — `contents.upload_date` 컬럼(date).

## 작업
### 1) cascade 추출 — 비-'use server' 모듈 (예: `src/app/actions/contentLifecycle.ts`, 파일 상단에 `"use server"` 금지)
```ts
// 검증된 produced-content 하드 삭제 시퀀스(deleteRun·deleteLearningVideo 공유). 두 CHECK 가드 선제.
export async function detachOrphanTrainingSources(supa: Supa, contentId: string): Promise<void>; // topicRun에서 이동
/** produced content 1건 하드 삭제(+캐스케이드). detach→cleanup→delete(source='produced' 가드).
 *  반환 deleted=실제 삭제 행수(0이면 미존재 or produced 아님). 멱등. */
export async function deleteProducedContent(supa: Supa, contentId: string): Promise<{ deleted: number }>;
```
- `detachOrphanTrainingSources`를 topicRun.ts에서 **이 모듈로 이동**(topicRun은 여기서 import).
- `deleteProducedContent` = detach → `cleanupRetrospectives` → `contents.delete().eq("id",contentId).eq("source","produced")` → 삭제 행수 반환. (auditLog·requireOwner는 호출자 책임 — 이 모듈은 순수 DB 시퀀스.)
- `deleteRun`을 리팩터해 이 `deleteProducedContent`를 호출하도록 바꾼다(기존 동작·source 가드·에러 메시지 보존). **deleteRun의 외부 동작은 불변**이어야 한다.

### 2) `src/app/actions/copyLearn.ts` — 새 액션 2개
```ts
export async function deleteLearningVideo(contentId: string): Promise<{ deleted: number }>;
export async function updateContentUploadDate(contentId: string, uploadDate: string): Promise<{ updated: boolean }>;
```
- `deleteLearningVideo`: `requireOwner` → `deleteProducedContent(supa, contentId)` → 삭제 0이면 throw("삭제 거부: produced 콘텐츠가 아니거나 없음") → `auditLog`(action `"content_deleted"`, targetType `"content"`, targetId contentId). **produced만 삭제됨**(imported 참조편 보호 — deleteProducedContent의 source 가드).
- `updateContentUploadDate`: `requireOwner` → `uploadDate.trim()`이 `YYYY-MM-DD` 형식 아니면 throw("날짜 형식은 YYYY-MM-DD") → `contents.update({upload_date})` where id=contentId, 0행이면 throw("영상을 찾지 못했습니다") → `auditLog`(action `"content_upload_date_updated"`).

### 3) audit 타입·라벨
- `AuditAction` union에 `"content_deleted"`·`"content_upload_date_updated"` 추가.
- `AUDIT_ACTION_LABEL`에 `content_deleted: "영상 삭제"`·`content_upload_date_updated: "업로드일 수정"` 추가.

## 주의 (구체)
- **cascade를 복붙·재구현하지 마라 — 추출해 재사용**. 이유: pts_has_source·insights A3 두 CHECK 가드는 과거 여러 번 고친 함정. 중복 시 한쪽만 갱신돼 재발.
- **추출 모듈은 `"use server"` 금지**. 이유: 'use server' 파일의 export는 전부 외부 호출 가능한 server action이 됨(헬퍼 노출=보안). 이 모듈은 서버 측 일반 함수.
- **deleteRun 외부 동작 불변**: 리팩터 후에도 같은 source 가드·"produced 아니면 거부" 에러·audit `run_deleted` 유지. 이유: 기존 호출·테스트 보존.
- **source='produced' 가드 필수**: imported(참조용 기존편)는 절대 삭제 안 됨. 이유: 사용자 데이터 보호(기존 안전장치).
- **requireOwner 게이트**: 두 새 액션 모두 service-role 전 requireOwner. 이유: 보안.
- **삭제는 캐스케이드**: production_run 있는 content(예 레버리지 ETF)를 지우면 run·자식도 함께 삭제됨 — 정상(deleteRun과 동일). UI 확인 문구는 step1.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트
- **기존 deleteRun 테스트가 있으면 전부 그대로 통과**해야 한다(리팩터=동작 불변). 깨지면 추출이 동작을 바꾼 것.
- `updateContentUploadDate`의 날짜 형식 가드가 순수 분리 가능하면 작은 테스트 1개(YYYY-MM-DD 검증·경계). 무리면 AC로 충분.
- 가능하면 `deleteProducedContent`의 멱등(미존재→deleted 0)·source 가드 경로 테스트.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy가 직접 실행해 exit code 확보). **특히 기존 삭제 관련 테스트 보존 확인.**
2. 체크: cascade 추출·재사용(중복 구현 없음)·추출 모듈 비-'use server'·deleteRun 동작 불변·source 가드·requireOwner·날짜 형식 가드·audit 타입/라벨.
3. `phases/copy-learn-manage-videos/index.json` step 0 갱신(성공→completed+summary 등).

## 금지사항
- cascade(detach+cleanup+delete) 로직을 copyLearn.ts에 복붙하지 마라. 이유: 드리프트(CHECK 가드 재발).
- 추출 모듈에 `"use server"`를 넣지 마라. 이유: 헬퍼가 server action으로 노출됨.
- source='produced' 가드를 빼지 마라. 이유: imported 참조편 삭제 사고.
- requireOwner 없이 삭제/수정하지 마라. 이유: 보안.
- UI를 건드리지 마라. 이유: step1 범위.
- 기존 테스트를 깨뜨리지 마라.
