# Step 0: review-data-action (백엔드 — 최종검수 데이터 + 액션)

리서치가 무중단 자동화(Phase 1)되면서 고위험 사실은 `human_approved=null`(보류)로 스크립트까지 운반된다. 이제 **유일한 사람 접점 = 완성된 스크립트 검수 1회**에서 그 보류 사실을 맥락과 함께 확인한다. 이 step은 그 검수의 **데이터(세그먼트별 보류 사실)와 서버 액션**을 만든다. UI(인라인 칩)는 step1.

**반려 처리 방식 = (나)**: 사실을 반려하면 그 사실을 `human_approved=false`(부적격)로 막고 **기존 전체 재작성 경로(`requestScriptRework`)를 재사용**한다(세그먼트 부분 재생성 신규 구현 안 함 — 부적격 사실은 짠펜이 자동 제외). 반려가 없으면 보류 사실을 모두 `human_approved=true`로 확정하고 승인(→approved).

## 읽어야 할 파일

- `docs/specs/2026-07-01-research-autoflow-design.md` (특히 'D. 단일 최종 검수')
- `src/pipeline/scriptFactEligibility.ts` — Phase 1 산출. `isFactPending(f)=escalated_to_human && human_approved===null`(보류='확인 필요' 술어), `isFactUsableForScript`. **이 술어를 재사용**(중복 정의 금지).
- `src/lib/dashboard/scriptView.ts` — `getScriptView(runId): SegmentView[]`. 현재 `SegmentView.facts`는 `{id, claim}[]`. lineage 조인(`script_segment_facts` → `research_facts`)이 이미 있다.
- `src/lib/dashboard/researchView.ts` — `FactView` 구조 + fact 매핑(claim·verificationStatus·sourceTier·primarySourceUrl·isFinancial·escalatedToHuman·humanApproved 등). 칩에 필요한 fact 상세 매핑을 **여기서 재사용**(새로 만들지 마라).
- `src/app/actions/topicRun.ts` — `approveScriptAction`/`approveScript`, `requestScriptReworkAction`/`requestScriptRework`(script_review→approved | scripting), `approveResearchAction`(human_approved 토글 패턴 참고). `requireOwner`·`auditLog` 규약.
- `src/pipeline/researchGate.ts` — `approveResearch`가 `human_approved`를 어떻게 set 하는지(`.eq("run_id", runId)` 스코프, true/false 분기) — 같은 패턴으로 script 검수 fact 확정을 쓴다.

## 작업

### A. 세그먼트별 fact 상세 (보류 표시) — scriptView 확장

- `SegmentView.facts`를 칩에 필요한 상세로 확장한다. 최소 필드: `id`, `claim`, `pending`(=`isFactPending`), 그리고 출처 표시용(`verificationStatus`, `sourceTier`, `primarySourceUrl`, `isFinancial`). 가능하면 `researchView`의 fact 매핑(FactView)을 **재사용**해 단일 출처 유지 — `getScriptView`가 세그먼트별로 그 fact들을 붙인다.
- `human_approved`·`escalated_to_human` 컬럼을 fact select에 포함(현재 `id, claim`만 가져옴).
- 보류 fact가 없으면 facts는 일반 출처 표시만(토글 없음) — step1이 처리.

### B. 최종검수 액션 — reviewScriptAction (신규)

신규 서버 액션 + 순수/헬퍼 분리:

```ts
// topicRun.ts (액션) — requireOwner + auditLog 규약 준수
export async function reviewScriptAction(
  runId: string,
  decision: { rejectFactIds: string[] },
): Promise<{ state: string }>;
```

헬퍼(`researchGate.ts` 또는 신규 `scriptGate.ts` — 기존 위치 컨벤션 따름)에서:

1. **보류 fact 확정**: 이 run의 보류(pending) fact 중
   - `rejectFactIds`에 든 것 → `human_approved = false`(부적격),
   - 나머지 보류 fact → `human_approved = true`(사람 최종확인 = 거버넌스 landing).
   - 모든 update는 `.eq("run_id", runId)`로 스코프(타 run 오염 금지).
2. **분기**:
   - `rejectFactIds`가 **비었으면** → `approveScript`(script_review → approved).
   - `rejectFactIds`가 **있으면** → `requestScriptRework`(script_review → scripting, 전체 재작성). 부적격(false) 사실은 짠펜 적격성(`isFactUsableForScript`)이 자동 제외 → 재생성된 대본엔 안 들어감. (재작성 후 다시 script_review로 돌아와 재검수.)
3. `auditLog`에 `script_reviewed`(승인/반려 카운트) 기록.

★ 거버넌스 불변식: 보류 사실의 `human_approved`를 **사람의 이 액션에서만** true로 확정한다. 자동/암묵 승인 금지(Phase 1이 null로 남긴 것을 여기서 사람이 확정).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

신규 테스트(최소):
- `reviewScript` 헬퍼: (1) reject 없음 → 보류 전부 human_approved=true + approved 전이, (2) reject 있음 → 그 fact만 false·나머지 보류 true + scripting(rework) 전이, (3) run 스코프 격리(다른 run fact 미변경).
- scriptView: 보류 fact에 `pending=true`, 비보류 verified에 `pending=false`가 붙는지.

## 검증 절차

1. AC 실행(전부 exit 0).
2. 불변식 확인:
   - 보류 fact 확정이 reviewScriptAction(사람)에서만 일어나는가?
   - reject 시 전체 재작성(`requestScriptRework`) 재사용·새 부분재생성 경로 안 만들었는가(=정책 나)?
   - `.eq("run_id", runId)` 스코프 지켰는가?
   - `isFactPending` 재사용했는가(중복 정의 금지)?
3. `phases/script-review-inline-facts/index.json` step0을 `completed`+`summary`로 갱신(step1이 읽을 핵심: `reviewScriptAction` 시그니처, `SegmentView.facts`의 새 필드명, 보류 판별 위치).

## 금지사항

- 세그먼트 부분 재생성 경로를 새로 만들지 마라. 이유: 이번 정책은 (나)=기존 전체 재작성 재사용. 부분재생성은 향후 최적화.
- 마이그레이션(SQL) 추가 금지. 이유: `human_approved` 컬럼·전이 엣지(script_review→approved/scripting) 모두 존재.
- 짠펜 프롬프트(promptHash) 변경 금지(이 step은 검수 데이터·전이만 — 생성 프롬프트 무관).
- `requireOwner`/`auditLog` 누락 금지(기존 모든 액션 규약).
- 명세에 없는 신규 파일(라이브 fixture 등)을 커밋에 섞지 마라(`git status` 확인).
- 기존 테스트를 깨뜨리지 마라.
