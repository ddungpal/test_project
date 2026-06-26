# Step 2: correction-relearn-merge (교정쌍을 재학습 루프에 합성 A/B로 합류)

**교정쌍을 ideal=winner/gen=loser의 합성 A/B로 변환해 기존 재학습(styleRelearnSweep)에 합류시킨다.** 사람판정 decisive·CTR무관. UI는 step3.

## 배경 (왜 이렇게 — 합류 설계)
- 합류 설계: 교정쌍 = 합성 A/B(이상=winner, 생성=loser). 기존 `learnAbStylePatterns`가 winner↔loser 차이를 patterns/banned로 뽑으므로, 교정쌍을 입력에 합류시키면 '차이 분석+학습'이 재사용된다(방금 고친 fold·존댓말 어투 포함).
- **CTR 없음·사람 판정**: 교정은 시장성과(CTR)가 아니라 김짠부 명시 선호다. 기존 `buildAbStyleInput`의 `learn_mode==="single"` 특수 경로(decisive·고정가중)를 **미러해 `"correction"` 경로**를 추가한다(judgeComponent CTR 판정을 안 타게 — CTR 없으면 inconclusive로 스킵되므로).
- **멱등**: 교정의 `learned_at` 스탬프로 처리(provenance/CHECK 안 건드림 — 함정 회피).

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md`.
- `scripts/learn-ab-style.ts` — **핵심.** `AbResultVideo`/`AbResultVariant`(61,73)·`learn_mode`(86)·`buildAbStyleInput`(164)의 **`learn_mode==="single"` 블록(182-204)**(이걸 미러). `joinCopy`·`ctrWeightedScore`·`verdictWeight`.
- `src/performance/abLearnSource.ts` — `loadAbResultsFromDb`(62)가 ab_variants→AbResultVideo로 합성하는 방식(payloadToVariantFields 등). 교정 로더의 본보기.
- `src/performance/styleRelearn.ts` — **수정 대상.** `styleRelearnSweepComponent`(97): `countCurrentAbSamples`(53)·`loadLatestStyleProfile`·`countTrainingSources`·적격판정·`loadAbResultsFromDb`(122) 호출·draft/provenance insert.
- `src/performance/abVerdict.ts` — `ctrWeightedScore`/`verdictWeight`·`AbThresholds`(가중).
- step0 `thumbnail_corrections` 테이블·`learned_at`.

## 작업
### 1) `AbResultVideo.learn_mode` 유니온에 `"correction"` 추가 (scripts/learn-ab-style.ts)
- `learn_mode?: "ab" | "single" | "correction"`.

### 2) `buildAbStyleInput` — `"correction"` 경로 (single 블록 미러)
- `video.learn_mode === "correction"`이면: winner=`is_winner` 변형(이상), losers=나머지(생성). **verdict="decisive"**(사람판정), **weight = verdictWeight("decisive")**(=1.0, CTR·vconf 무관). winner 카피·loser 카피를 그대로 out에 push.
- inconclusive 스킵·judgeComponent 재계산을 **타지 않는다**(CTR 없음). single 블록과 동형.

### 3) 교정 로더 — `loadCorrectionResults(supa, component): Promise<AbResultVideo[]>` (신규, 예: `src/performance/correctionLearnSource.ts`)
- `thumbnail_corrections` where `component_type=component` 로드 → 각 행을 AbResultVideo로 합성:
  - `variants` = [ {variant:"A", is_winner:true, ...ideal_payload→AbResultVariant필드}, {variant:"B", is_winner:false, ...gen_payload} ]
  - `learn_mode:"correction"`, `topic:topic ?? "(교정)"`, CTR/views 없음(undefined).
- payload→AbResultVariant 필드 변환은 abLearnSource의 방식 재사용(copy_main/copy_boxes/title).

### 4) `styleRelearnSweep` 합류 + 적격 + 스탬프
- `styleRelearnSweepComponent`에서 학습 입력을 **합류**: `const videos = [...await loadAbResultsFromDb(supa, component), ...await loadCorrectionResults(supa, component)]`.
- **적격 판정 확장**: 기존(ab_variants 표본 증가) **OR 미학습 교정(`learned_at IS NULL`)이 존재**하면 적격. (둘 다 아니면 스킵 — 멱등.)
- **스탬프**: 재학습이 성공해 draft가 만들어지면, 이번에 포함된 교정들의 `learned_at`을 now로 update. → 다음 sweep에서 미학습 교정 0건이면 (ab도 안 늘었으면) 스킵.
- 교정만 있고 ab_variants가 0이어도 동작해야 한다(교정 단독 학습 가능).

## 주의 (구체)
- **correction 경로는 CTR/vconf 무관 고정 decisive 가중**. 이유: 교정은 사람 선호(시장성과 아님). single처럼 judgeComponent를 안 탄다.
- **멱등은 learned_at으로만**: profile_training_sources/pts_has_source CHECK를 건드리지 마라. 이유: 캐스케이드 CHECK 함정(과거 deleteRun 사건). 교정은 전용 테이블이라 provenance와 분리.
- **하위호환**: 교정 0건이면 styleRelearnSweep는 기존과 **완전히 동일**(loadCorrectionResults=[]·적격판정 기존대로). 이유: 기존 재학습 회귀 0.
- **draft 활성화는 그대로 사람게이트**(activateCopyStyle). 이 step은 draft까지만. 이유: 과적합 방지·기존 정책.
- 교정 winner를 winningRefs(고성과 썸네일 few-shot)에 넣지 마라 — winningRefs는 ab_variants(is_winner) 기준이고 교정은 전용 테이블이라 자동 분리됨. 확인만.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트
- `buildAbStyleInput` correction 케이스: ideal=winner·gen=loser → decisive·weight=1.0·winner/loser 카피 정확. CTR 없어도 스킵 안 됨(single처럼).
- `loadCorrectionResults` 합성(모의 supa 또는 순수 변환부 분리 테스트).
- 적격 판정: 미학습 교정 존재→적격 / 전부 학습됨+ab 불변→스킵.
- 하위호환: 교정 0건이면 기존 sweep 동작 불변.
- 기존 styleRelearn·learn-ab-style 테스트 보존.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy). 2. 체크: correction 경로 decisive·CTR무관·합류·learned_at 멱등(provenance 미접촉)·교정0건 하위호환·draft 사람게이트. 3. index.json step2 갱신.

## 금지사항
- profile_training_sources/pts_has_source CHECK를 건드리지 마라. 이유: 캐스케이드 함정. 멱등은 learned_at.
- 교정을 활성화까지 자동화하지 마라. 이유: 사람게이트(과적합 방지).
- 교정 0건일 때 기존 재학습 동작을 바꾸지 마라. 이유: 회귀.
- step0 테이블·step1 diff·step3 UI를 바꾸지 마라(시그니처 사용만). 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
