# Step 0: backend-extractor-action

김짠부 직접 피드백을 **최우선 룰**로 학습하는 백엔드 파이프라인(draft까지). 저장·추출·서버액션 한 레이어.
`analogy-learning` step1(마이그+추출기+relearn+액션)을 거의 그대로 미러한다.

## 읽어야 할 파일

먼저 아래를 읽고 설계 의도·기존 패턴을 파악하라:

- `docs/specs/2026-07-05-owner-feedback-rules-design.md` — 이 task 전체 설계.
- `supabase/migrations/20260703120033_style_profiles_analogy.sql` — **미러 대상 마이그**(CHECK 멱등 drop/재생성 패턴).
- `src/lib/supabase/database.types.ts` — `style_profiles` Row의 `component_type` 유니온(같은 커밋에서 넓혀야 함).
- `src/agents/analogy_extractor/schema.ts`, `src/agents/analogy_extractor/step.ts` — **미러 대상 추출기**(schema·callLLM 1회·정규화).
- `src/pipeline/roles.ts` — `analogy_extractor` 등록 지점(신규 role 등록 패턴).
- `src/performance/analogyRelearn.ts` — draft INSERT sweep(version 스코프 max+1·status='draft') 패턴.
- `src/app/actions/copyLearn.ts` — `requestAnalogyRelearn`(requireOwner+admin 얇은 래퍼·auditLog best-effort)·`activateCopyStyle`(draft→active 매핑) 서버액션.
- `src/app/actions/copyLearnMap.ts` — `CopyComponent` 유니온·`componentTypeFor` 매핑(순수·server-only 의존 금지).
- `src/agents/shared/styleProfile.ts` — `loadActiveTitleStyle` 등 active 로드 패턴(step2에서 쓰지만 구조 참고).

이전 유사 step을 꼼꼼히 읽고 그 관례를 따르라. 새 패턴을 발명하지 마라.

## 작업

### 1. 마이그레이션 034 — `component_type` 2종 추가
`supabase/migrations/20260705120034_style_profiles_owner_rules.sql` 신규.
`20260703120033_style_profiles_analogy.sql`를 미러: `style_profiles_component_type_check`를
멱등 drop 후 재생성하여 기존 5종(`title`,`thumbnail_copy`,`description`,`structure`,`analogy_style`)에
`title_owner_rules`, `thumbnail_owner_rules`를 추가한다. 다른 CHECK·인덱스·`pts_profile_match` 등은
무변경(v1 YAGNI).

같은 커밋에서 `src/lib/supabase/database.types.ts`의 `style_profiles` Row·Insert·Update의
`component_type` 유니온에 두 값을 추가한다.
**하지 마라: 타입만 넓히고 마이그 누락, 또는 그 반대. 이유: 스키마-타입 드리프트는 소비 step의
`.eq('component_type', ...)`를 다음 step에서 typecheck로 깨뜨린다(마이그 25/30/31 실제 사례).**

### 2. 추출기 에이전트 `owner_feedback_extractor`
`src/agents/owner_feedback/schema.ts`·`src/agents/owner_feedback/step.ts` 신규. `analogy_extractor` 미러.

- 입력(함수 인자): `{ component: 'title'|'thumbnail', existingRules: string[], candidates: OwnerFeedbackCandidates, feedback: string }`.
  - `OwnerFeedbackCandidates` = 제목이면 `string[]`(제목 후보들), 썸네일이면 `{ main: string[]; box: string[] }[]`(세트 배열, 각 메인2·박스2).
- 출력 스키마 `OwnerFeedbackResult` = `{ rules: string[]; change_note: string }`.
- SYSTEM 프롬프트 핵심 규칙(반드시 명시):
  - 김짠부(@zzanboo) 채널 오너의 **직접 피드백**을 짧은 **명령형 규칙**으로 증류한다("제목엔 구체 수치를 포함한다"처럼 검증 가능·간결).
  - **병합**: `existingRules`가 있으면 그것과 이번 피드백을 합쳐 하나의 규칙셋을 만든다. 같은 취지 규칙은 **하나로 합치고**(중복 금지), **모순되면 이번(최신) 피드백을 우선**하고 나머지 기존 규칙은 유지한다.
  - 입력 후보(`candidates`)는 김짠부가 반응한 구체 예시다 — 규칙의 **근거**로만 쓰고, 특정 후보 문구를 규칙에 그대로 베끼지 마라(일반화하라).
  - `change_note`는 이번에 무엇이 추가/수정됐는지 한 줄 한국어.
- `extractOwnerFeedbackRules(input)` = `callLLM` 1회(`roleId: 'owner_feedback_extractor'`·적정 maxTokens)+`?? []` 정규화. `feedback`이 공백뿐이면 추출 안 하고 기존 규칙 그대로 반환(빈 입력 방어).
- `src/pipeline/roles.ts`에 `owner_feedback_extractor` 등록(`analogy_extractor` 항목 미러·opus·`tools: []`).

