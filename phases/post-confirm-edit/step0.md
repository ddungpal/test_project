# Step 0: edit-actions

## 읽어야 할 파일

먼저 아래를 읽고 확정/선택 데이터 모델과 상태 전이 제약을 이해하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 프로젝트 규칙·가드레일
- `src/pipeline/gate.ts` — `selectProposal()`(제목 선택+전이), `confirmThumbnailSet()`(썸네일 3세트 확정), `transitionRun` 사용처
- `src/pipeline/context.ts` — `getSelectedStagePayload()`: **최신 selection 행의 `edited_payload`를 우선 반환**(이 phase가 성립하는 근거)
- `src/app/actions/topicRun.ts` — `selectTitles()`, `confirmThumbnails()`, `requireOwner()`, `auditLog()` 패턴
- `src/domain/enums.ts` — `ALLOWED_TRANSITIONS`, `STAGE_DESCRIPTORS`
- DB 스키마 참고: `stage_proposals`(run_id·stage·candidates), `stage_selections`(proposal_id·chosen_idx·edited_payload·selection_reason·selected_by)

## 배경

- 제목은 확정 **전** 인라인 수정(`edited_payload`)이 이미 있으나, 확정 **후** 수정 경로가 없다.
- 썸네일은 인라인 수정이 전혀 없다. `confirmThumbnailSet`은 A/B/C 3개 payload를 배열로 `edited_payload`에 저장한다.
- `selectProposal`/`confirmThumbnailSet`은 **상태 전이를 동반**한다. 이미 `titles_selected`/`thumbnails_selected` 상태에서 다시 부르면 트리거가 거부한다(자기 전이가 합법 전이표에 없음). 그래서 **전이 없는 edit 전용 경로**가 필요하다.

## 작업

`src/pipeline/gate.ts`에 전이 없이 selection만 새로 INSERT하는 함수 2개를 추가한다(시그니처는 아래, 구현은 재량):

```ts
// 최신 title_thumb proposal에 수정본 payload로 새 selection 행 INSERT. 상태 전이 없음.
export async function editSelectedTitle(
  supa: Supa, runId: string, payload: TitlePayload, editedBy: string,
): Promise<{ selectionId: string }>;

// 최신 thumbnail proposal에 수정본 payload 배열(정확히 3개)로 새 selection 행 INSERT. 상태 전이 없음.
export async function editSelectedThumbnails(
  supa: Supa, runId: string, payloads: ThumbnailPayload[], editedBy: string,
): Promise<{ selectionId: string }>;
```

구현 규칙(반드시):
- 해당 stage의 **최신 proposal**(created_at desc)을 찾아 그 `proposal_id`로 `stage_selections` 행을 INSERT한다. `edited_payload`에 수정본을 넣는다(제목=단일 객체, 썸네일=배열).
- 현재 run 상태가 그 stage의 `selectedState`인지 **검증**하라(아니면 throw — 확정 전엔 기존 select/confirm 경로를 쓴다).
- `chosen_idx`: 제목은 기존 selection의 chosen_idx를 보존하거나 0, 썸네일은 0(센티넬). `selected_by = editedBy`.
- 썸네일 payloads는 **정확히 3개**가 아니면 throw(기존 confirm 계약과 일치).

`src/app/actions/topicRun.ts`에 서버 액션 2개를 추가한다:

```ts
export async function editTitle(runId: string, payload: TitlePayload): Promise<void>;
export async function editThumbnails(runId: string, payloads: ThumbnailPayload[]): Promise<void>;
```

- 각각 `requireOwner()` → gate 함수 호출 → `auditLog`(action 예: `"stage_edited"`, detail에 stage 명시) → `revalidatePath`/필요 시 무반환.
- 타입은 기존 `TitlePayload`/`ThumbnailPayload`(또는 동등 타입)를 재사용하라. 새로 만들지 마라.

## 테스트

`tests/`에 gate 함수 단위 테스트를 추가한다(기존 gate 테스트 패턴 참고):
- 확정 상태(selected)에서 edit 호출 → 새 selection 행 1개 추가, **run 상태 불변**, `getSelectedStagePayload`가 수정본 반환.
- 확정 전(proposed) 상태에서 edit 호출 → throw.
- 썸네일 payloads 길이 ≠ 3 → throw.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(build가 stale `.next` 캐시로 `PageNotFoundError`/webpack `MODULE_NOT_FOUND`로 깨지면 `rm -rf .next` 후 재빌드로 판별 — rules.md 참조.)

## 검증 절차

1. 위 AC 커맨드를 실행한다(전부 exit 0).
2. 아키텍처 체크리스트:
   - `transitionRun`을 **호출하지 않았는가**(이 step의 핵심 — 호출하면 트리거가 거부).
   - 새 마이그레이션을 만들지 않았는가.
   - `getSelectedStagePayload`가 최신-우선으로 수정본을 읽는 계약을 깨지 않았는가.
3. `phases/post-confirm-edit/index.json`의 step 0을 갱신:
   - 성공 → `"status":"completed"`, `"summary":"산출물 한 줄 요약"`
   - 3회 시도 실패 → `"status":"error"`, `"error_message":"..."`
   - 사용자 개입 필요 → `"status":"blocked"`, `"blocked_reason":"..."` 후 중단

## 금지사항

- `transitionRun`을 호출하지 마라. 이유: `titles_selected`/`thumbnails_selected`는 합법 전이표에 자기 전이가 없어 DB 트리거가 거부한다. 이 phase는 상태를 바꾸지 않고 selection만 새로 쓴다.
- 새 DB 마이그레이션을 만들지 마라. 이유: 기존 `stage_selections` 스키마로 충분하다(역전이 불필요).
- 다운스트림 재생성을 트리거하지 마라(이 step은 백엔드 저장만). UI는 다음 step.
- 기존 `selectProposal`/`confirmThumbnailSet`의 동작·시그니처를 바꾸지 마라(확정 전 경로 보존).
- 기존 테스트를 깨뜨리지 마라.
