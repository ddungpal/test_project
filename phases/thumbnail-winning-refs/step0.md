# Step 0: winning-refs-core (우승 썸네일 랭킹 — 순수 함수 + DB 로더)

**`ab_variants` 우승 썸네일을 성과순으로 랭킹해 상위 N개를 few-shot 레퍼런스로 뽑는 모듈 + 단위테스트.** prepare 배선·SYSTEM 프롬프트는 **건드리지 않는다**(step1). 이 step은 **데이터/랭킹 계층만**.

## 배경 (왜 이렇게)
- 썸네일 생성기(`thumbnail_maker`)가 만드는 메인문구가 약하고 안-김짠부답다. **근본원인**: `src/agents/thumbnail_maker/prepare.ts:34`가 레퍼런스를 `corpus_components`(type='thumbnail_copy', is_final)에서 읽는데 **라이브 0건** → 생성기가 **김짠부 실제 썸네일을 하나도 못 본다.** 추상 스타일 패턴만 보고 추론하니 약하다.
- 정작 우승 썸네일들("월 200 재테크 로드맵 / 이 순서를 모르면 3년을 버립니다" 등)은 `ab_variants`(component_type='thumbnail')에 **점유율·CTR·조회수와 함께 이미 저장**돼 있다(`/copy-learn`이 적재). 단 **학습(copy-learn relearn) 때만 쓰고 생성엔 미노출**이다.
- **방법 A** = 이 우승 썸네일을 **성과순 랭킹**해 상위 8개를 prepare가 few-shot으로 주입하게 한다. 추상 규칙보다 **실제 고성과 예시**가 훨씬 강한 신호다.
- 이 step은 그 랭킹 함수만 만든다. **"조회수 잘나온 레퍼런스"** = 점유율(watch_share) × 영상 CTR × 조회수 신뢰도(vconf, 이미 있는 `viewsConfidence` 재사용).

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` — FE/BE/DB 계층 지도.
- `CLAUDE.md` — 핵심 결정·비용($0)·데이터 3층.
- `src/performance/abLearnSource.ts` — **이 step의 모범 패턴.** `loadAbResultsFromDb`(62)가 `ab_variants(component) + performance_metrics(d1·overall, ctr·views) + contents(topic)`를 **코드 조인**하는 방식을 그대로 미러하라. payload 복원(`payloadToVariantFields`, 22)도 참고.
- `src/performance/abVerdict.ts` — `viewsConfidence`(149, **현재 private → export 해야 함**)·`ctrWeightedScore`(166)·`AbThresholds`. vconf 로직을 **재구현하지 말고 export해 재사용**하라.
- `src/app/actions/copyLearnMap.ts:36,58` — ab_variants 썸네일 payload 형태 = **`{copy_main: string[], copy_boxes: string[]}`**, `ctr_pct`=watchShare(점유율). 이게 우승작의 실제 메인/박스 문구다.
- `src/llm/config.ts:52,99` — `ab.viewsConfFloor`(env `AB_VIEWS_CONF_FLOOR`, 기본 0.5). floor를 여기서 읽어 넘긴다.
- `src/pipeline/runState.ts` — `Supa` 타입.

## 작업
### 1) `src/performance/abVerdict.ts` — `viewsConfidence` export (한 줄)
- `function viewsConfidence(...)`(149)를 `export function viewsConfidence(...)`로. **로직·시그니처 변경 금지** — export 키워드만. 이유: vconf 정규화를 step0에서 복제하면 드리프트(같은 수식 두 곳).

### 2) 신규 `src/agents/thumbnail_maker/winningRefs.ts` — 랭킹 모듈
반환 타입:
```ts
export interface WinningThumbnailRef {
  id: string;       // "style:winner:<content_id>" — 후보가 이걸 따랐으면 evidence_ids에 링크(날조 방지)
  topic: string;    // 영상 라벨(contents.topic ?? title ?? id)
  main: string[];   // 우승 썸네일 메인문구(payload.copy_main)
  boxes: string[];  // 우승 썸네일 박스문구(payload.copy_boxes)
}
```
순수 랭킹 함수(테스트 대상 — DB 무관):
```ts
// 내부 행 형태(로더가 조인해 만든 것). 점유율·CTR·조회수 + 복원된 카피.
interface WinningRow {
  content_id: string;
  topic: string;
  main: string[];
  boxes: string[];
  watchShare: number | null; // ab_variants.ctr_pct(점유율 슬롯)
  ctr: number | null;        // performance_metrics d1 overall CTR
  views: number | null;      // performance_metrics d1 overall 조회수
}

/** 성과순 top N. score = watchShare × ctr × viewsConfidence(views, viewsReference, floor).
 *  null 인자는 ×1(우승작 누락 방지). 동률 tie-break = views 내림차순(결정성). main/boxes 빈 행은 제외. */
