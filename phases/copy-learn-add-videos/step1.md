# Step 1: learning-video-create (학습 영상 추가 백엔드 — contents stub 생성)

**`/copy-learn`에서 새 학습 영상을 만들 수 있도록 contents stub을 생성하는 서버 액션 + 순수 빌더 + 테스트.** UI는 step2.

## 배경 (왜 이렇게)
- `/copy-learn`은 `contents` 기존 행만 편집한다. `saveCopyAbResults`(`src/app/actions/copyLearn.ts:40`)는 `resolveContentId`로 기존 행을 찾고, 없으면 **"영상을 찾지 못했습니다"** 로 던진다 → 새 영상 추가 불가.
- 학습 표본(썸네일/제목)을 늘리려면 **학습 전용 contents 행을 새로 만들 수 있어야** 한다.
- `scripts/ingest-ab.ts:144`에 이미 학습용 stub을 insert하는 **선례**가 있다(`source:'produced', status:'in_production', title`). 이 패턴을 재사용한다.
- **source는 반드시 `'produced'`**: `contents.source` CHECK는 `'imported'|'produced'`만 허용. `'imported'`로 만들면 씨앗 모드 참조편 드롭다운(`listReferenceEditions`, queries.ts:63, `source='imported'` 필터)에 오염되어 뜬다. `'produced'`는 거기 안 뜨고, 대시보드 런 목록도 `production_runs` 기준이라 stub은 가짜 런으로 안 뜬다(검증됨).

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md` — 계층·보안(requireOwner)·데이터 3층.
- `src/app/actions/copyLearn.ts` — **주 수정/확장 대상.** `resolveContentId`(17)·`saveCopyAbResults`(40)·`requireOwner` 후 service-role·`auditLog` 패턴.
- `scripts/ingest-ab.ts:125-150` — `resolveOrStubContentId`/stub 형태(`TablesInsert<"contents">`: source/status/title/youtube_video_id). **이 형태를 미러**하라.
- `src/app/actions/copyLearnMap.ts` — 순수 매핑이 `copyLearnMap.ts`(server-only 무관)에 사는 이유(테스트가 DB 없이 import). 새 순수 빌더도 여기 둔다.
- `src/lib/supabase/database.types.ts` — `TablesInsert<"contents">`·`ContentSource`·`ContentStatus` 타입.
- `supabase/migrations/20260618120003_contents_runs.sql:6,11` — source/status CHECK 허용값.

## 작업
### 1) `src/app/actions/copyLearnMap.ts` — 순수 stub 빌더
```ts
export interface NewLearningVideoInput {
  title: string;            // 필수(라벨·표시용)
  youtubeVideoId?: string;  // 선택(있으면 멱등 매칭 키)
  uploadDate?: string;      // 선택(YYYY-MM-DD)
  thumbnailUrl?: string;    // 선택(카드 미리보기)
}
/** 학습 전용 contents stub 행(순수). source='produced' 고정. 빈/공백 필드는 제외. ingest-ab stub 미러. */
export function buildLearningVideoStub(input: NewLearningVideoInput): TablesInsert<"contents">;
```
- `source: "produced"`, `status: "in_production"`(ingest-ab 선례와 동일), `title`=trim. youtube_video_id/upload_date/thumbnail_url은 값 있을 때만 키 추가(빈 문자열 누출 금지).

### 2) `src/app/actions/copyLearn.ts` — `createLearningVideo` 서버 액션
```ts
export async function createLearningVideo(input: NewLearningVideoInput): Promise<{ contentId: string; created: boolean }>;
```
- `requireOwner()` 후 service-role(기존 패턴).
- **멱등**: `youtubeVideoId`가 주어졌고 이미 그 `youtube_video_id`의 contents가 있으면 **생성하지 않고 기존 id 반환**(`created:false`). 없으면 `buildLearningVideoStub`로 insert(`created:true`).
- title이 빈 문자열이면 throw("제목을 입력하세요").
- `auditLog`(action 예: `"learning_video_created"`, targetType:"content", targetId:contentId) best-effort.

## 주의 (구체)
- **source는 'produced' 고정**(하드코딩). 이유: 'imported'면 참조편 드롭다운 오염. 사용자 결정.
- **순수 빌더와 액션 분리**: stub 형태 빌드는 `copyLearnMap.ts`(순수·테스트 import), DB·auth는 `copyLearn.ts`. 이유: 기존 컨벤션(server-only 의존이 테스트를 막음).
- **멱등 필수**: 같은 youtube_video_id 두 번 → 행 1개. 이유: 중복 학습 영상 방지(ingest-ab resolveOrStub 패턴).
- **기존 `saveCopyAbResults`는 변경 최소화**: 새 영상은 "먼저 createLearningVideo로 행 생성 → 그 contentId로 기존 saveCopyAbResults" 2단계로 간다(step2 UI가 순서 호출). saveCopyAbResults 안에서 stub을 만들지 마라 — 책임 분리(생성 vs 저장)가 명확하고 멱등 추론이 쉽다.
- `exactOptionalPropertyTypes`: 옵셔널 필드는 `undefined` 대입 말고 **값 있을 때만 키 추가**.

## 테스트 (`tests/`에 추가 — 순수 빌더 대상)
- `buildLearningVideoStub`: source='produced'·status·title trim·옵셔널 필드 값 있을 때만 키 포함·빈 문자열 제외.
- (가능하면) title 빈값 가드 등 순수 경로.
- 액션 자체(DB)는 기존 copyLearn 테스트 패턴이 있으면 따르고, 없으면 순수 빌더 테스트로 충분.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy가 직접 실행해 exit code 확보).
2. 체크: source='produced' 고정·멱등(youtube_video_id 중복 시 기존 반환)·순수 빌더 분리·requireOwner 게이트·auditLog.
3. `phases/copy-learn-add-videos/index.json` step 1 갱신(성공→completed+summary 등).

## 금지사항
- `source`를 'imported'로 만들지 마라. 이유: 참조편 드롭다운 오염(사용자 결정 = produced).
- `saveCopyAbResults` 안에서 stub을 생성하지 마라. 이유: 생성/저장 책임 분리·멱등 추론.
- 순수 빌더에 server-only(auth/admin) import를 넣지 마라. 이유: vitest가 직접 import.
- step0(회고 sweep)·UI를 건드리지 마라. 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
