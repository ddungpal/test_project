# Step 2: stage-auto-refresh

**단계 생성 완료 시 새로고침 없이 결과 자동 표시(#1).** 지금은 "제목·썸네일 만들기"(및 구성/리서치/대본 시작) 버튼을 누르면 에이전트가 백그라운드로 돌지만, 완료돼도 화면이 그대로라 **사용자가 수동 새로고침**해야 결과가 보인다. 버튼을 누른 클라이언트가 결과가 뜰 때까지 자동 갱신하게 한다.

## 배경 (왜 안 보이는가 — 탐색 결론)
- 주제(촉이) 단계는 run 상태 `created`(=phase `working`)라 `StageStepper`가 `LiveRefresh`를 띄워 자동 갱신 → 완료 시 결과가 저절로 뜬다.
- 그러나 titles/structure/research/script는 시작 버튼을 눌러도 DB 상태가 `*_selected`/`*_approved`(phase `await_start`)에 머물다가 **완료 시점에야** `*_proposed`로 전이된다. 그 사이 `LiveRefresh`가 안 떠서 자동 갱신이 없다(`src/lib/dashboard/stageProgress.ts`의 phase 분류).
- **가장 단순한 해결**: 버튼을 누른 `RequestStageButton`(클라)이 "생성 중" 동안 `LiveRefresh`를 직접 띄운다. 결과가 들어와 서버가 `ProposalSelector` 분기로 리렌더되면 이 버튼은 화면에서 사라지고(=`StageSection`이 다른 분기 렌더) `LiveRefresh`도 자동 언마운트된다. **enum·migration·상태 추가 0.**

## 읽어야 할 파일 (먼저 정독)
- `src/components/RequestStageButton.tsx` — 현재 `onClick`이 액션 호출 후 `router.refresh()` **한 번**만. 여기에 "생성 중" 상태 + LiveRefresh를 붙인다.
- `src/components/LiveRefresh.tsx` — `{ fallbackMs, active }` props. Realtime 구독 + 폴링 폴백. **그대로 재사용**(수정 불필요). 폴링을 빠르게 하려면 `fallbackMs`를 작게 넘긴다.
- `src/app/runs/[id]/page.tsx` (`StageSection`, 50~107줄) — 상태별 분기. `runState === proposedState && proposal` 이면 `ProposalSelector`, `runState === fromState`면 `RequestStageButton`. → 결과가 들어오면 버튼이 사라지는 구조 확인.
- `src/components/StageStepper.tsx` — 기존 LiveRefresh 사용 패턴(작업 중일 때만) 참고.

## 작업
`RequestStageButton.tsx` 수정(클라이언트 only):
1. 로컬 상태 `const [submitted, setSubmitted] = useState(false)` 추가.
2. `onClick`에서 액션 성공 후 `setSubmitted(true)` + `router.refresh()`.
3. 렌더:
   - 버튼은 `disabled={pending || submitted}`, 라벨은 `pending ? "요청 중…" : submitted ? "생성 중…" : label`.
   - `submitted`이면 버튼 아래에 `<LiveRefresh active fallbackMs={3000} />`를 렌더(결과 들어올 때까지 ~3초 간격 폴백 + Realtime 즉시).
4. 결과가 들어오면 부모(`StageSection`)가 `ProposalSelector` 분기로 리렌더 → `RequestStageButton`이 언마운트되며 폴링 종료(추가 정리 코드 불필요). 에러 시 기존처럼 `setError` + (submitted를 false로 되돌려 재시도 가능하게).

> ponytail: 새 상태(`*_generating`)·migration·stageProgress 분기 추가는 하지 마라. 클라이언트 "생성 중 → LiveRefresh"가 4개 단계(titles/structure/research/script) 전부를 한 번에 해결한다. 서버 상태머신을 늘리는 건 과설계.

## 주의
- **무한 폴링 경계**: 단계가 영영 완료 안 되면(에러로 상태 미전이) 버튼이 안 사라져 폴링이 계속될 수 있다. 치명적이진 않으나(개발 편의 갱신), 안전하게 **상한**을 둔다 — 예: submitted 후 일정 시간(예 3분) 지나면 LiveRefresh를 끄고 "오래 걸립니다 — 새로고침/로그 확인" 안내. (간단히 setTimeout + state. 과하게 만들지 말 것.)
- `LiveRefresh`·`stageProgress.ts`·`page.tsx`의 서버 상태 분류는 **수정하지 마라**(클라 버튼만 고친다). 이유: 상태머신 변경은 범위·리스크 과다.
- 4개 단계 모두 같은 `RequestStageButton`을 쓰므로 한 번 고치면 전부 적용된다 — 단계별 분기 추가 금지.
- TRUS 3색 유지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. (가능하면) 로컬에서 한 편 진행: 주제 선택 후 "제목·썸네일 만들기" → **새로고침 없이** 잠시 뒤 후보가 자동으로 뜨는지 육안. (서버·Inngest·DB 필요 → 헤드리스면 타입·빌드로 갈음하고 육안은 사용자 몫.)
3. step 2 갱신: 성공 → `"status":"completed"` + `"summary":"RequestStageButton이 생성 중 LiveRefresh(fallbackMs 3000) 띄워 4개 단계 결과를 새로고침 없이 자동표시 + 상한 타임아웃. 서버 상태머신 불변. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- 새 run 상태/enum/migration 추가 금지(위 ponytail 이유).
- `LiveRefresh`·`stageProgress`·서버 페이지 분기 수정 금지 — 클라 버튼만.
- 기존 테스트를 깨뜨리지 마라.
