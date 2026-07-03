# Step 0: recap-single-question-pager (내 풀이 다시 보기 → 단일 문항 + 이전/다음)

## 읽어야 할 파일

- `docs/specs/2026-07-03-onboarding-recap-pager-design.md` (설계 전문)
- `src/components/OnboardingQuiz.tsx` — done 분기의 "내 풀이 다시 보기" `<details>`(현재 `rows.map` 전체 나열).
  기존 per-row JSX(질문·difficulty 배지·보기 ✓/✗/취소선·아하 해설)와 "더 풀어보기" 버튼 disabled 패턴(톤 미러용).
- `src/lib/onboarding/recap.ts` — `buildRecap`/`recapScore`/`RecapRow`(재사용·여기에 헬퍼 추가).
- `.claude/rules/rules.md` — vitest `@/` alias 함정(순수 헬퍼는 `src/lib/**`에)·TRUS 3색.
- `CLAUDE.md`, `.claude/rules/` 전체, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경

완료 화면 "내 풀이 다시 보기"가 모든 문항을 한 번에 나열해 산만하다. **한 문항씩** 보여주고
**이전/다음** 버튼으로 넘기게 바꾼다. 조인/정오 로직은 그대로 두고 표시 인덱스만 추가한다.

## 작업

### 1) 순수 헬퍼 `src/lib/onboarding/recap.ts`에 추가

```ts
/** 페이저 인덱스를 [0, total-1]로 클램프. total<=0이면 0. NaN도 0. 순수·throw 0. */
export function clampRecapIndex(idx: number, total: number): number;
```

규칙: `Number.isFinite(idx)` 아니면 0. `total <= 0` → 0. `idx < 0` → 0. `idx >= total` → `total-1`. 그 외 정수화한 `idx`.

### 2) UI 교체 `src/components/OnboardingQuiz.tsx` (done 분기)

- 상태 추가: `const [recapIdx, setRecapIdx] = useState(0);` (컴포넌트 상단 다른 useState들과 함께).
- `<details>` summary("내 풀이 다시 보기" + "correct / total 맞힘")는 **유지**.
- details 본문을 **전체 나열 → 단일 문항**으로 교체:
  - `const cur = clampRecapIndex(recapIdx, rows.length); const row = rows[cur];`
  - 기존 per-row JSX를 **그 한 문항(row)에만** 적용(마크업은 최대한 재사용 — 나열용 `divide-y` 래퍼/`rows.map`만 제거).
  - 하단 컨트롤 한 줄:
    - `이전` 버튼: `onClick={() => setRecapIdx((i) => clampRecapIndex(i - 1, rows.length))}`, `disabled={cur <= 0}`, `aria-label="이전 문항"`.
    - 가운데 인디케이터: `{cur + 1} / {rows.length}` (텍스트).
    - `다음` 버튼: `+1`, `disabled={cur >= rows.length - 1}`, `aria-label="다음 문항"`.
  - 스타일: TRUS 3색만(Black `#121212`/Yellow `#F8F082`/White). disabled는 `opacity-40 cursor-default`
    (기존 "더 풀어보기" 난이도 버튼 disabled 패턴 미러). `focus-visible:outline` 유지. 그라데이션·그림자·이모지 남발 금지.

## 테스트 `tests/onboardingRecap.test.ts`(기존 파일 확장)

- `clampRecapIndex`: `total=0 → 0`, 음수 → 0, `idx>=total → total-1`, 정상 범위 그대로, `NaN → 0`.
- (UI 페이저 인터랙션은 컴포넌트 렌더 테스트 없음 — vitest `@/` alias 함정. 로직은 clampRecapIndex로 커버.)

순수 함수라 스텁 불필요.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드로 판별(rules.md).
2. 체크리스트: 한 번에 한 문항만 렌더되나? 이전/다음이 경계에서 disabled되나? 인디케이터 `n / N` 맞나?
   `rows` 0이면 섹션 생략(`total > 0` 가드) 유지되나? TRUS 3색만 썼나? 정오 표식(✓/✗/취소선) 보존되나?
3. `git status`로 명세에 없는 신규 파일(fixtures·docs 등) 섞였는지 확인·범위 외 제외(rules.md).
4. `phases/onboarding-recap-pager/index.json` step0을 `completed`+`summary`로 갱신하고 phase status도 `completed`로.

## 금지사항

- `buildRecap`/`recapScore` 정오·조인 로직을 컴포넌트에 다시 구현하지 마라(재사용만).
- 근거 영상 조회수·구독자수(#2)를 손대지 마라(이 phase 범위 밖·현재 상태 유지).
- 클램프 헬퍼를 컴포넌트 파일에 두지 마라(vitest `@/` alias 함정 — `src/lib/onboarding/recap.ts`에).
- 스와이프·키보드 화살표 등 추가 네비를 넣지 마라(YAGNI — 이전/다음 버튼만).
- 기존 테스트를 깨뜨리지 마라.
