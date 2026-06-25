# Step 1: ctr-weighted-learning (학습 본체 — DB 소스 + CTR 점수 + 제목 주입)

**앱 내 재학습이 DB를 읽고 CTR(24h)을 점수에 반영하도록 바꾸고, 썸네일+제목 둘 다 학습·주입한다.** "관리자 입력 → 재학습" 루프를 실제로 닫는 핵심 step.

## 배경 (왜 이렇게 — 결정적 제약 + 제목 부재)
- `styleRelearnSweep`(`src/performance/styleRelearn.ts:101-102`)가 `loadAbResults()`(JSON)를 읽음 → **관리자 DB 입력이 반영 안 됨.** 학습 입력을 **DB**로 전환해야 한다.
- **제목은 학습된 스타일이 아예 없다**: `loadActiveTitleStyle`/`appendTitleStyle` 부재, hook_maker가 style_profile 미주입(`prepare.ts:49` `appendLearnedInsights`만). 썸네일 구조(loadActiveThumbnailStyle/appendThumbnailStyle)를 제목에 대응시킨다.
- 점수 1순위 = CTR(24h). 합성 = CTR(영상 크기) × A/B(영상 내 귀속). **제목 A/B 있으면 동일**, **단일이면 영상간 CTR 상관**(고CTR 제목=winner, 저CTR=loser). A/B(체류) 인자 유지로 낚시 방지.

## 읽어야 할 파일 (먼저 정독)
- `src/performance/styleRelearn.ts` — `styleRelearnSweep`(82~, loadAbResults→learnAbStylePatterns 호출 101-102)·provenance. **학습 입력 DB 전환·component 분기.**
- `scripts/learn-ab-style.ts` — `learnAbStylePatterns`(242)·`buildAbStyleInput`(172)·`verdictWeight`(122)·`loadAbResults`(378)·`AbResultVideo`/`AbStyleInputVideo`·`AB_STYLE_SYSTEM`. component_type='thumbnail_copy' 고정 → 분기 필요.
- `src/agents/shared/styleProfile.ts` — `loadActiveThumbnailStyle`(16)·`appendThumbnailStyle`(41)·`hasUsablePatterns`(31, 동일파일 재사용). **`loadActiveTitleStyle`/`appendTitleStyle` 추가.**
- `src/agents/hook_maker/prepare.ts` — `prepareHookMaker`·`HookMakerInput`·합성(`prepare.ts:49`). **제목 스타일 조건부 주입.**
- `src/agents/thumbnail_maker/prepare.ts` — 썸네일 스타일 주입 패턴(미러 참고, 변경 X).
- `src/performance/abVerdict.ts` — `judgeComponent`·`AbDecisiveness`·`config.ab`. **`ctrWeightedScore` 추가 위치.**
- `src/llm/config.ts` — `config.ab`. CTR env 추가.
- `tests/eval.test.ts`·`fixtures/parity/hook_maker/` — hook_maker 프롬프트 변경 시 promptHash 영향.

## 작업
### 1) 학습 입력을 DB에서 구성 (component 분기)
- 새 `loadAbResultsFromDb(supa, component: "thumbnail"|"title"): Promise<AbResultVideo[]>`(예: `src/performance/abLearnSource.ts`):
  - thumbnail/title-A/B: `ab_variants`(해당 component)+`performance_metrics`(d1 overall ctr)+`contents` → `AbResultVideo` 형태(variants[copy·watch_share]·영상 CTR).
  - **제목 단일(영상당 variant 1개)**: 영상별 (최종 제목, CTR24h) 목록 → **영상간 CTR로 순위** → 상위=winner·하위=loser로 묶어 `AbResultVideo` 형태 합성(영상 내 A/B가 없으니 영상간 대비로 학습 신호 생성).
- `styleRelearnSweep`의 `loadAbResults()`를 `loadAbResultsFromDb(supa, component)`로 교체하고 **thumbnail·title 각각 학습**(component 루프). CLI JSON 경로(learn-ab-style.ts)는 시드용 유지.

