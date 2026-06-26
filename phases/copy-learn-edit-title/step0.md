# Step 0: update-title-action (영상 이름 수정 서버 액션)

**`/copy-learn`에서 영상의 `contents.title`을 수정하는 서버 액션을 추가한다.** UI는 step1.

## 배경
- `/copy-learn` 카드는 `contents.title`을 표시만 하고 수정 입력이 없다. 카드의 "제목" 섹션은 제목 A/B **카피**(ab_variants)를 편집하는 것이라 영상 이름과 무관하다.
- 제목 없이 만들어진 런(예: 주제 "레버리지 ETF", `contents.title=null` → 카드에 "(제목 없음)")을 고칠 길이 없다.
- 직전 phase의 `createLearningVideo`(새 영상 추가)와 짝이 되는, 기존 영상의 이름 수정 기능.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md` — 계층·보안(requireOwner).
- `src/app/actions/copyLearn.ts` — **주 수정 대상.** `createLearningVideo`(직전 phase 추가)·`saveCopyAbResults`의 `requireOwner()` 후 service-role + `auditLog` 패턴. **이 패턴을 그대로 미러**하라.
- `src/lib/observability/auditLog.ts` — `AuditAction` union(8). 새 액션 타입을 **여기 union에 추가**해야 타입 통과.
- `src/lib/dashboard/auditView.ts` — 감사 로그 뷰어의 한국어 액션 라벨 맵(있으면). 새 액션 라벨을 여기에도 추가(없으면 생략 — 미상이면 grep "action" 으로 확인).
- `src/lib/dashboard/copyLearnView.ts` — `getCopyLearnVideos`가 `contents.title`을 읽는 방식(수정 후 router.refresh로 반영됨, 변경 불필요).

## 작업
### 1) `src/lib/observability/auditLog.ts` — 액션 타입 추가
- `AuditAction` union에 `"content_title_updated"` 추가.

### 2) (있으면) `src/lib/dashboard/auditView.ts` — 한국어 라벨
- 액션→한국어 라벨 맵이 있으면 `content_title_updated: "영상 이름 수정"`(또는 유사) 추가. 맵이 없으면 생략.

### 3) `src/app/actions/copyLearn.ts` — `updateContentTitle` 서버 액션
```ts
export async function updateContentTitle(contentId: string, title: string): Promise<{ updated: boolean }>;
```
- `requireOwner()` 후 service-role(기존 패턴).
- `title.trim()`이 빈 문자열이면 throw("제목을 입력하세요"). (이름을 null로 비우는 기능은 범위 외 — 비빈 값만 설정.)
- `contents` 테이블에서 `id=contentId` 행의 `title`을 trim한 값으로 update. 영향 0행이면(존재하지 않는 id) throw("영상을 찾지 못했습니다").
- `auditLog`(action: `"content_title_updated"`, targetType: `"content"`, targetId: contentId, detail: `{ title }`) best-effort.
- 반환 `{ updated: true }`.

## 주의 (구체)
- **requireOwner 게이트 필수**: service-role은 requireOwner 통과 후에만(기존 액션 동일). 이유: RLS 우회 쓰기 노출 차단.
- **빈 제목 거부**: trim 후 빈 문자열이면 throw. 이유: "(제목 없음)"을 또 만들지 않음·의미 없는 빈 라벨 차단.
- **이 step은 백엔드만**: UI(`CopyLearningForm`)·다른 액션을 건드리지 마라. 이유: step1 범위.
- `contents` 외 테이블(ab_variants/performance)은 안 건드린다 — 이름만 바꾼다. 이유: 카피·성과는 별도 저장 경로.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트
- 액션 자체는 DB·server-only 의존이라, 기존 copyLearn 테스트에 순수 로직이 없으면 강제 신규 테스트는 불필요(YAGNI). 단 **빈 제목 거부 가드**가 순수하게 분리 가능하면 작은 테스트 1개. 무리면 AC(typecheck/build)로 충분.
- 기존 테스트가 깨지지 않아야 한다(AuditAction union 확장은 하위호환).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy가 직접 실행해 exit code 확보).
2. 체크: requireOwner 게이트·빈 제목 거부·AuditAction union 추가·contents.title만 update·auditLog.
3. `phases/copy-learn-edit-title/index.json` step 0 갱신(성공→completed+summary 등).

## 금지사항
- requireOwner 없이 service-role을 쓰지 마라. 이유: 보안.
- 빈/공백 제목을 허용하지 마라. 이유: 빈 라벨 재생산 방지.
- UI를 건드리지 마라. 이유: step1 범위.
- 기존 테스트를 깨뜨리지 마라.
