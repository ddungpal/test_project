# 짠펜 파트별 수정 (segment-edit) — 설계

_2026-07-02 · 대화로 확정(brainstorming) · Phase C (쏙이 개선 3/3·가장 큼)_

## 목적 (item 5)

스크립트를 **전체 재작성 말고 파트(세그먼트)별로** 손보게 한다: ① 프로즈 텍스트 **직접 수정**, ② 파트별 **사유 재생성**. 구성편집(structure-editing)이 명시 보류했던 "섹션 단위 AI 재생성"의 스크립트판.

## 현황 (제약)

- 세그먼트는 `script_segments` 테이블(`content_id, run_id, ord, text, kind, payload`)에 정규화 저장 + lineage 조인테이블 2개(`script_segment_facts`, `_explanation_assets`).
- 짠펜(`runScriptStage`)은 **run 전체 delete-후-insert만** — 세그먼트 단위 경로 없음. 구성편집처럼 `edited_payload` 한 방으로 전파 불가 → `script_segments` 행 직접 조작 신규 경로 필요.
- `SegmentList`/`SegmentBody`는 읽기 전용.

## 결정 (확정·전부 A)

- **직접 수정 = 프로즈 텍스트만**(kind=prose/null). 블록(table/case/visual)은 재생성으로(payload 직접편집 미포함).
- **세그먼트 재생성 = 단일 세그먼트 집중 모드**(짠펜 부분 모드·주변 맥락+그 세그먼트 lineage 사실+사유). **비동기 Inngest**(callLLM 타임아웃 회피·`regenerateAfterConfirm` 패턴).
- **충돌 = 허용 + 경고**: 수동 수정/재생성분이 있는데 전체 재작성(fact 반려)이 돌면 덮어씀 → staleness 경고 배너만(차단 X).
- **노출 = `script_review`(검수) + `approved`(완료)**. published 제외.

## Step 분해

### step0 `segment-edit-backend` (백엔드·순수+액션)
- 액션 `editSegment(runId, segmentId, text)` — `requireOwner` → `script_segments.text` update(해당 run·segment 스코프·`.eq run_id`·`.eq id`) → `auditLog("segment_edited")`. **전이·AI 0.** 프로즈만(kind가 table/case/visual이면 거부 또는 무시).
- 순수 `isScriptDownstreamStarted(state): boolean`(`src/lib/script/staleness.ts`·approved/published·outline staleness 미러). vitest 경계.

### step1 `segment-edit-ui` (프론트)
- `SegmentList`/`ScriptReview` 프로즈 세그먼트에 **인라인 편집**(수정 버튼→textarea→저장 `editSegment`). OutlineEditor 제어 패턴 미러(상태 부모). 블록 세그먼트는 편집 버튼 미노출. `script_review`+`approved`에서. TRUS 3색.

### step2 `segment-regen-backend` (백엔드)
- 짠펜 **단일 세그먼트 재생성 모드**: 신규 `regenerateSegment(supa, runId, segmentId, reason, deps)` — 그 세그먼트 + 앞뒤 맥락(인접 세그먼트 text) + 그 세그먼트 lineage 사실/자산 + 사유를 입력으로 짠펜 1회 호출 → **그 `script_segments` 행만** update(+lineage 재설정). 전량 delete 금지. `normalizeSegmentPayload` 재사용.
- Inngest 이벤트 `run/segment.regen.requested` data `{runId, segmentId, reason}` → 신규 함수(concurrency runId) → withStageRuntime(비용가드). 액션 `requestSegmentRegen(runId, segmentId, reason)`가 발행(동기 callLLM 금지).

### step3 `segment-regen-ui` (프론트)
- 파트별 **"재생성"** 버튼 → 사유 textarea → `requestSegmentRegen` 발행 → 폴링(그 세그먼트 갱신 감지). **staleness 경고 배너**: `isScriptDownstreamStarted`면 "이후 전체 재작성 시 개별 수정분이 사라집니다"(차단 X). `script_review`+`approved`.

## 불변식
- 마이그레이션 0(기존 text/payload/lineage 컬럼 재사용). 의존성 0.
- 세그먼트 편집/재생성은 **run 상태 전이 0**(구성편집 미러). 전체 재작성(runScriptStage)은 무변경.
- 단일 세그먼트 재생성은 **그 행만** 건드림(다른 세그먼트·표절검사 전체 재실행 X).

## 비스코프
- 블록 payload 직접 편집. 세그먼트 추가/삭제/순서변경(v1은 수정·재생성만). 수동 편집분 보존(전체 재작성 시 덮어씀·경고만).
