# Step 1: weighted-aggregate

## 배경 (자기완결)

`aggregateCommentSignals`(공유 헬퍼)는 댓글 행을 받아 키워드 빈도를 집계한다. 현재 각 댓글의 가중치는 **댓글 좋아요만** 반영한다:
```
w = 1 + min(5, floor(like_count / 10))   // 범위 [1, 6]
```
이 step은 여기에 **영상 단위 가중(weight)**을 곱할 수 있게 시그니처를 확장한다. 값은 이전 step에서 만든 `videoWeight.ts`가 계산하지만, 이 step은 **집계기가 그 값을 받아 곱하기만** 한다(값 계산은 다음 step의 배선이 주입).

**절대 지켜야 할 불변식:** `weight`를 안 넘기는 호출부는 **바이트 동일**하게 동작해야 한다. 이 함수는 3곳에서 쓰인다:
- `src/agents/topic_scout/discovery.ts` (발굴 Cron) — 다음 step에서 weight 주입 **예정**.
- `src/agents/topic_scout/prepare.ts` (per-run) — 다음 step에서 weight 주입 **예정**.
- `src/agents/retrospectivist/prepare.ts` (발행 후 회고, 단일 영상) — **영원히 weight 미주입**(단일 영상이라 영상 가중 무의미). 이 호출부가 회귀하면 안 된다.

## 읽어야 할 파일

- `src/agents/topic_scout/commentSignals.ts` — 수정 대상. `aggregateCommentSignals`의 현재 시그니처·가중 로직(`w = 1 + min(5, ...)`)·STOP/조사 처리를 정독하라.
- `src/agents/topic_scout/videoWeight.ts` (이전 step 산출물) — 여기서 계산될 weight의 범위/성격 파악.
- 호출부 3곳(위 목록) — 현재 호출 형태를 확인해 회귀 없음을 보장:
  - discovery.ts: `aggregateCommentSignals(comments ?? [])`
  - topic_scout/prepare.ts: `aggregateCommentSignals(comments ?? [], { keyword })`
  - retrospectivist/prepare.ts: `aggregateCommentSignals(comments ?? [])`
- `tests/` 하위 `commentSignals` 관련 기존 테스트 — 확장할 스위트.

## 작업

`aggregateCommentSignals`의 입력 행 타입에 **옵셔널 `weight`** 를 추가한다:

```ts
export function aggregateCommentSignals(
  rows: { body: string | null; like_count: number | null; weight?: number | null }[],
  opts: { keyword?: string | null } = {},
): CommentAggregate
```

내부 per-댓글 가중을 다음과 같이 바꾼다:

```ts
const likeBoost = 1 + Math.min(5, Math.floor((c.like_count ?? 0) / 10)); // 기존 그대로
const vw = c.weight == null || !Number.isFinite(c.weight) || c.weight <= 0 ? 1 : c.weight; // 방어 폴백
const w = likeBoost * vw;
```

**핵심 규칙(반드시 준수):**
- `weight` 미제공(`undefined`)이거나 비유한/≤0이면 `vw = 1` → 기존과 **곱셈 결과 바이트 동일**. 이유: retrospectivist·미배선 호출부 회귀 0.
- `likeBoost`의 상한(×6)·`STOP`·`stripJosa`·`QUESTION_RE`·컷 임계(광역 ≥3, 키워드 군집 ≥2)를 **건드리지 마라**. 이유: 이번 변경은 곱셈 계수 추가뿐, 집계 로직 자체는 불변.
- `keyword_signals`의 `count`는 이제 실수(float)일 수 있다(weight가 소수). 정렬·컷 로직은 그대로 동작하지만, 필요하면 `count`를 소수 둘째 자리 반올림해 결정성 유지(`competitorSignalScore` 패턴). 반올림 여부는 재량이되, 테스트로 결정성을 고정하라.

**테스트 확장**(기존 `commentSignals` 스위트에 추가):
- `weight` 미제공 시 결과가 기존과 동일한지(불변식 회귀 가드) — 같은 입력을 weight 없이/있이 비교.
- `weight`를 준 댓글의 키워드 `count`가 `likeBoost × weight`로 커지는지.
- `weight <= 0` / `NaN` / `undefined` → 1.0 폴백.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

빌드가 stale `.next` 캐시(`PageNotFoundError`/chunk `MODULE_NOT_FOUND`)로 깨지면 `rm -rf .next` 후 재판별.

## 검증 절차

1. AC 실행.
2. 회귀 체크: 호출부 3곳은 이 step에서 **미수정**이어야 한다(시그니처가 옵셔널이라 컴파일·동작 그대로). git diff에 `commentSignals.ts` + 테스트만 잡히는지 확인.
3. `git status`로 범위 외 untracked 파일 제외.
4. `phases/comment-interest-weighting/index.json`의 step 1을 갱신(성공 → completed + summary / 실패 → error).

## 금지사항

- 이 step에서 discovery.ts / prepare.ts(두 곳) / retrospectivist/prepare.ts를 수정하지 마라. 이유: 배선은 다음 step 소관. 여기서 호출부를 건드리면 scope가 섞여 Joy 검증이 어려워진다.
- likeBoost 상한·STOP·조사·컷 임계 변경 금지(위 참조).
- 기존 테스트를 깨뜨리지 마라.
