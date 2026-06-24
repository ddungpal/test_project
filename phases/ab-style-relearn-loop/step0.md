# Step 0: style-relearn-sweep

**A/B 스타일 학습을 지속 루프로.** 새 A/B 표본이 마지막 style_profile 학습 이후 늘면 재학습 draft를 자동 제안한다(사람이 검수→activate). 회고 sweep과 동일한 멱등 패턴.

## 배경
- 현재 썸네일 스타일은 2026-06-23 1회 학습 후 고정(`style_profiles thumbnail_copy v1 active`). 새 Test&Compare 결과(`corpus/thumbnails/ab-results.json` 추가 → ingest-ab → `ab_variants`)가 와도 자동 재학습 없음 — 수동 `learn-ab-style → commit → activate` 필요.
- **회고 자동화와 똑같은 구조로 푼다**: 조건 충족 시 sweep이 draft를 만들고, 사람이 승인. 과적합·자동덮어쓰기 방지 위해 **draft까지만**(activate는 사람).

## 읽어야 할 파일 (먼저 정독)
- `src/agents/retrospectivist/runRetrospective.ts` — `eligibleForRetrospective(withPerformance, withRetrospective, limit)`(순수·96줄)·`retrospectiveSweep(supa, opts)`(120줄, 멱등: 대상만 처리·이미 있으면 제외). **이 패턴을 복제.**
- `src/inngest/functions/retrospectiveCron.ts` — 트리거 3개(cron + event + 수동 `retro/sweep.requested`)·`createAdminClient`·`step.run`. **미러.**
- `scripts/learn-ab-style.ts` — 재학습 본체(buildAbStyleInput→callLLM→`style_profiles` draft + `profile_training_sources`). sweep이 이걸 호출(또는 핵심 함수 재사용). `--commit` 경로 = draft 저장.
- `src/agents/shared/styleProfile.ts` — `loadActiveThumbnailStyle`·style_profiles status(draft/active/retired). `scripts/activate-style.ts` — 활성화(사람게이트).
- `src/inngest/client.ts` — 이벤트 추가 패턴(StageData 외 이벤트들).

## 작업
### 1) 순수 적격 판정 `eligibleForStyleRelearn`
```ts
// 마지막 thumbnail_copy style_profile 학습 시점(또는 학습에 쓰인 표본수) 대비 현재 A/B 표본이 늘었나.
export function eligibleForStyleRelearn(args: {
  currentAbSampleCount: number;     // 현재 decisive+marginal A/B 영상 수(또는 ab_variants 기준)
  lastLearnedSampleCount: number;   // 마지막 style_profile이 학습한 표본 수(provenance/메타에서)
  minDelta?: number;                // 최소 증가분(기본 1 또는 3 — 소표본 흔들림 방지)
}): boolean;
```
- 순수·결정적. 표본이 `minDelta` 이상 늘었을 때만 true. 동률/감소 → false(멱등·무의미 재학습 차단).

### 2) sweep `styleRelearnSweep(supa, opts)`
- 현재 A/B 표본수 집계(ab_variants thumbnail 또는 ab-results) + 마지막 active/최신 style_profile의 학습 표본수 비교 → `eligibleForStyleRelearn`.
- 적격이면 `learn-ab-style`의 핵심(buildAbStyleInput→callLLM→draft 저장)을 1회 실행 → `style_profiles` **status='draft'** 새 version + provenance. **이미 같은 표본으로 만든 draft가 있으면 스킵**(멱등 — 회고 sweep의 "이미 있으면 제외"와 동일).
- 활성화는 안 함(사람게이트). 반환=생성된 draft id 또는 'skipped'.

### 3) Inngest 함수 `src/inngest/functions/styleRelearnCron.ts`
- 트리거: 수동 `style/relearn.requested`(필수) + (선택) cron(예: 주1회). retrospectiveCron 미러(concurrency 1·retries·onFailure). client.ts에 이벤트 추가, functions 레지스트리 등록.
- (선택) 수동 트리거용 서버 액션(`src/app/actions/` — "스타일 재학습" 버튼용). UI 버튼은 이 step 필수 아님(액션만 둬도 됨).

## 주의
- **draft까지만 — activate 금지(사람게이트).** 이유: A/B 소표본 자동 덮어쓰기 = 과적합·품질 역행 위험. 사람이 검수 후 `activate-style`.
- **멱등 필수**: 같은 표본으로 중복 draft 만들지 마라(회고 sweep 패턴). 재시도·중복이벤트 안전.
- 재학습 LLM = claude-p($0). record/replay·CostGuard는 기존 learn-ab-style 방식 따름.
- 순수 함수(`eligibleForStyleRelearn`)는 DB 0 — 테스트는 이걸로. sweep/Inngest는 타입·빌드로.
- 데이터 경로: A/B는 수동 Test&Compare→ab-results.json→ingest-ab. 자동감지는 **표본수 변화** 기준(파일 watch 아님).
- exactOptionalPropertyTypes·noUncheckedIndexedAccess 준수.

## 테스트 (`tests/styleRelearn.test.ts`)
- `eligibleForStyleRelearn`: 표본 5→5 → false. 5→8(minDelta 1) → true. 8→6(감소) → false. minDelta 3에서 5→7 → false, 5→8 → true.
- (가능하면) sweep 멱등 로직의 순수 부분(이미 draft 있으면 스킵 판정)을 분리해 테스트.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. (가능하면) 라이브: 수동 트리거 1회 → draft 1건 생성, 2회차(표본 불변) → 0건(멱등). 활성화 안 됨 확인. (DB 필요 → 헤드리스면 순수 테스트+빌드 갈음, 라이브는 사용자.)
3. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"eligibleForStyleRelearn 순수판정(표본 minDelta 증가시만) + styleRelearnSweep 멱등(중복 draft 스킵·activate 안함) + Inngest styleRelearnCron(수동 style/relearn.requested + 선택 cron) + 테스트. draft까지만·사람게이트. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- 자동 activate 금지(사람게이트).
- 비멱등 재학습 금지(중복 draft).
- hook_maker·UI 수정 금지(범위 밖).
- 기존 테스트를 깨뜨리지 마라.
