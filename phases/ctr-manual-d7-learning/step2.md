# Step 2: ctr-input-screen (CTR 수동입력 화면 — owner 전용)

## 배경 (자기완결)

전체 설계: `docs/specs/2026-07-16-ctr-manual-d7-learning-design.md` (읽어라, §변경3).

노출클릭률(CTR)은 YouTube Analytics API가 주지 않아 김짠부가 **Studio '도달범위' 탭을 보고 직접 입력**한다(확정 결정). 이 step은 `/copy-learn`(학습 허브)에 **발행 영상별 d7 노출클릭률 입력 섹션**을 추가한다.

입력된 CTR은 `performance_metrics(content_id, 'd7', 'overall').ctr`에 저장되고(step 0 병합으로 자동수집 views와 공존), step 1이 바꾼 d7 랭킹 학습이 이 값을 쓴다. 저장 후 기존 `/copy-learn` 재학습 버튼을 누르면 d7 CTR 순위로 제목·썸네일이 재학습된다.

## 읽어야 할 파일

- `docs/specs/2026-07-16-ctr-manual-d7-learning-design.md` — §변경3.
- `src/app/actions/copyLearn.ts` — 서버액션 패턴(`requireOwner()` → service-role → `auditLog` best-effort → `revalidatePath`). `saveCopyAbResults`·`updateContentTitle`를 본보기로. **여기에 새 액션 추가**.
- `src/app/actions/auth.ts` — `requireOwner()`(액션)·`requireOwnerPage()`(페이지).
- `src/performance/ingest.ts` — `ingestPerformance(supa, entries, thresholds)` 재사용(step 0에서 병합됨). `loadConfig().ab`로 thresholds.
- `src/performance/types.ts` — `PerformanceEntry`·`MetricInput`.
- `src/lib/dashboard/copyLearnView.ts` — `getCopyLearnVideos` 로더 패턴(contents+perf 조인). 여기에 **focused 로더 추가**.
- `src/app/copy-learn/page.tsx`·`src/components/CopyLearningForm.tsx` — 페이지 조립·폼 패턴·TRUS 디자인(Black/Yellow/White·격동고딕·강렬직설). 새 섹션은 이 톤으로.
- `.claude/rules/rules.md` — "단위 테스트할 순수 헬퍼는 컴포넌트가 아니라 `src/lib/**`에 두고 export(컴포넌트는 re-export만)" 규칙 준수.

## 작업

### 1) 순수 헬퍼 `src/lib/performance/ctrInput.ts` (신규)

vitest로 테스트할 순수 로직만(컴포넌트·DB 없음):
- `parseCtrInput(raw: string): { ok: true; ctr: number } | { ok: false; error: string }` — 빈값/비숫자/범위밖(0 < ctr ≤ 100) 거부, 통과 시 number. (예: "3.8"→ok 3.8, "0"→error, "150"→error, ""→error.)
- 필요하면 표시용 포맷 헬퍼(예: `formatCtr(n|null)`)도 여기.

### 2) 로더 `getCtrInputVideos` — `copyLearnView.ts`에 추가

발행 영상(youtube_video_id·upload_date 있는 contents) 목록 + **d7** overall의 현재 views·ctr:
```ts
export interface CtrInputVideo {
  contentId: string;
  title: string;
  uploadDate: string | null;
  d7Views: number | null;   // 자동수집(YouTube API)
  d7Ctr: number | null;     // 수동입력된 노출클릭률(없으면 null)
}
export async function getCtrInputVideos(): Promise<CtrInputVideo[]>
```
- contents 조회는 `getCopyLearnVideos`처럼 `createAdminClient()`, `.not("youtube_video_id","is",null)`, `upload_date desc`.
- `performance_metrics` 조회는 `.eq("metric_window","d7").eq("ab_variant","overall")`로 views·ctr.

### 3) 서버액션 `submitVideoCtr` — `copyLearn.ts`에 추가

```ts
export async function submitVideoCtr(contentId: string, ctrRaw: string): Promise<{ saved: boolean }>
```
- `const ownerId = await requireOwner();`
- `parseCtrInput(ctrRaw)` — 실패 시 throw(명확한 한글 메시지).
- `ingestPerformance(supa, [{ content_id: contentId, metrics: [{ window: "d7", ctr }] }], loadConfig().ab)` 호출. **views·avg_view_pct는 넘기지 않는다**(step 0 병합이 자동수집 값 보존). ★ ab는 넘기지 않음(overall CTR만).
- `auditLog(supa, { actorId: ownerId, action: "video_ctr_submitted", targetType: "content", targetId: contentId, detail: { ctr } })` best-effort.
- `revalidatePath("/copy-learn")`.

### 4) 컴포넌트 `src/components/PerformanceInputForm.tsx` (신규·클라이언트)

- props: `videos: CtrInputVideo[]`.
- 영상별 한 줄: 제목·업로드일·현재 d7 조회수(자동수집)·CTR 입력칸(placeholder 예 "3.8", 현재값 프리필)·저장 버튼 → `submitVideoCtr(contentId, value)` 호출. 성공/실패 인라인 표시.
- 순수 로직(검증·포맷)은 `ctrInput.ts`에서 import만(컴포넌트에 로직 두지 마라 — rules.md).
- TRUS 디자인 톤. "노출클릭률은 Studio '도달범위' 탭에서 확인해 입력" 안내 한 줄.

### 5) 페이지 `copy-learn/page.tsx` — 섹션 추가

- `getCtrInputVideos()`를 기존 `Promise.all`에 추가.
- 기존 학습 폼과 함께 `<PerformanceInputForm videos={ctrVideos} />` 섹션 렌더(제목 예 "📊 성과 입력 (노출클릭률)"). `requireOwnerPage()`는 이미 상단에 있음.

### 6) 테스트

`tests/ctrInput.test.ts`(순수 헬퍼): parseCtrInput의 ok/범위밖/빈값/비숫자 케이스. (서버액션·컴포넌트는 순수 헬퍼로 커버 — DB/렌더 테스트는 만들지 마라, YAGNI.)

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- stale `.next` 깨짐 시 `rm -rf .next`(dev 켜져 있으면 kill→build→재기동). dev 켠 채 build 금지.
- `/copy-learn` 빌드 포함, 0 실패.

## 검증 절차

1. AC 실행.
2. parseCtrInput 테스트 통과.
3. 배선 확인: page → getCtrInputVideos → PerformanceInputForm → submitVideoCtr → ingestPerformance(step 0 병합) 경로가 타입상 이어지는지.
4. `git status`로 범위 외 untracked(fixtures 등) 제외 — 신규/수정 파일만 add.
5. `phases/ctr-manual-d7-learning/index.json` step 2 갱신.

## 금지사항

- 자동 업로드·Studio CSV 파싱·브라우저 자동화 금지(사람이 숫자만 입력 — 비목표).
- A/B 변형별 CTR 입력 UI 금지(이번 범위는 영상별 overall CTR — 변형 CTR은 기존 manual.json 경로가 담당).
- 학습 자동 활성화 금지(재학습은 기존 버튼·draft 게이트 유지).
- 순수 로직을 컴포넌트 파일에 두지 마라(vitest alias 사각지대 — rules.md).
- 마이그·새 컬럼·의존성 금지.
