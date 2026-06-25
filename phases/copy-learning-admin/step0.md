# Step 0: ab-data-store (데이터 계층 — 썸네일·제목 입력 저장)

**관리자가 입력한 영상별 (썸네일 변형 + 제목 + CTR 24h + A/B 결과)를 DB에 멱등 저장하는 백엔드.** UI는 step2, 학습은 step1. 이 step은 **읽기헬퍼 + 저장 서버액션**만. **썸네일·제목 둘 다 다룬다.**

## 배경 (왜 이렇게)
- 손으로 고치던 `ab-results.json`을 owner 전용 페이지 입력 → DB 저장으로 대체(이 step은 저장 계층).
- 김짠부가 **변형별 썸네일 문구를 직접 입력**, 그리고 **제목**도 함께. 영상 전체 **CTR(24h)** 입력.
- **제목 입력 모드(사용자 확정)**: 체크박스 "A/B/C 테스트 있음" →
  - 켜짐: 제목 3개(A/B/C) + 각 점유율(%) → 썸네일과 동일 구조.
  - 꺼짐: **최종 제목 1개** + CTR(24h)만 → A/B 없이 CTR 매칭.
- 유튜브는 변형별 CTR을 안 주므로 입력 = **영상 전체 CTR(24h) + 변형별 점유율/승자**(썸네일·제목 A/B 공통).

## 읽어야 할 파일 (먼저 정독)
- `CLAUDE.md` — 보안(키·원본 비커밋)·비용.
- `src/app/actions/insights.ts` — 서버액션 표준(`"use server"`·`requireOwner`·`createAdminClient`·`auditLog`·낙관잠금). 본보기.
- `src/app/actions/auth.ts` — `requireOwner`.
- `src/lib/observability/auditLog.ts` — `auditLog(...)` + `AuditAction` union. **`copy_ab_saved` 추가.**
- `src/lib/dashboard/insightsView.ts` — server-only 읽기헬퍼 패턴.
- `scripts/ingest-ab.ts` — `mapVideoToAbRows`(52)·content 매칭·`judgeComponent` 재계산·`ab_variants` 멱등 upsert. 재사용.
- `src/performance/abVerdict.ts` — `judgeComponent`(41)·`pickContentVerdict`(88)·`AbScoreInput`/`AbThresholds`.
- `src/performance/ingest.ts` — `performance_metrics` 멱등 upsert.
- DB: `ab_variants` **component_type ∈ {'thumbnail','title'}**·unique(content_id,component_type,variant) / `performance_metrics`(metric_window 'd1'·ab_variant default 'overall'·ctr·unique(content_id,metric_window,ab_variant)) / `contents`(youtube_video_id·thumbnail_url·title·upload_date·ab_*).
- `src/lib/supabase/database.types.ts` — 위 타입(수기 유지).

## 작업
### 1) 읽기헬퍼 `src/lib/dashboard/copyLearnView.ts` (server-only)
```ts
export interface CopyLearnVariant { variant: "A"|"B"|"C"; text: string[]; watchShare: number|null; isWinner: boolean }
export interface CopyLearnVideo {
  id: string; youtubeVideoId: string|null; thumbnailUrl: string|null; title: string|null; uploadDate: string|null;
  ctr24h: number|null;                       // performance_metrics d1 overall
  thumbnail: CopyLearnVariant[];             // component_type='thumbnail'
  titleHasAbTest: boolean;                   // 제목 A/B 입력 모드
  titleVariants: CopyLearnVariant[];         // component_type='title' (A/B면 3개, 단일이면 1개)
}
export async function getCopyLearnVideos(): Promise<CopyLearnVideo[]>;
```
- `contents` 영상 목록 + 각 영상의 기존 `ab_variants`(thumbnail·title) + `performance_metrics`(d1·overall) 코드조인 폼 프리필. upload_date desc.

### 2) 서버액션 `src/app/actions/copyLearn.ts` (`"use server"`)
```ts
export interface CopyAbInput {
  contentId?: string; youtubeVideoId?: string; ctr24h: number | null;
  thumbnail: { variant: "A"|"B"|"C"; copyMain: string[]; copyBoxes: string[]; watchShare: number|null }[];
  title: { hasAbTest: boolean; variants: { variant: "A"|"B"|"C"; text: string; watchShare: number|null }[] };
}
export async function saveCopyAbResults(input: CopyAbInput): Promise<{ savedThumbnail: number; savedTitle: number; decided: boolean }>;
```
- `requireOwner()` → `createAdminClient()`. content 해석(youtubeVideoId/contentId → contents.id).
- **ab_variants 멱등 upsert** (component_type별):
  - 썸네일: onConflict(content_id,'thumbnail',variant), payload `{copy_main, copy_boxes}`, ctr_pct=watchShare, `judgeComponent('thumbnail')`로 rank/winner 재계산.
  - 제목: onConflict(content_id,'title',variant).
    - `hasAbTest=true`: 3변형 payload `{title}` + watchShare → `judgeComponent('title')`로 rank/winner.
    - `hasAbTest=false`: **단일 변형(variant='A')** payload `{title}`, watchShare=null, is_winner=true(영상 대표 제목). A/B 판정 안 함(영상간 학습은 step1).
- **performance_metrics 멱등 upsert** (content_id, 'd1', ab_variant='overall', ctr=ctr24h).
- **contents.ab_* 캐시 갱신**(썸네일 기준 `pickContentVerdict`; 제목 단일이면 영향 없음).
- `auditLog(action:"copy_ab_saved", targetType:"contents", targetId, detail:{thumb, titleMode, ctr24h})`.
- 멱등: 같은 입력 2회 → 행 수 불변.

### 3) `AuditAction`에 `copy_ab_saved` 추가
- DB audit_log.action CHECK 없음(확인됨) → TS union만.

## 주의 (구체)
- **멱등 upsert 필수**(onConflict). 이유: 재저장이 행을 늘리면 표본 오염.
- **rank·is_winner는 입력 맹신 말고 judgeComponent 재계산**(A/B 모드). 이유: 일관 판정.
- **제목 단일 모드는 A/B 판정/전이 안 함**(variant='A' 1행). 이유: 영상 내 비교 없음 — 영상간 CTR 상관은 step1.
- **이 step은 UI·학습 미침범**(step2·1). 저장 계층만.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수. 테스트는 DB 목/순수 매핑(네트워크 의존 금지).

## 테스트 (신규 `tests/copyLearnStore.test.ts`)
- 입력→ab_variants 매핑(순수 함수 추출): 썸네일 3변형 + 제목 A/B 3변형 / 제목 단일 1변형, performance d1 overall 1행.
- 멱등성: 같은 입력 매핑 2회 동일.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수).
2. 체크: 썸네일·제목(A/B·단일) 멱등 upsert·judgeComponent 재계산·contents.ab_* 파생·auditLog. UI/학습 미침범.
3. `phases/copy-learning-admin/index.json` step 0 갱신.

## 금지사항
- 비멱등 insert 금지. 이유: 표본 오염.
- 입력 rank/winner 맹신 금지(A/B는 judgeComponent). 이유: 일관 판정.
- 제목 단일 모드에 억지 A/B 판정 금지. 이유: 영상 내 비교 없음.
- UI·학습 수정 금지(step1·2). 이유: 범위.
- 라이브 DB·네트워크 의존 테스트 금지. 이유: 오프라인 $0.
- 기존 테스트를 깨뜨리지 마라.
