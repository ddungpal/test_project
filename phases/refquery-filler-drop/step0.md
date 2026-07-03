# Step 0: drop-interrogative-filler-tokens (refYouTubeQuery 의문형 필러 제거)

## 읽어야 할 파일

- `docs/specs/2026-07-03-refquery-filler-drop-design.md` (설계·라이브 측정 근거 전문)
- `src/agents/onboarder/prepare.ts` — `refYouTubeQuery`(직전 phase에서 4토큰 캡 추가됨·이번에 필러 제거 추가).
- `tests/refYouTubeQuery.test.ts` — 기존 케이스 확장.
- `.claude/rules/rules.md`, `CLAUDE.md`, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경 (라이브 API 측정으로 확정)

`refYouTubeQuery`가 4토큰으로 줄였지만 남은 `"커버드콜 ETF가 대체 뭐길래"`가 여전히 저성과 영상을 부른다.
라이브 검색 측정 결과:
- `커버드콜 ETF` / `커버드콜 ETF가` / `커버드콜 ETF가 배당을` → 482만·148만 조회 ✅
- `커버드콜 ETF가 대체` → 9만, `…대체 뭐길래` → **734** ❌
→ **조사("가")는 무해, 의문형 필러("대체","뭐길래")가 결과를 파괴.** 필러만 제거하면 된다(조사 제거 안 함).

## 작업 — `refYouTubeQuery` 개정 (prepare.ts)

필러 stopword 셋 추가 + 토큰화 시 제거 + 캡 4→3:
```ts
// 검색 가치 없는 의문/강조 필러 — 핵심 명사 뒤에 붙어 검색을 뒤틀어 저성과/무관 영상을 부른다.
//   (라이브 측정: '대체'·'뭐길래' 추가 시 482만→9만→734). 조사는 제외(무해·단어 훼손 위험: '국가'→'국').
const REF_QUERY_FILLER = new Set([
  "대체","도대체","뭐길래","뭐길레","왜","진짜","정말","과연","그냥",
  "얼마나","어떻게","무엇","뭐","뭔데","이게","이거","이런","이렇게","도데체",
]);
```
`refYouTubeQuery` 본문:
- 절 경계 컷(`,|\n?!`)·괄호 제거·따옴표/후행부호 정리(현행 유지).
- 토큰화 후 **`REF_QUERY_FILLER.has(token)`인 토큰 제거**(정확 매치만·부분 문자열 아님).
- 남은 토큰 앞 **3개**(`MAX_TOKENS = 3`)로 캡·join.
- 2자 미만 → 원 제목 폴백(유지).

## 테스트 `tests/refYouTubeQuery.test.ts` (확장)

- `"커버드콜 ETF가 대체 뭐길래 배당을 10%씩 줄까? 초보를 위한 원리 완전 정복"`
  → 결과에 `"대체"`·`"뭐길래"` 미포함, `"커버드콜"` 포함, 토큰 수 ≤ 3.
- 필러 없는 제목·콤마 제목(`"월배당 ETF, …"` → `"월배당 ETF"`)은 기존과 동일(회귀).
- 필러가 부분 문자열인 정상어(예: `"배당을"`의 `"을"`)는 **제거 안 됨**(정확 토큰 매치 확인).
- 2자 미만 폴백 유지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드(rules.md).
2. 체크리스트: 필러가 정확 토큰 매치로만 제거되나(부분 문자열 오제거 없음)? 조사는 안 건드리나? 캡 3? 콤마/짧은 제목 회귀 없나?
3. `git status`로 범위 외 신규 파일(fixtures 등) 확인·제외(rules.md). ★ 라이브 검색 fixture 커밋 금지.
4. `phases/refquery-filler-drop/index.json` step0을 `completed`+`summary`로 갱신하고 phase status도 `completed`로.

## 금지사항

- 조사(은/는/이/가/을/를…)를 제거하지 마라(무해·단어 훼손 위험). 필러 단어 셋만.
- 필러 리스트를 과확장하지 마라(관찰된 것 + 흔한 의문/강조어만·정상 명사 넣지 말 것).
- `gatherReferences`·랭킹·완화 체인을 바꾸지 마라(이 함수 반환만 정제).
- 기존 테스트를 깨뜨리지 마라.
