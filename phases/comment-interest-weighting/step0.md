# Step 0: video-weight-model

## 배경 (이 phase의 목적 — 자기완결)

주제 발굴(촉이)은 김짠부 채널 댓글에서 키워드를 집계해 관심 주제를 뽑는다. 현재는 모든 imported 영상의 댓글을 **동등하게** 취급한다 — 조회수 275K 최신 영상 댓글과 조회수 21K 오래된 영상 댓글이 같은 무게다. 목표는 각 댓글에 **"영상 인기도 × 최신성" 가중**을 곱해, 최근·인기 영상 시청자의 관심이 더 무겁게 반영되게 하는 것이다.

핵심 설계 원칙 — **어느 요소도 절대 지배하지 않는다**:
- 인기도는 로그 압축(조회수 1000배 차이 → 가중 2배).
- 최신성은 감쇠하되 **바닥값(FLOOR)**을 둬서, 아무리 오래된 영상도 최소 기여가 있다("최신 = 절대 가중"이 아님). 옛날 대박 영상이 신선한 망작을 이길 수 있어야 한다.

이 step은 그 가중을 계산하는 **순수 함수 모델만** 만든다. 배선(집계기 연결·DB 조회)은 다음 step이 한다.

## 읽어야 할 파일

먼저 아래를 읽고 프로젝트의 순수함수·상수 컨벤션을 파악하라:

- `CLAUDE.md`, `.claude/rules/rules.md` (프로젝트 규칙)
- `src/agents/topic_scout/externalSignals.ts` — `viewsPerSubscriber`(순수·null 방어 패턴), `parseISODurationSec`(파싱 실패 → null) 참고. **같은 스타일로 작성하라.**
- `src/agents/topic_scout/discovery.ts` — `competitorSignalScore`, `passesQualityFloor`(순수·결정적·`now` 주입으로 테스트 가능) 참고.
- `tests/` 하위의 아무 순수함수 테스트 1개(예: `tests/` 안에서 `externalSignals` 또는 `discovery` 관련) — 테스트 파일 위치·스타일 확인.

## 작업

**신규 파일** `src/agents/topic_scout/videoWeight.ts` 를 만들고 아래를 export 하라:

```ts
// 튜닝 노브(실데이터 보정용 상수 — competitorSignalScore의 ENGAGEMENT_K 처럼 상수로 노출)
export const RECENCY_FLOOR = 0.3;      // 오래된 영상의 최소 기여(최신 ≠ 절대 가중)
export const HALFLIFE_MONTHS = 2;      // 최신성 반감 개월(업로드 범위가 ~2.5개월이라 짧게)
export const POPULARITY_LOG_BASE = 10; // log 밑(조회수 압축 강도)

// 조회수 → 인기도 가중. log_base(views + base): 1천→~3, 10만→~5, 100만→~6.
//   views null/비유한/≤0 → 1.0 폴백(데이터 없음을 벌하지 않음, 회귀 0).
export function popularityWeight(views: number | null | undefined): number;

// 업로드일 → 최신성 가중. FLOOR + (1-FLOOR) / (1 + ageMonths / HALFLIFE_MONTHS).
//   방금=1.0, 반감기 도달=~0.65, 아주 오래=FLOOR로 수렴(하이퍼볼릭 감쇠 — 꼬리가 길다).
//   uploadDate null / 파싱 불가 / 미래 날짜(ageMonths<0은 0으로 clamp) → 1.0 근처로 안전 처리.
//   now 주입(Date | ISO string)으로 결정적 테스트. ageMonths = (now - upload) / (30.44일).
export function recencyWeight(uploadDate: string | null | undefined, now: Date | string): number;

// 종합 영상 가중 = popularityWeight(views) × recencyWeight(uploadDate, now). 순수·결정적.
export function videoWeight(
  views: number | null | undefined,
  uploadDate: string | null | undefined,
  now: Date | string,
): number;

// videoId → videoWeight 맵(순수·데이터 정형만, DB 접근 없음). 다음 step의 배선이 이걸 호출한다.
//   같은 videoId가 중복이면 마지막 값 유지(결정적). views/uploadDate 없는 항목도 넣는다(videoWeight가 1.0 폴백).
export function buildVideoWeightMap(
  videos: { youtubeVideoId: string; views: number | null; uploadDate: string | null }[],
  now: Date | string,
): Map<string, number>;
```

**핵심 규칙(반드시 준수):**
- 전부 **순수 함수**(DB·네트워크·`Date.now()` 직접 호출 금지 — `now`는 인자로 받는다). 이유: 결정적 단위테스트 + `competitorSignalScore` 등 기존 순수함수 패턴 일치.
- 모든 함수는 `null`/`undefined`/비유한/음수 입력에 **throw 하지 않고 안전한 기본값**을 반환한다(`viewsPerSubscriber`의 방어 미러).
- `recencyWeight`의 미래 날짜(ageMonths<0)는 0으로 clamp → 1.0.

**신규 테스트** `tests/videoWeight.test.ts`:
- `popularityWeight`: 1천 vs 100만이 대략 2배 비율인지, null→1.0.
- `recencyWeight`: 방금≈1.0, HALFLIFE 도달≈0.65, 아주 오래→FLOOR 근처, null→1.0, 미래→1.0.
- `videoWeight`: 곱이 맞는지, "신선한 망작(저조회·최신) vs 오래된 대박(고조회·구식)"이 근소하게 갈리는 대표 케이스 1개.
- `buildVideoWeightMap`: 여러 영상 맵핑, 중복 videoId 마지막 값, 데이터 없는 영상도 키 존재.

## Acceptance Criteria

```bash
npm run typecheck                 # 타입 에러 0
npm test                          # 기존 전부 통과 + videoWeight.test 신규 통과
npm run build                     # 컴파일 에러 0
```

빌드가 `PageNotFoundError`나 webpack chunk `MODULE_NOT_FOUND`로 깨지면 stale `.next` 캐시부터 의심: `rm -rf .next` 후 재빌드로 판별(코드 무관 오류 오판 금지).

## 검증 절차

1. 위 AC 커맨드 실행.
2. 아키텍처 체크: 순수함수만 있는가(supabase/fetch import 0)? `now` 인자 주입인가?
3. `git status`로 명세에 없는 신규 untracked 파일(fixtures 부산물 등)이 섞였는지 확인하고 범위 외는 제외.
4. `phases/comment-interest-weighting/index.json`의 step 0을 결과에 따라 갱신:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약(생성 파일·export·테스트 수)"`
   - 3회 실패 → `"status": "error"`, `"error_message": "..."`

## 금지사항

- 기존 파일 수정 금지(이 step은 신규 `videoWeight.ts` + 테스트만). 이유: 모델과 배선을 분리해 순수함수만 독립 검증.
- `Date.now()` / argless `new Date()` 사용 금지. 이유: 결정성 파괴 + 프로젝트 규칙(스크립트 컨텍스트에서 금지).
- 기존 테스트를 깨뜨리지 마라.
