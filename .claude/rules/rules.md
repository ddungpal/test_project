<!-- harness:freshness last_reviewed=2026-07-02 -->
# 프로젝트 규칙 (Living Rules)

> CLAUDE.md를 린하게 유지하기 위해, **영역 한정·상세 규칙**은 여기에 둔다.
> 하네스(execute.py)가 이 파일을 매 step 프롬프트에 가드레일로 주입한다.
> CLAUDE.md와 동일한 작성 원칙을 따른다: 구체적·검증 가능, 모순 없음, bloat 금지.

## 규칙 목록

각 규칙은 한 줄로, 검증 가능하게. "왜"가 비자명하면 `(이유: ...)`를 붙인다.

- 새 환경변수는 `.env.example`에도 추가한다 (이유: 운영·협업자 설정 누락 방지).
- `npm run build`가 `PageNotFoundError`(예 /audit)나 webpack chunk `MODULE_NOT_FOUND`(예 `./323.js`)로 깨지면 stale `.next` 캐시를 먼저 의심한다 — `rm -rf .next` 후 재빌드로 판별한다 (이유: 코드 변경과 무관한 캐시 오류를 실패로 오판 금지).
- 기존 메트릭 컬럼(예 `ab_variants.ctr_pct`)에 다른 지표를 재사용해 적재할 때는 그 정체를 코드·주석으로 명시한다 (이유: watch_share/views를 ctr_pct 슬롯에 넣는 패턴 — 컬럼명만 보고 CTR로 오해하는 실수 방지).
- step 산출물 커밋 전 `git status`로 명세에 없는 신규 untracked 파일(`fixtures/parity/*` record 부산물뿐 아니라 `docs/*`·빌드 산출물·다이어그램 등)이 섞였는지 확인하고 범위 외는 제외한다 (이유: 하네스 `git add -A`가 무관 부산물을 커밋에 딸려보내는 것 방지 — fixtures·docs/manual.html 154KB 등 실제 사례).
- 하네스 step 완료 시 코드뿐 아니라 `phases/<phase>/index.json`의 해당 step을 `completed` + `summary`로 갱신한다 (이유: status가 pending으로 남고 output이 stale 브리핑만 담는 실수 방지).
- enum/CHECK 제약을 넓히는 마이그레이션을 추가하면 같은 커밋에서 `src/lib/supabase/database.types.ts`의 해당 Row 유니온 타입도 함께 넓힌다 (이유: 스키마-타입 드리프트는 소비 step의 `.eq(col, newVal)`이 타입 좁힘으로 다음 step에서 typecheck를 깨뜨린다 — 마이그 25/30/31 실제 사례).
- `'use server'`/모듈 간 헬퍼를 추출·이동하면 원본 파일에 그 헬퍼만 쓰던 import(특히 `type X`)가 죽은 채 남지 않았는지 확인한다 (이유: tsconfig에 `noUnusedLocals`가 없어 죽은 import를 typecheck가 안 잡는 사각지대 — contentLifecycle.ts 추출 시 topicRun.ts에 죽은 `type Supa`가 남은 사례).
- 클라이언트 컴포넌트에서 단위 테스트할 순수 헬퍼는 컴포넌트 파일이 아니라 `src/lib/**`에 두고 export한다(컴포넌트는 re-export만) (이유: vitest에 `@/` alias가 없어 컴포넌트를 테스트가 import하면 내부 `@/...` import까지 끌려와 스위트 전체가 "Failed to load url @/..."로 로드 실패 — PostConfirmStructureEdit의 `isStructureDownstreamStarted`를 `src/lib/outline/staleness.ts`로 분리해 해결한 사례).
- 짠펜(scribe) 대본 세그먼트 품질을 검사할 때는 **kind로 갈라서** 검사한다 — 프로즈만 본문 길이(≥20자), 블록(table/case/visual)은 `payload` 존재로 (이유: 블록 세그먼트는 text가 짧은 제목이고 내용은 payload에 있음 — 모든 세그먼트에 프로즈 길이 검사를 걸면 블록 담은 정상 fixture가 eval을 밟는다. tests/eval.test.ts 실제 사례).
- catch로 rejected promise를 삼키는(best-effort) 함수를 vitest로 테스트할 때는 `vi.fn` 스텁 대신 교체 가능한 impl 함수 + 별도 호출 카운터로 스텁한다 (이유: `vi.fn`은 rejected promise를 `mock.results`에 붙들어 unhandled rejection으로 감지 → 실제로 catch해 정상 동작하는 코드도 테스트 실패로 승격. vitest 2.1.8 · onboardingTranscript.test.ts에서 fetchTranscript/prepareOnboarder의 throw 삼킴 검증 시 impl+카운터로 우회한 사례).

---

## 신선도 유지 (Rules Freshness)

근거: **사람이 큐레이션한** 규칙만 에이전트 성과를 높인다. LLM이 자동 생성한
context 파일은 오히려 성공률을 ~3% 낮추고 비용을 20%+ 올렸다
(ETH Zurich, arXiv 2602.11988). 그래서 이 저장소의 규칙은 **자동으로 덮어쓰지 않고,
사람이 검토 후 병합**한다.

### 루프 (propose → review → merge)

1. **propose** — step 실행 중 에이전트가 새 컨벤션/결정을 발견하면
   `phases/{phase}/rules-proposals.md`에 `- 제안: <규칙> (근거: <왜>)`를 append한다.
   (rules.md를 직접 수정하지 않는다.)
2. **review** — `python3 scripts/execute.py` 실행 시작 시, 하네스가 검토 대기 제안·
   staleness를 경고로 표면화한다. 사람이 제안을 읽고 취사선택한다.
3. **merge** — 좋은 제안만 위 "규칙 목록"에 반영하고, 병합한 `rules-proposals.md`는
   삭제한다. 그 뒤 맨 위 `last_reviewed=`를 오늘 날짜로 갱신한다.

### 언제 규칙을 추가/수정하나 (Anthropic 트리거)

- 에이전트가 **같은 실수를 두 번째**로 했을 때
- **코드 리뷰가** 에이전트가 알았어야 할 것을 잡아냈을 때
- 이전 세션과 **같은 교정을 다시** 입력하고 있을 때
- **새 팀원**에게 똑같이 설명해야 할 맥락일 때

### 가지치기 (Pruning)

"코드처럼 다뤄라 — 틀리면 리뷰하고, 주기적으로 가지치기하고, 동작이 실제로 바뀌는지로
검증하라." 각 규칙마다 자문: **"이 줄을 지우면 에이전트가 실수하게 되는가?"**
아니라면 삭제한다. 모순되거나 코드와 어긋난(stale) 규칙은 **없느니만 못하다** —
즉시 고치거나 지운다.
