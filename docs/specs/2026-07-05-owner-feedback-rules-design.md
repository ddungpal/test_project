# 김짠부 직접 피드백 학습 (owner feedback → 최우선 룰) — 설계

_2026-07-05 · brainstorming 승인 완료 · task `owner-feedback-rules`_

## 문제

훅이(제목)·썸네일 카피는 이미 `style_profiles`(`title`/`thumbnail_copy`) 학습이 배선돼
있지만, 현재 학습 소스는 **정량 성과(CTR·A/B)**, **@zzanboo 과거 제목 50개**, **비유 STT**
뿐이다. 정작 **김짠부가 후보를 보고 말로 주는 정성 피드백**("이건 낚시라 별로, 숫자가
없으면 안 눌러, '~하는 법'은 식상")을 담지도 배우지도 못한다. 이 피드백이야말로 지금까지
놓친 "큰 규칙"의 출처다.

## 결정 (재litigate 금지)

- **(A) 문구 텍스트만** — 썸네일은 이미지 아닌 메인2·박스2 텍스트, 제목은 텍스트. 이미지/비전 없음.
- **(2) 추출기 증류** — 원문 피드백 + 입력 후보를 근거로 짧은 명령형 규칙으로 뽑는다. 원문·후보는 provenance로 보존.
- **누적·병합** — 새 피드백은 기존 활성 규칙과 병합(dedup·모순 시 최신 우선·나머지 유지). 규칙셋이 김짠부의 "놓친 큰 규칙들" 살아있는 목록으로 커진다.
- **최우선 주입** — 김짠부 피드백 규칙은 다른 모든 학습(insights·style_profile) **뒤(맨 마지막)** 에 주입돼 "충돌 시 무조건 이걸 따른다" 헤더로 최상위가 된다.
- **UI** — `/copy-learn` 안에 "김짠부 직접 피드백 (제목)"·"(썸네일)" 섹션 2개. 별도 페이지 없음.

## 아키텍처

기존 `analogy-learning`(4step) 구조를 미러하되 STT가 없어 3 step.

### 저장 — `style_profiles` 재사용
신규 `component_type` 2개: `title_owner_rules`, `thumbnail_owner_rules`. draft→active·version·
partial-unique(active 1개)·`activateCopyStyle` 활성화 머신을 전부 재사용. `patterns` jsonb:
```json
{
  "rules": ["제목엔 구체 수치를 포함한다", "낚시성 과장 금지"],
  "sources": [{ "topic": "...", "candidates": [...], "feedback": "원문 그대로" }]
}
```
`rules` = 주입되는 증류 규칙. `sources` = provenance(원문·후보 보존, 뉘앙스 유실 완화).

### 추출기 — `owner_feedback_extractor`
제목·썸네일 공용(component 인자). 입력 `{component, existingRules[], candidates, feedback}`
→ 출력 `{rules: string[], change_note}`. 병합 규칙을 프롬프트에 명시. 개발은 claude-p($0)·fixture replay.

### 흐름
`submitOwnerFeedback({component, topic?, candidates, feedback})` → requireOwner → 활성 rules
로드 → 추출기 → `style_profiles` draft INSERT(version = 해당 component_type 스코프 max+1).
활성화 안 함(사람 게이트). owner가 `/copy-learn`에서 "최신 초안 활성화" →
`activateCopyStyle('title_owner'|'thumbnail_owner')`(기존 액션 재사용, 매핑 2줄만 추가).

### 주입 (최상위가 되는 지점)
`shared/styleProfile.ts`에 `loadActive{Title,Thumbnail}OwnerRules`·`append{Title,Thumbnail}OwnerRules`.
prepare 합성 순서에서 **맨 마지막** 래퍼로 감싼다:
```
hook:  appendTitleOwnerRules( appendTitleStyle( appendLearnedInsights(SYSTEM, learned), titleStyle ), ownerRules )
thumb: appendThumbnailOwnerRules( appendWinningThumbnailRefs( appendThumbnailStyle( appendLearnedInsights(SYSTEM, learned), style ), winningRefs ), ownerRules )
```
헤더: `━━ ⚠️ 김짠부 최우선 지시 (다른 학습과 충돌하면 무조건 이걸 따른다) ━━`.

## 불변식

- 활성 owner rules 없으면 `append*OwnerRules`는 `return system` 바이트 동일 → promptHash·골든 fixture 불변. (다른 append* 함수와 동일 패턴.)
- persona 지시문(`HOOK_PERSONA_DIRECTIVE` 등)은 owner rules append **이후**에 붙던 순서 유지 — persona가 owner보다 뒤가 되지 않게 주의(현 코드는 style 뒤 persona. owner를 style~persona 사이 마지막 학습 래퍼로 넣는다).
- 후처리 가드(titleSignature·referenceGuard·mainEndings 등)는 그대로 — owner rules는 생성 단계만 흔든다.

## 범위 밖 (YAGNI)

- 후보별(per-candidate) 피드백 매핑 — 세트 단위 홀리스틱만.
- 규칙 자동 활성화 — 사람 게이트 유지.
- 피드백→insights 이중 기록 — style_profiles owner rules 단일 소스.
