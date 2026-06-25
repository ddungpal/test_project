# Step 0: views-score-core (스코어 코어 — 조회수 신뢰도 가중)

**`ctrWeightedScore`에 24h 조회수 기반 '신뢰도 가중'(vconf)을 추가하는 순수 함수 + config 노브 + 단위테스트.** DB·UI 무관. 이 step은 **도메인/순수 계층만** — 데이터 배선은 step1, UI는 step2.

## 배경 (왜 이렇게)
- 현재 학습 가중 `ctrWeightedScore`(`src/performance/abVerdict.ts:153`)는 **A/B 결정력(영상 내 귀속) × CTR 크기**만 본다. CTR은 *비율*이라 **몇 명한테서 잰 비율인지(reach)를 모른다**.
- 결과: 24h에 500뷰 받은 영상의 CTR 8%와 20만뷰 영상의 CTR 8%가 **학습에서 동일 가중** → 저조회 우연 고CTR이 검증된 히트만큼 스타일을 끌어당김(= "조회수 높아지면 썸네일 평가 불명확"의 정체).
- 해결: 24h 조회수를 **신뢰도(reach) 축**으로 넣어, 점수에 confidence factor `vconf`를 곱한다. 고조회=신뢰↑, 저조회=신뢰↓.
- **상대 기준(절대 cap 아님)**: `viewsReference`(코퍼스에서 가장 많이 본 영상의 24h 조회수)를 분모로 한 log 상대 정규화. 데이터가 쌓일수록 reference가 같이 정밀해지는 자기보정 구조. reference는 이 step에서 계산하지 않고 **호출자(step1, buildAbStyleInput)가 인자로 넘긴다** — 이 함수는 순수 유지.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` — FE/BE/DB 계층 지도.
- `docs/tech.md` — §13.2 CTR 합성 가중(이 함수의 설계 근거).
- `CLAUDE.md` — 핵심 결정·비용($0).
- `src/performance/abVerdict.ts` — **이 step의 주 수정 대상.** `ctrWeightedScore`(153)·`normCtr`(137)·`verdictWeight`(119)·`CtrWeightArgs`(127). 기존 패턴(log1p 정규화·clamp·하위호환)을 **그대로 미러**하라.
- `src/llm/config.ts` — `ab` 블록 타입(42)·`loadConfig` ab 기본값(85). `ctrNormCap`/`ctrBoostFactor`가 env로 노출된 방식.
- `tests/ctrWeightedLearning.test.ts` — `ctrWeightedScore` 기존 테스트. **여기에 views 케이스를 추가**하고, 기존 케이스는 1줄도 깨지면 안 된다.
- `.env.example` — AB_* 노브 위치(30행 부근).

## 작업
### 1) `src/performance/abVerdict.ts` — `ctrWeightedScore`에 vconf 추가
`CtrWeightArgs`에 옵셔널 2개 추가(둘 다 없으면 기존과 동일):
```ts
export interface CtrWeightArgs {
  decisiveness: AbDecisiveness;
  relativeLiftPct?: number;
  videoCtr24h: number | null;
  mode: "ab" | "single";
  /** 영상(24h) 조회수. 신뢰도 가중용. null/미지정 → vconf=1.0(하위호환). */
  videoViews24h?: number | null;
  /** 코퍼스 상대 기준(학습대상 영상들의 24h 조회수 최댓값). 호출자가 산출해 주입. null/0 → vconf=1.0. */
  viewsReference?: number | null;
}
```
순수 헬퍼 + thresholds 노브 추가:
```ts
/** 조회수 신뢰도 [floor,1]. views/reference 없거나 reference<=0 → 1.0(무가중·하위호환). */
function viewsConfidence(views: number | null | undefined, reference: number | null | undefined, floor: number): number;
// = floor + (1-floor) * log1p(min(max(views,0),reference)) / log1p(reference)
```
`thresholds` 매개변수 타입에 `viewsConfFloor` 추가(옵셔널 — 미지정 시 내부 기본 0.5). 적용:
- `mode="single"`: `return normCtr(ctr, cap) * vconf;`
- `mode="ab"`: 기존 `base * (1 + boost*normCtr)` 에 `* vconf` 를 곱한다.
- `base === 0`(inconclusive)은 **여전히 0**(vconf 무관). CTR null 경로도 `base * vconf`로 — 단, **views도 null이면 vconf=1.0이라 정확히 base**(하위호환).

### 2) `src/llm/config.ts` — `ab.viewsConfFloor` env 노브
- 타입 `ab`에 `viewsConfFloor: number` 추가.
- `loadConfig`: `viewsConfFloor: envNum("AB_VIEWS_CONF_FLOOR", 0.5)`.
- `.env.example` AB 블록(30행 부근)에 `AB_VIEWS_CONF_FLOOR=0.5   # 24h 조회수 신뢰도 하한(저조회 영상 학습 약화하되 0으로 죽이진 않음)` 추가.

