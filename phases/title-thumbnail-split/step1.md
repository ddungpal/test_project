# Step 1: title-thumbnail-agents

**에이전트 분리 — 훅이(hook_maker)=제목 3개 전용 / 새 썸네일메이커(thumbnail_maker)=선택된 제목으로 썸네일 3개.** step0의 상태/스테이지 위에 실제 생성 로직을 올린다.

## 선행 (step0 산출물 — 먼저 확인)
- step0이 만든 것: 새 상태 `thumbnails_proposed`/`thumbnails_selected`, `STAGE_DESCRIPTORS.thumbnail`(roleId `"thumbnail_maker"`, from `titles_selected`, proposed `thumbnails_proposed`), `PIPELINE.thumbnail`(event `"run/thumbnails.requested"`), `ProposalStage`에 `"thumbnail"`, `ThumbnailPayload`(thumbnail_main[2]·thumbnail_boxes[2]·thumbnail_layout?). 마이그레이션 SQL(미적용).

## 읽어야 할 파일 (먼저 정독)
- `src/agents/roles.ts` — `ROLES`. **`thumbnail_maker` 역할 추가**(roleId 안정·영구).
- `src/agents/hook_maker/{schema.ts,prepare.ts,stage.ts,referenceGuard.ts,styleConformance.ts}` — **이 5개가 썸네일메이커의 템플릿이자, 훅이를 제목전용으로 줄이는 대상.** 현재 hook_maker는 제목+썸네일을 같이 낸다.
- `src/agents/shared/styleProfile.ts` — `loadActiveThumbnailStyle()`(A/B 학습 스타일). 썸네일 prepare가 주입.
- `src/inngest/functions/{hookStage.ts,_shared.ts}` — Inngest 제안단계 함수 패턴(`executeProposalStage`, force 전달). **미러해서 thumbnailStage.ts.**
- `src/inngest/functions/index.ts`·`src/inngest/client.ts` — 함수 레지스트리 + StageData 이벤트 타입(force/softAck). 새 함수·이벤트 등록.
- `src/app/actions/topicRun.ts` — `requestTitles`/`requestStructure`(이벤트 발행 패턴). **`requestThumbnails` 추가.**
- `src/pipeline/runState.ts`(getRun 등)·`src/pipeline/gate.ts`(stage_selections에서 선택된 제목 읽기 참고).

## 작업
### 1) 훅이(hook_maker) → 제목 3개 전용
- `schema.ts`: `HOOK_MAKER_SCHEMA`·`HOOK_MAKER_SYSTEM`에서 **썸네일 출력(thumbnail_main/thumbnail_boxes 등) 제거** → 후보 = **제목(title) 3개**만(메인 카피·박스 없음). 후보 개수 3개(minItems/maxItems 일관).
- `stage.ts`(`toCandidates`): 썸네일 파생(thumbnail_copy/style_conformance 등) 제거. **제목의 `ref_similarity`(레퍼런스 베낌 경고) 주석은 유지**(제목도 베끼면 안 됨 — referenceGuard 그대로). style_conformance(썸네일 부합)는 제목엔 무의미 → 제거.
- `prepare.ts`: 썸네일 스타일 주입(appendThumbnailStyle 등)이 제목 prompt에 불필요하면 정리(제목은 reference_titles 유사도 가드만). 단, **promptHash가 바뀌면 기존 hook_maker 픽스처가 깨진다** — 이 step은 의미상 출력이 바뀌므로 픽스처 재기록이 불가피하다(record 모드 $0). eval/parity가 title_thumb 옛 형태(thumbnail 포함)를 기대하면 **eval을 신규형(제목 전용)만 보게 + 골든 1개 손작성**으로 오프라인 유지(직전 hook-thumbnail-revamp phase가 쓴 방식 — PROJECT_STATE 참고).
- `CandidateBody`·UI는 step3에서. 여기선 에이전트 출력/스키마만.

### 2) 새 역할 `thumbnail_maker` (`roles.ts`)
```ts
thumbnail_maker: { roleId: "thumbnail_maker", name: "썸네일메이커", defaultModel: "opus", tools: [] },
```
(roleId 영구·변경 금지. 현재 전 역할 opus 정책과 일치.)

