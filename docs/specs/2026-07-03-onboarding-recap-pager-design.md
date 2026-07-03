# 쏙이 "내 풀이 다시 보기" 단일 문항 페이저 (onboarding-recap-pager)

작성일: 2026-07-03

## 배경 / 문제

쏙이 완료 화면의 "내 풀이 다시 보기" 토글은 현재 **모든 문항을 한 번에 세로로 나열**한다
(`OnboardingQuiz` done 분기의 `<details>` 안 `rows.map`). 문항이 많으면 길게 늘어져 복습이 산만하다.

## 결정

- 토글을 열면 **한 번에 한 문항**만 보이고, **이전 / 다음** 버튼으로 넘긴다. `n / 총N` 인디케이터.
- 조인/정오 로직은 기존 `buildRecap`/`recapScore`(src/lib/onboarding/recap.ts) 그대로 재사용 —
  UI(표시 문항 인덱스)만 추가한다.
- 근거 영상 조회수·구독자수(#2)는 **이 phase 범위 밖** — 코드는 이미 정상(새 아크는 표시됨),
  기존 아크는 삭제·재생성 전제로 현재 상태 유지.

## 설계

### 순수 헬퍼 (src/lib/onboarding/recap.ts에 추가)

```ts
/** 페이저 인덱스를 [0, total-1]로 클램프. total<=0이면 0. 순수·throw 0. */
export function clampRecapIndex(idx: number, total: number): number;
```

- `total <= 0` → 0. `idx < 0` → 0. `idx >= total` → `total - 1`. 그 외 `idx`.
- 아크가 커져(추가 문제) rows 길이가 줄거나 늘어도 방어. NaN도 0으로.

### UI (src/components/OnboardingQuiz.tsx — done 분기)

- 상태 추가: `const [recapIdx, setRecapIdx] = useState(0);`
- `<details>` summary는 유지("내 풀이 다시 보기" + "correct / total 맞힘").
- details 본문을 **전체 나열 → 단일 문항**으로 교체:
  - `const row = rows[clampRecapIndex(recapIdx, rows.length)];`로 현재 문항 하나 선택.
  - 기존 per-row JSX(질문 + difficulty 배지 + 보기 ✓/✗/취소선 + 아하 해설)를 **그대로** 그 한 문항에만 적용
    (마크업 재작성 최소화 — 나열용 `divide-y` 컨테이너만 걷어냄).
  - 하단에 컨트롤: `이전`(recapIdx<=0이면 disabled) · `n / rows.length` · `다음`(recapIdx>=rows.length-1이면 disabled).
    - 클릭 핸들러: `setRecapIdx((i) => clampRecapIndex(i - 1, rows.length))` / `+1`.
  - TRUS 3색만(Black/Yellow/White). 버튼은 기존 톤 미러(예: `다음` 노랑 강조 or 보더 버튼) — 과한 색·애니메이션 금지.
    disabled는 `opacity-40 cursor-default`(기존 추가문제 버튼 패턴 미러). 포커스 링 유지(focus-visible outline).
  - 접근성: 버튼에 `aria-label`(이전 문항/다음 문항). 인디케이터는 텍스트로 노출.

### 불변식 / 하위호환

- `rows`가 0이면 기존과 동일하게 섹션 자체 생략(`total > 0` 가드 유지).
- 재생/제출/금맥/레퍼런스 등 다른 블록 무변경.
- 마이그레이션 0·의존성 0·백엔드 무변경(전부 클라 데이터).

## 범위 밖 (Out of scope)

- 근거 영상 조회수·구독자수 백필(#2) — 현재 상태 유지.
- 문항별 출처 영상 매핑(데이터에 없음).
- 스와이프·키보드 화살표 네비 등 추가 인터랙션(YAGNI — 이전/다음 버튼으로 충분).

## AC

```bash
npm run typecheck
npm test
npm run build
```

완료 시 `phases/onboarding-recap-pager/index.json` step0을 `completed` + `summary`로 갱신.