export function rankWinningThumbnails(rows: WinningRow[], viewsReference: number | null, floor: number, limit: number): WinningThumbnailRef[];
```
DB 로더:
```ts
/** ab_variants(thumbnail·is_winner) + perf(d1 overall) + contents 조인 → 성과순 top N.
 *  우승작 없으면 [](호출자가 필드 생략 → promptHash 불변). viewsReference=조인 행들의 views 최댓값. floor=config.ab.viewsConfFloor. */
export async function loadWinningThumbnailRefs(supa: Supa, limit?: number): Promise<WinningThumbnailRef[]>;
```
- `loadWinningThumbnailRefs`의 기본 `limit`은 **8**.
- 조인 절차(abLearnSource 미러): `ab_variants` where `component_type='thumbnail'` and `is_winner=true` → content_id 모아 `contents`(topic·title)·`performance_metrics`(d1·overall: ctr·views) 조회 → `WinningRow[]` 구성 → `viewsReference = max(views)`(전부 null이면 null) → `rankWinningThumbnails` 호출.
- payload 복원: `payload.copy_main`(string[])·`payload.copy_boxes`(string[]). 형태 깨진 행(빈 main)은 랭킹에서 제외.
- floor는 `loadConfig().ab.viewsConfFloor`(또는 동등 경로)에서.

## 주의 (구체)
- **`viewsConfidence`는 재구현하지 마라. export해 import하라.** 이유: 수식 중복 시 한 곳만 고쳐 드리프트(copy-views-weight가 박은 단일 출처 원칙).
- **로더는 우승작 0건 → 반드시 `[]` 반환.** 이유: step1이 `length>0`일 때만 주입 → 빈 결과가 곧 promptHash 불변 보장(오프라인 픽스처·eval 보존). 이 계약이 이 phase의 핵심 안전망이다.
- **`rankWinningThumbnails`는 순수**(DB·시각·env 접근 금지). 이유: 테스트 용이성. floor·viewsReference는 인자로만.
- **null 안전**: watchShare/ctr가 null이면 그 인자만 ×1(우승작을 떨구지 마라). views null이면 vconf=1.0(viewsConfidence가 이미 방어). 이유: 일부 지표 없는 우승작도 레퍼런스로 가치 있음.
- **`payload`는 `unknown`으로 받아 좁혀라**(abLearnSource의 `payloadToVariantFields` 방식). copy_main/copy_boxes가 배열이 아니면 빈 배열 처리. 이유: jsonb 형태 비보장.
- 이 step은 **prepare.ts·schema.ts·UI 미침범**(step1). 모듈만 추가 + export 한 줄.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트 (`tests/winningRefs.test.ts` 신규)
`rankWinningThumbnails` 순수 함수만 테스트(DB 불필요):
- 빈 입력 → `[]`.
- 성과순 정렬: watchShare·ctr·views 높은 행이 앞. 점수 동률이면 views 큰 쪽 먼저(결정성).
- `limit` 절단: 행 10개·limit 8 → 8개.
- null 안전: watchShare/ctr null인 행도 포함되되 ×1로 점수 계산(크래시 없음). views null 행은 vconf=1.0.
- main 빈 행(`main:[]`)은 결과에서 제외.
- viewsReference null/0 → vconf=1.0(전부 동일 가중)이어도 watchShare·ctr로 정렬됨.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. 위 AC 실행(Joy가 직접 실행해 exit code 확보).
2. 체크:
   - `viewsConfidence`는 export만 됐고 로직 무변경인가? 재구현 없는가?
   - `loadWinningThumbnailRefs`가 우승작 0건에 `[]`를 반환하는가(계약)?
   - `rankWinningThumbnails`는 순수한가(DB·env 의존 없음)?
   - ARCHITECTURE.md 계층·CLAUDE.md 규칙 위반 없는가?
3. `phases/thumbnail-winning-refs/index.json` step 0 갱신: 성공 → `"status":"completed"` + `"summary"`(생성 파일·핵심 결정 한 줄). 실패 3회 → `error`. 외부개입 필요 → `blocked`.

## 금지사항
- `viewsConfidence`를 winningRefs.ts에 복제 구현하지 마라. 이유: 수식 단일 출처(드리프트 차단).
- `prepare.ts`/`schema.ts`/UI를 수정하지 마라. 이유: step1 범위.
- 우승작이 없을 때 빈 배열 외의 값(더미·placeholder)을 반환하지 마라. 이유: promptHash 불변 계약이 깨져 기존 픽스처 무효화.
- `rankWinningThumbnails`를 비순수로 만들지 마라(DB·config 직접 조회 금지). 이유: 순수성·테스트.
- 기존 테스트를 깨뜨리지 마라.
