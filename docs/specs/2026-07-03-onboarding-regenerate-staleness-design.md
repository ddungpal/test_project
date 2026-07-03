# 온보딩 참조 쿼리 정제 + 재생성 버튼 + stale 경고 (onboarding-regenerate-staleness)

작성일: 2026-07-03 (2026-07-03 오후 refYouTubeQuery 근본원인 확정으로 개정)

## 배경 / 문제

라이브 발견(런 `0661c8b0`): 선택된 주제 = **커버드콜**인데 온보딩 근거영상 = **PTP 원천징수**(무관)·1개.

## 🔴 근본 원인 (증거로 확정) — refYouTubeQuery가 긴 제목을 못 줄임

`refYouTubeQuery`는 대괄호·콤마·파이프만 자를 뿐, **콤마 없는 긴 제목은 통째로 검색 쿼리로 쓴다.**
- 이 런 제목 `"커버드콜 ETF가 대체 뭐길래 배당을 10%씩 줄까? 초보를 위한 원리 완전 정복"`
  → refYouTubeQuery = **제목 거의 그대로(12단어)** → fixture 해시 `07214628…` → 그 검색 결과 = **0개**.
- 반면 짧은 쿼리 `"커버드콜 ETF"` → fixture `7ca80a08` = **14개(100만·89만·68만 조회)**.

즉 **12단어 초정밀 쿼리라 YouTube가 0개를 반환** → 참조를 못 찾음 → 온보딩이 이전/엉뚱한 상태에 갇힘.
`force` 재생성도 645ms fast-fail(0개 캐시 fixture를 물어 레퍼런스 0 → 실패). **quota 아님**(키 5개 전부 200 확인).

## 부차 결함 (구조적)

- `runOnboarding`은 아크가 있으면 **캐시 반환**(force 아니면 재생성 안 함) → 주제 바뀌어도 아크 안 따라감.
- **UI에 강제 재생성 경로 없음**(`requestOnboarding`이 force 미전달). 사용자가 틀린 아크를 못 고침.
- 아크가 stale인지 **신호 없음** → 혼란.

## 결정 (3-step)

- **Step 0 (핵심): refYouTubeQuery를 핵심 키워드 추출로 강화** — 긴 제목도 검색 가능한 짧은 쿼리로.
- **Step 1: force 재생성 액션 + 아크 소스주제 저장 + stale 판정 헬퍼.**
- **Step 2: "온보딩 다시 만들기" 버튼 + 주제 변경 stale 경고 배너.**
- 자동 재생성 안 함(경고+수동). 마이그0·의존성0.

## 설계

### Step 0 — refYouTubeQuery 키워드 추출 강화 (prepare.ts)

현재(문제): 콤마 없으면 긴 제목 통짜 유지.
수정: 절 경계 확대(`,` `|` 개행 + `?` `!`) + **첫 N토큰으로 제한**(핵심 키워드만).
```ts
export function refYouTubeQuery(topicTitle: string): string {
  const raw = (topicTitle ?? "").trim();
  let s = raw.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " "); // 대괄호/소괄호 제거
  s = s.split(/[,|\n?!]/)[0] ?? s;          // 첫 절만(콤마·파이프·개행·물음/느낌표 경계)
  s = s.replace(/["'“”‘’]/g, " ");
  s = s.replace(/[.…~]+$/g, "").replace(/\s+/g, " ").trim();
  const MAX_TOKENS = 4;                      // ★ 핵심: 긴 제목을 앞 4토큰 키워드로 제한(0개 반환 방지)
  s = s.split(" ").filter(Boolean).slice(0, MAX_TOKENS).join(" ");
  return s.length >= 2 ? s : raw;            // 너무 짧으면 원 제목 폴백
}
```
- 예: 위 제목 → `"커버드콜 ETF가 대체 뭐길래"`(핵심어 커버드콜·ETF·배당 각도 포함) → 검색 결과 반환.
- `"월배당 ETF, 매달…"` → 콤마 컷 → `"월배당 ETF"`(불변·이미 좋음).
- ★ 토큰 적을수록 recall↑(넓게)·특정성↓ — 실패 모드가 "0개(너무 좁음)"이므로 넉넉히 자른다(4 권장·필요시 조정).

### Step 1 — 재생성 액션 + 아크 소스주제 + stale 헬퍼

- **신규 액션 `regenerateOnboarding(runId)`**(topicRun.ts): `requireOwner` → `inngest.send({ name:"run/onboarding.requested", data:{ runId, force:true } })`. 기존 `requestOnboarding`·난이도 경로 무변경(온보딩 함수는 이미 `force` 지원).
- **아크에 소스 주제 저장**: `OnboardingArc`에 `sourceTopicTitle?: string`(옵셔널·하위호환). `runOnboarding` 조립을
  `const arc = { ...generated, references, sourceTopicTitle: input.topic };`. `appendOnboardingQuestions`는 spread로 보존. `normalizeArc` 무변경.
- **순수 헬퍼 `isOnboardingArcStale(arcSourceTitle, currentTopicTitle)`**(src/lib/onboarding/): 둘 다 있고 trim 후 다르면 true, 하나라도 없으면 false(구버전 오경보 방지).

### Step 2 — UI (재생성 버튼 + stale 배너)

- **`RegenerateOnboardingButton`**(클라·`RequestOnboardingButton` 미러): `regenerateOnboarding` + LiveRefresh 폴링 + 상한 + error. 라벨 "온보딩 다시 만들기". 아크 존재 시 항상 노출. ★재생성 직전 `localStorage.removeItem('onboarding:answers:'+runId)`(새 문항 대비).
- **stale 배너**(page.tsx `OnboardingSection`): `topicTitle` prop 추가(현재 선택 주제=`getSelectedStagePayload("topic").title`) → `isOnboardingArcStale`로 stale이면 "⚠️ 주제가 바뀌었어요 — 다시 만들기로 갱신하세요" 경고(차단 아님·TRUS 노랑 좌보더). 배너 아래 재생성 버튼.

## 테스트

- `tests/refYouTubeQuery.test.ts`(기존 확장): **긴 콤마 없는 제목 → 4토큰 이하로 축약**(신규 회귀·핵심), 콤마 컷·물음표 컷·괄호 제거·폴백.
- `tests/onboardingArcStaleness.test.ts`: `isOnboardingArcStale` 케이스.

## 불변식 / 하위호환

- refYouTubeQuery는 짧은 제목·콤마 제목에 기존과 동일하거나 개선(회귀 테스트로 고정). YouTube fixture는 쿼리 변경으로 재record($0·키 5개 여유).
- 구버전 아크(sourceTopicTitle 없음) → stale false. `requestOnboarding`·난이도 무변경. 상태 전이 0. 마이그0·의존성0.

## 범위 밖

- 자동 재생성. 근거영상 절대 품질하한/신선도 컷. NLP 기반 키워드 추출(토큰 캡으로 충분).

## AC

```bash
npm run typecheck
npm test
npm run build
```