### 3. 서버액션 `submitOwnerFeedback`
`src/app/actions/copyLearn.ts`에 추가(`requestAnalogyRelearn` 미러·requireOwner 게이트·admin 클라·auditLog best-effort).

시그니처(대략): `submitOwnerFeedback(input: { component: 'title'|'thumbnail'; topic?: string; candidates: OwnerFeedbackCandidates; feedback: string })`.

로직:
1. requireOwner.
2. 해당 `component_type`(`title_owner_rules`|`thumbnail_owner_rules`)의 **활성(status='active')** 행 로드 → `existingRules`(없으면 `[]`).
3. `extractOwnerFeedbackRules` 호출 → `{ rules, change_note }`.
4. `style_profiles` draft INSERT: `component_type`, `status='draft'`, `version` = **해당 component_type 스코프의 max+1**(analogyRelearn 패턴), `patterns = { rules, sources: [...기존 active의 sources, { topic, candidates, feedback }] }`.
5. auditLog `owner_feedback_submitted`(best-effort). 활성화는 하지 않는다(사람 게이트).

핵심 순수 병합/version/payload 로직은 `copyLearnMap.ts`에 순수 함수로 두어 vitest에서 직접 import 가능하게 하라(server-only 의존 금지). 예: `buildOwnerRulesDraftPatterns(prevSources, rules, newSource)`.

### 4. 매핑 확장 (copyLearnMap.ts)
- `CopyComponent` 유니온에 `'title_owner'`·`'thumbnail_owner'` 추가.
- `componentTypeFor`: `'title_owner'` → `'title_owner_rules'`, `'thumbnail_owner'` → `'thumbnail_owner_rules'`. 반환 타입 유니온도 넓힌다. 기존 매핑(thumbnail/title/analogy) 무변경.
- `activateCopyStyle`가 이 매핑을 타므로 `activateCopyStyle('title_owner')`가 별도 수정 없이 동작하는지 확인하라(안 되면 `activateCopyStyle` 내부 매핑만 최소 확장).

### 5. 불변식
훅이·썸네일·유이 prepare·프롬프트·fixture는 **이 step에서 건드리지 않는다**(주입은 step2). 이 step만으로는 promptHash 불변이어야 한다.

## Acceptance Criteria

```bash
npm run typecheck   # 컴파일 에러 0 (스키마-타입 드리프트 없음)
npm test            # 전체 통과 (신규 테스트 포함)
npm run build       # 빌드 성공
```

신규 테스트(최소):
- `owner_feedback_extractor` 스키마 required/정규화(빈 배열 방어) 회귀.
- 병합 순수함수: 기존 규칙 + 신규 → dedup·모순 시 최신 우선(추출기 자체는 스텁, 병합 계약을 순수함수 레벨에서 검증하거나 프롬프트 계약을 테스트로 문서화).
- `submitOwnerFeedback` 코어: version 스코프 max+1·draft status·sources 누적·빈 feedback 방어(deps 스텁 주입).
- `componentTypeFor('title_owner')==='title_owner_rules'` 등 매핑.

## 검증 절차

1. 위 AC 커맨드 실행.
2. 체크리스트: 마이그와 database.types.ts가 **같은 커밋에서** 함께 넓혀졌는가? 순수 로직이 `copyLearnMap.ts`(server-only 무관)에 있는가? 훅이/썸네일 fixture가 무변경인가(`git status`로 `fixtures/` 확인)?
3. 결과에 따라 `phases/owner-feedback-rules/index.json`의 step 0 갱신:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약(신규 파일·마이그 번호·핵심 결정)"`.
   - 3회 시도 후 실패 → `"status": "error"`, `"error_message"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단.

## 금지사항

- 훅이·썸네일·유이 prepare/프롬프트/fixture를 수정하지 마라. 이유: 주입은 step2 책임이며, 이 step에서 건드리면 promptHash가 바뀌어 골든 fixture가 깨진다.
- 마이그만 넓히고 `database.types.ts`를 안 넓히지 마라(또는 그 반대). 이유: 스키마-타입 드리프트가 다음 step typecheck를 깬다.
- 순수 병합/매핑 로직에 server-only(auth/admin) import를 넣지 마라. 이유: vitest(node)가 직접 import 못 해 스위트 로드가 깨진다.
- draft를 자동으로 active로 만들지 마라. 이유: 활성화는 사람 게이트다.
- 명세에 없는 신규 untracked 파일(부산물·docs·다이어그램)을 커밋에 섞지 마라. `git status`로 확인 후 범위 외 제외.
- 기존 테스트를 깨뜨리지 마라.
