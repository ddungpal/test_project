# Step 1: tune-live-refresh

**유휴 화면의 반복 재페치를 줄인다.** `LiveRefresh`가 폴백 폴링으로 **8초마다 `router.refresh()`** → 서버 컴포넌트 트리 전체(= step0의 쿼리들)를 8초마다 재실행한다. Realtime 구독이 이미 있으니, **폴백 폴링 간격을 늘리고 + 작업 중인 런에서만 폴링**한다.

## 읽어야 할 파일 (먼저 정독)
- `src/components/LiveRefresh.tsx` — 대상. 현재 `fallbackMs=8000`·`setInterval(()=>router.refresh(), fallbackMs)` + 1초 tick 카운터. Realtime 구독(production_runs) + 폴백 폴링 하이브리드.
- `LiveRefresh`를 쓰는 곳(예: `StageStepper` / runs/[id]) — props로 "작업 중 여부"를 받는지 확인.
- 메모리/주석상: LiveRefresh는 "작업 중만" 켜는 의도였음(과거 AutoRefresh→LiveRefresh 교체).

## 작업
1. **폴백 폴링 간격 상향**: `fallbackMs` 기본 8000 → **20000**(20초). Realtime이 정상이면 폴링은 안전망일 뿐 — 자주 돌 필요 없음.
2. **유휴 시 폴링 중단**: 런이 **terminal 상태**(approved·aborted 등 더 진행 없음)이거나 작업 중이 아니면 폴백 폴링을 **돌리지 않는다**(Realtime 구독만 유지하거나 그것도 해제). "작업 중(active)" 여부를 prop으로 받아 분기. 호출부에서 active 값을 넘기도록 최소 수정.
3. 1초 tick 카운터가 단순 표시용이면, 폴링 안 할 때는 tick도 멈춰 불필요한 리렌더 제거(선택).

## 주의
- **Realtime 경로는 깨지 말 것** — 폴백만 조정. dev 바이패스/미적용 환경에서 degrade(폴링) 동작은 유지하되 간격만 완화.
- 동작 회귀 금지: 작업 중인 런은 여전히 갱신돼야 함(active일 때 폴링 또는 Realtime로).
- 범위: `LiveRefresh.tsx` + 호출부 최소 수정. 다른 영역 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm run build
```

## 검증 절차
1. AC exit 0.
2. `git diff`로 Realtime 구독 로직 불변·폴백만 조정 확인.
3. step 1 갱신: 성공 → `"status":"completed"`, `"summary":"LiveRefresh 폴백 8s→20s + 작업중(active)만 폴링. Realtime 불변. tc/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.
