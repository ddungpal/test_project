# Step 0: relax-edit-state-guard

## 읽어야 할 파일

먼저 아래를 읽고 손편집 가드와 확정 데이터 모델을 이해하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `src/pipeline/gate.ts` — **버그 위치**:
  - `editSelectedTitle`(131-168): 139-141 `if (run.state !== desc.selectedState) throw` ← 과한 가드
  - `editSelectedThumbnails`(172-202): 184-186 동일 가드
  - `latestProposal`·`STAGE_DESCRIPTORS` 사용 패턴
- `src/lib/dashboard/selectionResolve.ts` 및 `src/lib/dashboard/runDetail.ts` — selection을 stage 횡단으로 읽는 방식(직전 regen-confirmed-view-fix phase 산출물). "stage가 확정됐는지"는 그 stage의 어느 proposal에든 selection이 있는지로 판정한다(최신 proposal 한정 아님 — AI 재생성이 새 proposal을 만들기 때문)
- `src/domain/enums.ts` — `STAGE_DESCRIPTORS`(stage·fromState·proposedState·selectedState)
- `tests/editSelected.test.ts` — 기존 손편집 테스트(fake supa 패턴). 회귀 케이스 추가

## 근본원인

`editSelectedTitle`/`editSelectedThumbnails`는 `run.state === desc.selectedState`(확정 *직후* 상태)에서만 동작한다. 사용자가 다음 단계로 진행하면(예: 썸네일 확정 → `thumbnails_selected`) run.state가 바뀌어 제목 손편집이 영구 차단된다. 의도는 "**확정한 적이 있으면** 언제든 손편집 가능"이다.

## 작업

`editSelectedTitle`·`editSelectedThumbnails`의 상태 가드를 **"해당 stage가 이미 확정됨"** 으로 바꾼다:

- 판정: 그 stage의 proposal들 중 **selection이 하나라도 존재**하면 확정된 것으로 보고 편집을 허용한다(현재 run.state 무관 — 다운스트림 포함). selection이 전혀 없으면(=확정 전) throw 유지(확정 전엔 ProposalSelector/ThumbnailStudio 경로를 쓴다).
- **"selection 존재"는 최신 proposal에 한정하지 마라.** AI 재생성(post-confirm-regenerate)이 새 proposal을 만들면 확정 selection은 이전 proposal에 있다 → stage 횡단으로 본다(이 run의 그 stage proposal들 전체에서 selection 존재 여부).
- 그 외 동작은 그대로: `latestProposal`에 새 selection INSERT(상태 전이 없음), 썸네일 length===3 가드 유지, chosen_idx 보존(title), editedBy 기록.
- throw 메시지는 "확정 전이라 손편집 불가" 취지로 갱신(상태명 하드코딩 대신 "확정 후에만 가능").

⚠️ 기존 한계는 그대로 둔다(이 phase 범위 아님): 제목 손편집은 이미 생성된 하위 단계(썸네일·구성·대본)에 자동 전파되지 않는다(수동 보정용).

## 테스트

`tests/editSelected.test.ts`에 회귀 케이스 추가(fake supa):
- title_thumb 확정 후 run.state가 **다운스트림**(예: `thumbnails_selected`)일 때 `editSelectedTitle` → 성공(새 selection INSERT, throw 안 함).
- thumbnail 확정 후 run.state가 다운스트림(예: `structure_proposed`)일 때 `editSelectedThumbnails` → 성공.
- 확정 전(selection 없음)에 호출 → throw(회귀 가드).
- (regen 상호작용) 확정 selection이 이전 proposal에 있고 더 새 proposal이 있어도 편집 허용 + 새 selection은 latestProposal에 INSERT.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 가드가 run.state 정확일치가 아니라 **stage 확정 여부(selection 존재, stage 횡단)** 인가.
   - 확정 전 호출은 여전히 throw인가.
   - 상태 전이/마이그레이션을 추가하지 않았는가(새 selection INSERT만).
   - 썸네일 length===3·chosen_idx 보존 등 기존 불변식 유지.
3. `phases/edit-guard-downstream/index.json`의 step 0 갱신(completed+summary / error / blocked).
   - **주의(rules.md)**: index.json은 반드시 **유효한 JSON**으로 저장하라(닫는 `}`·쉼표 확인).

## 금지사항

- 상태 전이(`transitionRun`)나 마이그레이션을 추가하지 마라. 이유: 손편집은 상태를 바꾸지 않고 새 selection만 INSERT한다(기존 설계).
- "selection 존재"를 최신 proposal에만 한정하지 마라. 이유: AI 재생성이 새 proposal을 만들면 확정 selection은 이전 proposal에 있다 — stage 횡단으로 봐야 한다.
- 확정 전(selection 없음)에 편집을 허용하지 마라(throw 유지).
- post-confirm-regenerate·regen-confirmed-view-fix 산출물(백엔드 postConfirm 모드·뷰 selection 해석)을 바꾸지 마라.
- 기존 테스트를 깨뜨리지 마라.