### 3) (ponytail) reference 산출 방식 주석
- `viewsConfidence` 위에 `// ponytail: reference=코퍼스 max(단순·아웃라이어에 log로 둔감). 표본 커져 단일 바이럴이 압도하면 p90 등 percentile로 교체(env 노브 신설).` 한 줄.

## 주의 (구체)
- **하위호환 절대 보존**: `videoViews24h`/`viewsReference`가 없으면 `ctrWeightedScore`는 기존과 **바이트 동일** 결과를 내야 한다. 이유: 기존 parity 픽스처·`tests/ctrWeightedLearning.test.ts`가 깨지면 안 됨.
- **순수 함수 유지**: 이 함수 안에서 코퍼스 max를 구하지 마라(다른 영상을 모름). reference는 인자로만. 이유: 순수성·테스트 용이성, reference 산출은 step1 호출자 책임.
- **vconf는 [floor,1] 단조**: 음수 조회수·NaN·reference<=0 방어(clamp). 이유: 폭주·NaN 차단(기존 `normCtr` 패턴과 동일).
- **inconclusive는 vconf와 무관하게 0**. 이유: reach가 높아도 영상 내 우열을 못 가렸으면 학습 신호 없음.
- 이 step은 **abLearnSource·learn-ab-style·copyLearnMap·UI 미침범**(step1·2). 시그니처만 확장.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트 (`tests/ctrWeightedLearning.test.ts`에 추가)
- views/reference 둘 다 미지정 → 기존 값과 동일(하위호환 회귀 가드).
- ab 모드: 같은 CTR·결정력에서 `views=reference`(최고 reach) → vconf=1.0 → 기존과 동일; `views≪reference`(저조회) → 점수 < 기존, 단 `>= base*(...)*floor`.
- single 모드: 동일하게 vconf가 곱해짐. reference null → vconf=1.0.
- 경계: views=0 → vconf=floor; views 음수/NaN → vconf=1.0(방어); reference<=0 → vconf=1.0.
- vconf 단조성: views↑ → vconf↑(같은 reference).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수). 특히 **기존 `ctrWeightedLearning` 테스트가 전부 그대로 통과**하는지(하위호환).
2. 체크: 순수 함수 유지(코퍼스 의존 없음)·vconf [floor,1] 클램프·inconclusive→0·하위호환(views 없으면 동일).
3. `phases/copy-views-weight/index.json` step 0 갱신(성공 → completed + summary).

## 금지사항
- `ctrWeightedScore`를 비순수로 만들지 마라(DB·코퍼스 조회 금지). 이유: 순수성·reference는 step1 책임.
- views 미지정 시 결과를 바꾸지 마라. 이유: 기존 픽스처·테스트 보존.
- 절대 cap(고정 조회수 임계값) 도입 금지. 이유: 사용자 결정 = 코퍼스 상대 기준.
- abLearnSource/learn-ab-style/copyLearnMap/UI 수정 금지(step1·2). 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