### 2) CTR 합성 가중 (순수함수·테스트) — `abVerdict.ts`
```ts
export function ctrWeightedScore(args: {
  decisiveness: AbDecisiveness; relativeLiftPct?: number; videoCtr24h: number|null; mode: "ab"|"single";
}): number;
```
- `mode="ab"`: 기존 `verdictWeight`(영상 내 귀속) × CTR 정규화(log1p·상한). inconclusive→0.
- `mode="single"`(제목 단일): 영상 내 비교 없음 → **CTR 크기 자체가 가중**(고CTR 제목=높은 양의 예시). 저CTR은 loser 대비로.
- `config.ab`에 `ctrNormCap`(기본 10)·`ctrBoostFactor`(기본 0.3) env.
- `buildAbStyleInput`/`learnAbStylePatterns` weight를 `ctrWeightedScore`로(기존 verdictWeight 자리·하위호환: CTR 없으면 동일).

### 3) component 분기 학습 — `learn-ab-style.ts`
- `buildAbStyleInput(videos, component)`·`learnAbStylePatterns(videos, component='thumbnail', config)` 시그니처에 component 추가(기본 thumbnail=하위호환). DB INSERT `component_type`을 `component==='title' ? 'title' : 'thumbnail_copy'`로.
- `recomputeVerdict`도 `judgeComponent(component, ...)`로 일반화.

### 4) 제목 스타일 로더·어펜더 — `styleProfile.ts`
- `loadActiveTitleStyle(supa)`(component_type='title'·status='active'·최신) + `appendTitleStyle(system, profile)`(thumbnail 미러: "김짠부 제목 스타일 사양" 섹션, `hasUsablePatterns` 재사용·없으면 system 불변).

### 5) hook_maker 주입 (조건부) — `hook_maker/prepare.ts`
- `const titleStyle = await loadActiveTitleStyle(supa); if (titleStyle) input.style_profile = titleStyle;`
- 합성: `const system = appendTitleStyle(appendLearnedInsights(HOOK_MAKER_SYSTEM, learned), titleStyle);`
- **활성 제목 프로필이 없으면(현재 상태) input/system 불변 → promptHash·hook_maker 픽스처 보존**(조건부 주입). 활성화 후에만 변동.

## 주의 (구체)
- **draft까지만. 자동 activate 금지.** 이유: 소표본 과적합·검수 게이트.
- **CTR 없을 때·활성 제목 프로필 없을 때 하위호환(기존 결과 동일).** 이유: 점진 전환·픽스처 보존·회귀 방지.
- **A/B(체류) 인자 유지·제목 단일은 CTR 상관**. 순수 CTR 최적화 금지. 이유: 낚시 드리프트.
- **CLI JSON 시드 경로 삭제 금지.** 앱 내 재학습만 DB.
- 오프라인 $0: 학습 LLM claude-p record, 테스트는 DB 목·순수함수.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트
- `ctrWeightedScore`: ab모드 CTR↑·decisive→가중↑ / CTR 없음→verdictWeight 동일 / inconclusive→0 / single모드 CTR 크기 가중 / 상한 클램프.
- `loadAbResultsFromDb`: 목 supa로 thumbnail·title-A/B·title-단일 3경로 매핑 검증.
- `appendTitleStyle`: 패턴 있으면 섹션 주입·없으면 system 불변. hook_maker 조건부 주입(활성 없으면 promptHash 불변).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수).
2. 체크: 재학습 DB 소스·component(thumbnail/title) 분기·CTR 합성·제목 단일 상관·제목 스타일 주입(조건부)·draft까지만·낚시 가드·hook_maker 픽스처 보존.
3. `phases/copy-learning-admin/index.json` step 1 갱신. summary에 **"실학습 효과는 관리자 입력→재학습→활성화 후 새 런으로 확인"** 포함.

## 금지사항
- 자동 activate 금지(draft까지). 이유: 과적합.
- A/B 인자 제거(순수 CTR) 금지. 이유: 낚시.
- 활성 제목 프로필 없는데 hook_maker 출력 변경 금지(조건부 주입). 이유: 픽스처·$0.
- CLI JSON 시드 경로 삭제 금지. 이유: 시드.
- 라이브 학습 과금 금지. 이유: $0.
- 기존 테스트를 깨뜨리지 마라.