### 3) 새 에이전트 `src/agents/thumbnail_maker/` (hook_maker 썸네일 절반을 독립)
- `schema.ts`: 출력 = **썸네일 후보 3개**, 각 후보 `{ thumbnail_main: [2], thumbnail_boxes: [2], thumbnail_layout? }`(메인2·박스2). minItems/maxItems 3(후보)·2(main/boxes). 빈배열 가능 필드는 required 금지(`?? []` 가드 — 빈배열 schema required 함정).
- `prepare.ts`: DB에서 run 컨텍스트 + **선택된 제목**(title_thumb 스테이지의 stage_selections에서 chosen 제목; editedPayload 우선) + 주제 + 참조 + `loadActiveThumbnailStyle()`(A/B 학습 패턴) 읽어 system/input 구성. 선택된 제목을 명시적으로 "이 제목에 맞는 썸네일" 지시로 넣는다.
- `stage.ts`: `thumbnailStageSpec(runId)` = `ProposalStageSpec<ThumbnailMakerOutput>` (hook_maker stage.ts 미러). `toCandidates`가 각 후보에 `ref_similarity`(referenceGuard 재사용) + `style_conformance`(styleConformance 재사용 — 이건 썸네일 부합이라 **여기 유효**) 주석. **promptHash 무관 자리(LLM 호출 후 변환)** 유지.
- `referenceGuard`·`styleConformance`는 hook_maker 것 재사용(import) 또는 thumbnail_maker로 이동/공유 — 중복 구현 금지.

### 4) Inngest 함수 + 이벤트 + 서버액션
- `src/inngest/functions/thumbnailStage.ts`: `inngest.createFunction({ id:"thumbnail-stage", ... onFailure: captureStageFailure("thumbnail"), concurrency runId limit 1, retries 2 }, { event:"run/thumbnails.requested" }, ... executeProposalStage(thumbnailStageSpec(runId), { softAck, force }))`. hookStage.ts 그대로 미러.
- `functions/index.ts`에 등록. `client.ts` StageData가 force/softAck 이미 있으면 그대로, 이벤트명만 추가 인지.
- `topicRun.ts`: `export async function requestThumbnails(runId): Promise<void>` — requireOwner + `inngest.send({ name:"run/thumbnails.requested", data:{ runId } })`. (regenerate/confirm은 step2/3.)

## 주의
- **roleId·stage id 안정성**: `thumbnail_maker`·`thumbnail`은 이제 영구 키. 오타·변경 금지.
- 선택된 제목 읽기: title_thumb의 stage_selections(chosen_idx→candidates[idx].payload.title, edited_payload 우선). run.state가 thumbnails_proposed로 가려면 그 전 titles_selected여야 함(정상 흐름).
- **픽스처/eval**: 훅이 출력형 변경 = promptHash 변경. record 모드($0)로 새로 기록되며, eval/parity가 깨지면 "신규형만 보게 + 골든 손작성"으로 오프라인 유지(재녹화 라이브 금지). 새 thumbnail_maker도 동일.
- 썸네일 산출물은 **정확히 3개**(A/B/C). 스키마로 강제하되 forced tool_use가 100% 보장 아님 → toCandidates에서 방어(부족 시 안전 처리).
- DB 마이그레이션 미적용 상태 — 라이브로 thumbnail 단계를 돌리려면 step0 SQL을 사용자가 먼저 적용해야 함. **이 step의 AC는 오프라인**(tc/test/build + 단위테스트)이라 무관.
- exactOptionalPropertyTypes·noUncheckedIndexedAccess. tsx top-level await 금지.

## 테스트 (`tests/`)
- thumbnail_maker `toCandidates`: 모의 출력 → 후보 3개·각 main[2]/boxes[2]·ref_similarity/style_conformance 주석 부착(순수·DB 0).
- hook_maker(제목전용) `toCandidates`: 후보가 제목만(썸네일 필드 없음)·ref_similarity 유지.
- prepare 순수 조합 부분이 있으면(선택 제목 합성) 단위 테스트.
- resolveModel("thumbnail_maker")==="opus".

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. `git diff`로 훅이가 제목전용이 됐고(썸네일 출력 제거), thumbnail_maker가 hook_maker 패턴을 따르는지, 픽스처 처리(신규형/골든)가 오프라인을 유지하는지 확인.
3. step 1 갱신: 성공 → `"status":"completed"` + `"summary":"훅이=제목3개 전용(썸네일 출력 제거·ref_similarity 유지) + 새 thumbnail_maker(opus, 선택제목+A/B스타일로 썸네일3개·ref_similarity·style_conformance 주석) + thumbnailStage Inngest(run/thumbnails.requested 미러) + requestThumbnails 액션. 픽스처 신규형/골든으로 오프라인 유지. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- roleId/stage id 변경·오타 금지(영구 키).
- 픽스처를 라이브로 대량 재녹화하지 마라(eval 신규형 필터 + 골든 손작성으로 오프라인 $0 유지).
- 빈배열 가능 필드를 schema required에 넣지 마라(api 무재시도서 편 전체 실패).
- 개별/전체 다시생성·UI·confirm은 범위 밖(step2/3).
- 기존 테스트를 깨뜨리지 마라(title_thumb 참조 코드 포함).
