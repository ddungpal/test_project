# Step 0: refYouTubeQuery 키워드 추출 강화 (긴 제목 → 검색 가능한 짧은 쿼리)

> 🔴 이 phase의 **핵심**. 이걸 안 고치면 재생성(step1/2)해도 여전히 0개 반환으로 실패한다.

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-regenerate-staleness-design.md` (근본원인·설계 전문)
- `src/agents/onboarder/prepare.ts` — `refYouTubeQuery`(수정 대상)·`gatherReferences`(이 쿼리 사용)·`relaxQuery`.
- `src/agents/topic_scout/youtubeFixture.ts` — `youtubeFixtureHash(query, max)`(쿼리가 fixture 키·쿼리 바뀌면 재record).
- `tests/refYouTubeQuery.test.ts`(있으면) — 기존 케이스 확장.
- `.claude/rules/rules.md`, `CLAUDE.md`, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경 (증거로 확정된 근본 원인)

`refYouTubeQuery`는 대괄호·콤마·파이프만 자를 뿐, **콤마 없는 긴 제목은 통째로 검색 쿼리로 쓴다.**
- 라이브 런: 제목 `"커버드콜 ETF가 대체 뭐길래 배당을 10%씩 줄까? 초보를 위한 원리 완전 정복"`
  → refYouTubeQuery = 제목 거의 그대로(12단어) → YouTube 검색 **0개** (너무 특정적).
- 짧은 `"커버드콜 ETF"`는 100만 조회 영상 14개 반환.
→ 긴 제목이 근거영상을 **하나도 못 찾게** 만든다(재생성도 0개로 실패).

## 작업 — `refYouTubeQuery` 수정 (prepare.ts)

절 경계 확대(`?` `!` 추가) + **첫 N토큰으로 제한**:
```ts
export function refYouTubeQuery(topicTitle: string): string {
  const raw = (topicTitle ?? "").trim();
  let s = raw.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " "); // 대괄호/소괄호 제거
  s = s.split(/[,|\n?!]/)[0] ?? s;                 // 첫 절만(콤마·파이프·개행·물음/느낌표)
  s = s.replace(/["'“”‘’]/g, " ");
  s = s.replace(/[.…~]+$/g, "").replace(/\s+/g, " ").trim();
  const MAX_TOKENS = 4;                            // ★ 핵심: 긴 제목을 앞 4토큰 키워드로 제한(0개 반환 방지)
  s = s.split(" ").filter(Boolean).slice(0, MAX_TOKENS).join(" ");
  return s.length >= 2 ? s : raw;                  // 너무 짧으면 원 제목 폴백
}
```

규칙/의도:
- 실패 모드가 "0개(너무 좁음)"이므로 **넉넉히 자른다**(MAX_TOKENS=4 권장). 토큰 적을수록 recall↑·특정성↓.
- 짧은 제목·콤마 제목은 기존과 동일하거나 개선(회귀 테스트로 고정). 폴백(2자 미만 → 원 제목) 유지.
- ★ `gatherReferences`·`relaxQuery` 호출부는 그대로(이 함수 반환만 짧아짐). relaxQuery는 이미 앞 절반 토큰이라 4토큰이면 더 넓어짐.

## 테스트 `tests/refYouTubeQuery.test.ts` (신규 또는 확장)

- **긴 콤마 없는 제목** `"커버드콜 ETF가 대체 뭐길래 배당을 10%씩 줄까? 초보를 위한 원리 완전 정복"`
  → 결과가 **4토큰 이하**이고 `"커버드콜"` 포함(핵심어 보존). (이 회귀가 근본 픽스의 잠금)
- 콤마 제목 `"월배당 ETF, 매달…"` → `"월배당 ETF"`.
- 물음표 경계 컷 확인. 대괄호/소괄호 제거. 따옴표·후행부호 정리. 2자 미만 → 원 제목 폴백.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드(rules.md).
2. 체크리스트: 긴 제목이 4토큰 이하로 줄고 핵심어 보존되나? 콤마/짧은 제목 회귀 없나(테스트)?
   `gatherReferences`·`relaxQuery` 호출부 무변경인가?
3. `git status`로 범위 외 신규 파일(fixtures 등) 확인·제외(rules.md). ★ 라이브 검색 fixture는 커밋 금지.
4. `phases/onboarding-regenerate-staleness/index.json` step0을 `completed`+`summary`로 갱신.

## 금지사항

- 토큰 캡을 너무 작게(1~2) 두지 마라(너무 넓어져 무관 영상)·너무 크게(8+) 두지 마라(0개 재발). 3~5 범위·기본 4.
- NLP/형태소 분석 의존성을 추가하지 마라(결정적 토큰 캡으로 충분).
- `gatherReferences` 완화 체인·랭킹(rankExternalByViews)을 바꾸지 마라(직전 phase 소관·이번은 쿼리만).
- 기존 테스트를 깨뜨리지 마라.
