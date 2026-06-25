# Step 2: copy-learn-ui (관리자 페이지 — 썸네일·제목)

**owner 전용 '문구 학습' 페이지.** 영상별로 썸네일 변형 + 제목(체크박스 A/B/C 또는 단일) + CTR(24h)을 입력·저장 → '재학습' → 최근 draft 검수 → 활성화. step0(저장 액션)·step1(DB 학습) 위에 UI를 얹는다.

## 배경
- step0: `getCopyLearnVideos`(읽기헬퍼)·`saveCopyAbResults`(저장 액션, 썸네일+제목).
- step1: 재학습이 DB를 읽고 CTR 가중으로 thumbnail_copy·title draft 생성. `style/relearn.requested`로 트리거.
- 이 step: 사람이 쓰는 화면 + 재학습·활성화 트리거.

## 읽어야 할 파일 (먼저 정독)
- `src/app/insights/page.tsx` — owner 페이지 표준(force-dynamic·`requireOwnerPage`·devBypass·읽기헬퍼→클라). 본보기.
- `src/components/InsightCard.tsx` — 클라 상호작용(useTransition·router.refresh·에러표시·TRUS 버튼). 폼 본보기.
- `src/app/layout.tsx` — 네비. "문구 학습" 링크 추가.
- `src/app/actions/auth.ts` — `requireOwnerPage`·`requireOwner`·`isDevBypass`.
- `src/lib/dashboard/copyLearnView.ts` (step0) — `getCopyLearnVideos`·`CopyLearnVideo`.
- `src/app/actions/copyLearn.ts` (step0) — `saveCopyAbResults`. 여기에 재학습·활성화 추가.
- `src/inngest/client.ts` — `style/relearn.requested`.
- `scripts/activate-style.ts` — draft→active 승격 로직(component별 active 1개 유지). 포팅 대상.
- `src/agents/shared/styleProfile.ts` — 활성/draft 조회 참고.
- `DESIGN.md` / `design/design-system/trus-create/*` — TRUS 톤(검정/노랑/흰 3색·격동고딕·직각·그라데이션/그림자 금지).

## 작업
### 1) 서버액션 추가 (`copyLearn.ts`)
```ts
export async function requestCopyRelearn(): Promise<{ initiated: boolean }>;              // inngest.send("style/relearn.requested") + auditLog
export async function activateCopyStyle(component: "thumbnail"|"title", version?: number): Promise<{ activated: number }>; // activate-style 로직(component별) + auditLog
```
- 최근 draft 조회는 `copyLearnView.ts`에 `getCopyStyleDrafts()` 추가(style_profiles thumbnail_copy·title version desc·status·patterns 요약).
- `AuditAction`에 `copy_relearn_requested`·`copy_style_activated` 추가.

### 2) 페이지 `src/app/copy-learn/page.tsx`
- `force-dynamic`·`requireOwnerPage()`·devBypass 배너·`getCopyLearnVideos()`+`getCopyStyleDrafts()` → 클라 컴포넌트.

### 3) 컴포넌트 `src/components/CopyLearningForm.tsx` (`"use client"`, Esther)
- 영상 카드 목록: 썸네일 이미지+제목+업로드일 + **영상 CTR(24h) 입력 1칸**.
- **썸네일 섹션**: 변형 A/B/C(메인문구 2·박스 2 직접입력 + 점유율 + winner).
- **제목 섹션**: **체크박스 "제목 A/B/C 테스트 있음"** —
  - 켜짐: 제목 3개(A/B/C) + 각 점유율(%) 입력.
  - 꺼짐: **최종 제목 1개** 입력칸만(점유율 없음, CTR로 학습).
- **저장 버튼**(`saveCopyAbResults`) — 영상별.
- 상·하단: **재학습 버튼**(`requestCopyRelearn`) + **최근 draft 보기**(thumbnail_copy·title patterns 요약) + **활성화 버튼**(component별 `activateCopyStyle`).
- useTransition·router.refresh·에러표시·pending 잠금. 입력 많으니 영상별 접기/펼치기.
- TRUS: 노랑 CTA·직각·그림자/그라데이션 없음·격동고딕.

### 4) 네비 링크 (`layout.tsx`)
- "문구 학습" `<a href="/copy-learn">` 추가.

## 주의 (구체)
- **체크박스로 제목 A/B↔단일 토글**(step0 입력 모델 `title.hasAbTest`와 일치). 이유: 데이터 형태 일관.
- **활성화는 명시 버튼·component별(사람 게이트).** 이유: 소표본 자동 덮어쓰기=과적합.
- **owner 게이트 필수**(`requireOwnerPage`·액션 `requireOwner`). 이유: 보안.
- **썸네일 문구는 메인 2·박스 2 구조**(스키마·step0 payload 일치). 이유: 학습·생성 일관.
- step0·step1 시그니처 변경 금지(여기선 호출만). 이유: 범위.
- 라이브 트리거(inngest)는 dev 실제 발행 — 테스트는 액션 단위(목)·페이지 빌드.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수). build에 `/copy-learn` 라우트 포함 확인.
2. 체크: owner 게이트·저장/재학습/활성화·제목 체크박스 토글·TRUS 톤·네비·썸네일 메인2박스2.
3. `phases/copy-learning-admin/index.json` step 2 갱신. summary에 **"실사용: /copy-learn 입력→재학습→활성화→새 런 확인(사용자)"** 포함.

## 금지사항
- 자동 활성화 금지(명시 버튼). 이유: 과적합 게이트.
- owner 게이트 누락 금지. 이유: 보안.
- step0·step1 시그니처 변경 금지. 이유: 범위.
- 3색 외 색·그라데이션·그림자 금지(TRUS). 이유: 디자인 규칙.
- 기존 테스트를 깨뜨리지 마라.
