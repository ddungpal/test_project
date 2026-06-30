# Step 3: persona-ui (타겟 페르소나 표시 + 인라인 편집)

타겟 페르소나 마지막 step. 김짠부가 주제 후보에서 **타겟을 보고** 선택하고, 확정한 주제의
페르소나를 **손질**할 수 있게 한다(편집값은 `edited_payload` 우선 반환으로 구다리·짠펜에 자동 전파).
백엔드(편집 액션·게이트 헬퍼)는 Max, 표시·편집 컴포넌트는 Esther. 설계 전문:
`docs/specs/2026-07-01-target-persona-design.md`(§C).

## 읽어야 할 파일

- `docs/specs/2026-07-01-target-persona-design.md` — §C, 불변식.
- `src/lib/dashboard/proposalTypes.ts` — 주제 후보/선택 페이로드 타입(UI가 읽는 형태).
- `src/components/CandidateBody.tsx` — `stage === "topic"` 분기(line 15~). **이미
  `🎯 {p.audience_need}`를 렌더한다(line 26 근처)** → persona는 별도/구분되게 표시(아래 주의).
- `src/components/PostConfirmTitleEdit.tsx` — **편집 컴포넌트가 미러할 패턴**(확정 후 손편집·상태
  전이 없음·`editTitle` 호출·`router.refresh`).
- `src/app/actions/topicRun.ts` — `editTitle`(line 167 근처) 액션 패턴. 여기에 신규
  `editTopicPersona`를 추가한다.
- `src/pipeline/gate.ts` — `editSelectedTitle`(line 156 근처). 여기에 신규 `editSelectedTopic`을
  추가한다(미러). `editTitle` → `editSelectedTitle` 흐름이 `edited_payload`를 쓰는 방식 확인.
- `src/pipeline/context.ts` — `getSelectedStagePayload`가 `edited_payload`를 우선 반환(편집한
  persona가 다운스트림에 자동 전파되는 이유).
- `src/app/runs/[id]/page.tsx` — `StageSection`의 `sv.selection` 분기(확정 요약). title_thumb가
  `PostConfirmTitleEdit`를 렌더하는 위치(line 101~108 근처)와 **대칭으로** topic stage에 편집
  컴포넌트를 단다.
- step 0~2 산출물: persona가 topic payload에 보존·구다리·짠펜이 읽음.

## 작업

### A. 표시 (Esther)

- `proposalTypes.ts`: 주제 후보/페이로드 타입에 `target_persona?: string` 추가(UI가 읽을 수 있게).
- `CandidateBody.tsx` `stage === "topic"` 분기: `p.target_persona`가 있으면 **"🎯 타겟: …"** 한 줄
  표시. **주의:** 기존 line 26이 `🎯 {audience_need}`를 이미 쓴다 → 두 줄이 똑같은 🎯로 헷갈리지
  않게, persona를 주(主) "🎯 타겟: <persona>"로 두고 audience_need는 마커를 바꾸거나(예: "· 욕구:
  …") 보조 위계로 내린다. TRUS 3색, 이모지는 타겟 마커 1개만.

### B. 인라인 편집 (Max — 백엔드, Esther — 컴포넌트)

- `gate.ts` `editSelectedTopic(supa, runId, payload, editedBy)` 신규 — `editSelectedTitle` 미러:
  topic stage가 **확정(선택 기록)된 후에만** topic selection의 `edited_payload`에 payload를 저장.
- `topicRun.ts` `editTopicPersona(runId, persona: string)` 신규 액션:
  - `requireOwner()` →
  - 현재 선택된 주제 payload를 읽어(편집본 우선 = `getSelectedStagePayload("topic")`) **그 payload의
    `target_persona`만 교체**하고 나머지 필드(title·audience_level·audience_need 등)는 **그대로
    보존**한 새 payload를 만든다 →
  - `editSelectedTopic`로 저장 →
  - `auditLog(action: "stage_edited", detail: { stage: "topic" })`.
  - **불변식:** persona만 바꾼다. title 등 다른 필드를 덮어쓰면 다운스트림(제목·구성)이 깨진다.
- `PostConfirmTopicPersonaEdit.tsx` 신규(= `PostConfirmTitleEdit` 미러): 현재 persona를 인풋 기본값으로
  보여주고, 저장 시 `editTopicPersona(runId, value)` 호출 후 `router.refresh()`. 'use client'.
- `page.tsx`: `StageSection`의 topic 확정 요약(`sv.selection` 분기)에 `PostConfirmTopicPersonaEdit`를
  렌더(title_thumb의 `PostConfirmTitleEdit` 위치와 대칭). topic stage일 때만.

## 디자인(Esther)

TRUS 3색(black/yellow/white)만. 그라데이션·그림자·라운딩·이모지 남발 금지(타겟 마커 🎯 1개 허용).
편집 인풋·저장 버튼은 `PostConfirmTitleEdit`의 기존 스타일을 재사용(새 시각 패턴 만들지 말 것).

## 테스트

- `editTopicPersona`(또는 `editSelectedTopic`): persona만 교체되고 title·audience_level·
  audience_need가 보존되는지, `edited_payload`에 저장되어 `getSelectedStagePayload("topic")`가
  편집된 persona를 반환하는지(fake supa 라운드트립 — `editTitle`/`reviewScript` 테스트 패턴 참고).
- 잘못된 입력(빈 문자열) 처리는 액션/컴포넌트 재량(최소: 빈 값 저장 방지).

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과
npm run build       # next build, 에러 0 — /runs/[id] 포함 전 라우트 생성
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - 주제 후보 카드에 "🎯 타겟"이 표시되고 audience_need와 시각적으로 구분되는가?
   - `editTopicPersona`가 **persona만** 교체·다른 필드 보존하는가? `edited_payload` 우선 반환으로
     편집값이 구다리·짠펜에 전파되는가?
   - `editSelectedTopic`이 확정 후에만 동작하는가(미확정 시 에러)?
   - 서버 전이 로직을 UI에서 중복하지 않았는가(액션만 호출)? TRUS 3색만 썼는가?
   - 마이그레이션 0인가? `proposalTypes` 타입 추가가 기존 소비처를 안 깨뜨리는가(옵셔널)?
3. 결과 반영(step 3): 성공 → `completed`+`summary` / 3회 실패 → `error` / 사람 개입 → `blocked`.

## 금지사항

- `editTopicPersona`에서 persona 외 필드(title·audience_*)를 덮어쓰지 마라. 이유: 제목·구성 등
  다운스트림이 같은 payload를 읽어 깨진다. persona만 병합 교체.
- 컴포넌트 파일을 새 시각 패턴으로 만들지 마라(`PostConfirmTitleEdit` 미러). 이유: 일관성·안티슬롭.
- 서버 상태 전이/검증을 UI에서 중복하지 마라. 이유: 액션이 단일 출처.
- 촉이·구다리·짠펜 백엔드를 건드리지 마라. 이유: 이 step은 UI 표시·편집만(전파는 step 1·2 완료).
- 마이그레이션 추가 금지. 기존 테스트를 깨뜨리지 마라.
- `npm run build`가 `Cannot find module './xxx.js'`로 깨지면 stale `.next` 의심 — `rm -rf .next` 후
  재빌드로 판별.
