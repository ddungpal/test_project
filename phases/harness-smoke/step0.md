# Step 0: smoke-add

이것은 **하네스 배선 스모크 테스트**다. 실제 프로덕션 코드는 건드리지 않는다.
목적은 팀 루프(Max 구현 → 검증 → Joy 검수 → 커밋)가 끝까지 도는지 확인하는 것뿐이다.

## 작업

`phases/harness-smoke/smoke.mjs` 파일 **하나만** 새로 만든다. 내용:

- 순수 함수 `add(a, b)` 를 정의한다 (두 수를 더해 반환).
- 파일 맨 아래에서 `assert`로 자체 검증한다: `add(2, 3) === 5`, `add(-1, 1) === 0`.
- 검증을 통과하면 `console.log("SMOKE OK")` 를 출력한다.

ESM(`.mjs`)이고 Node 내장 `node:assert`만 쓴다. 외부 의존성 추가 금지(이유: 스모크는 가볍고 자기완결적이어야 한다). `src/` 등 다른 파일은 절대 수정하지 마라(이유: 배선 확인용이라 부작용 0이어야 한다).

## Acceptance Criteria

```bash
node phases/harness-smoke/smoke.mjs
```

위 커맨드가 **exit 0**으로 끝나고 표준출력에 `SMOKE OK`가 찍히면 통과다.

## 검증 절차

1. 위 AC 커맨드를 실행해 exit code와 출력을 확인한다.
2. `phases/harness-smoke/smoke.mjs` 외의 파일이 변경되지 않았는지 `git status`로 확인한다.
3. 결과에 따라 `phases/harness-smoke/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "smoke.mjs 추가, AC 통과(SMOKE OK)"`
   - 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "<구체적 내용>"`
