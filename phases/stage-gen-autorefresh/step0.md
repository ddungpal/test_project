# Step 0: proposal-gen-working-marker

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `src/lib/dashboard/stageProgress.ts` — **버그 핵심**: `isWorking = phase === "working" && state !== "paused_soft_cap"`(79). researching/scripting만 phase="working"(32·36). 제안 단계(topic/title/thumbnail/structure)는 생성 중 *_selected 상태라 isWorking=false
- `src/components/StageStepper.tsx` — `prog.isWorking`일 때만 `<LiveRefresh active>`(49). 즉 페이지 레벨 자동 새로고침이 isWorking에 묶여 있음
- `src/pipeline/stageContract.ts` — `runProposalStage`: 생성 끝에 `setProgress(supa, runId, null)`(242) 호출. 여기 시작부에 '작업 중' 마커를 쓰고, 끝/에러에 지운다
- `src/pipeline/context.ts`(또는 setProgress 정의처) — `setProgress` 시그니처·progress_note 쓰기
- `src/lib/dashboard/runDetail.ts` — `progressNote`를 이미 읽어 RunDetail에 실음(StageStepper에 prop 전달)
- `src/lib/dashboard/labels.ts` 부근 — parseSubProgress(progressNote) 형식(서브 진행바). 제안 단계 마커가 이걸 깨지 않게 확인

## 근본원인

제안 단계 생성 중 run.state가 이전 *_selected 그대로라 isWorking=false → StageStepper의 페이지 LiveRefresh가 안 돈다. 자동 갱신이 버튼의 클라이언트 `submitted` 세션에만 의존 → 새로고침/세션 종료 시 결과 미표시(서버 렌더는 정상).

## 작업

제안 단계 생성 중에도 isWorking=true가 되도록 '작업 중' 신호를 남긴다.

### 1. 워커: 생성 마커 set/clear (`runProposalStage`)
- 생성 시작부(prep 전후, callLLM 전)에서 `setProgress(supa, runId, <마커>)`로 "작업 중" 표시.
  - 마커 형식은 parseSubProgress를 깨지 않게(서브바가 엉뚱하게 뜨지 않게) 정한다 — 예: 사람용 한 줄("구성 생성 중") 또는 기존 progress 규약에 맞춘 문자열. parseSubProgress가 못 읽으면 서브바 없이 표시만 되면 충분.
- 완료 시 기존대로 `setProgress(null)`(242) 유지. **에러 시에도 반드시 지운다** — try/finally로 감싸 throw 경로에서도 마커가 남지 않게(stale 마커 = 무한 폴링 방지).
  - 단, Inngest 재시도가 재실행하므로 재시도 중엔 다시 set된다(정상). 영구 실패 시 마커 잔존 가능성은 아래 isWorking의 상태 한정으로 완화.

### 2. isWorking 확장 (`stageProgress.ts`)
- `isWorking`을 `(phase === "working")` **또는** `(생성 마커 존재 AND state가 제안 생성 가능 상태)` 로 확장한다.
  - 제안 생성 상태 한정: topic은 created/topic_selected 직전, title/thumbnail/structure는 각 fromState(*_selected)에서 생성된다 → 마커 기반 isWorking은 **제안 fromState/proposed 류 상태에서만** 인정해 stale 마커가 종료 상태(approved/published/aborted)에서 폴링을 유발하지 않게 한다.
  - `paused_soft_cap` 제외는 유지.
- isWorking 계산에 progressNote(마커)를 넘기려면 시그니처에 progressNote를 추가하고 호출부(getRunDetail/StageStepper 경로)에서 전달한다. **researching/scripting 기존 동작은 불변**(phase==="working" 그대로 true).

### 3. 회귀/방어
- 마커 없을 때(progressNote null) 제안 상태 isWorking=false(기존과 동일) — 정상 idle 페이지에서 폴링 안 함.
- parseSubProgress가 제안 마커에 크래시하지 않게(방어).

## 테스트

`tests/`에 stageProgress 테스트 추가(순수 함수):
- researching/scripting → isWorking true(회귀).
- 제안 fromState(예: thumbnails_selected) + 마커 존재 → isWorking true.
- 제안 상태 + 마커 없음 → isWorking false.
- 종료 상태(approved/aborted) + 마커 존재(가정) → isWorking false(stale 폴링 방지).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 LLM/Inngest는 AC에서 안 부른다. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 제안 단계 생성 중 isWorking=true가 되는가(마커 기반).
   - 종료/idle 상태에서 stale 마커로 무한 폴링하지 않는가(상태 한정).
   - researching/scripting·idle 기존 동작 불변인가.
   - 마커가 완료·**에러 양쪽**에서 지워지는가(finally).
3. `phases/stage-gen-autorefresh/index.json`의 step 0 갱신. index.json 유효 JSON 유지.

## 금지사항

- 새 run 상태나 마이그레이션을 추가하지 마라(progress 마커 재사용으로 해결). 이유: 상태 추가는 전이표·트리거까지 번지는 큰 변경.
- researching/scripting의 isWorking 판정을 바꾸지 마라(기존 동작 보존).
- 마커를 에러 경로에서 안 지우는 코드를 두지 마라. 이유: stale 마커가 무한 폴링을 유발한다(try/finally 필수).
- 정상 idle(아무 생성 없음) 제안 상태에서 isWorking=true가 되게 하지 마라(불필요 폴링).
- 기존 테스트를 깨뜨리지 마라.
