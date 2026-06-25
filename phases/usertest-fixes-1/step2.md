# Step 2: stepper-thumbnail-stage

**진행 스테퍼를 5단계 → 6단계로 분리해 썸네일을 별도 단계로 보여준다.** 현재 UI는 "제목·썸네일"을 한 단계로 합쳐 표시하지만, 내부적으로 제목(title_thumb)·썸네일(thumbnail) 단계는 이미 분리돼 있다. **표시층만** 고친다: 주제 → **제목 → 썸네일** → 구성 → 리서치 → 대본.

## 배경 (왜 이렇게 — 로직은 이미 옳고, 라벨/매핑만 낡았다)
- 내부 단계 로직(`src/pipeline/stages.ts`의 `STAGE_DESCRIPTORS` title_thumb/thumbnail, 상태 전이, 데이터 구조)은 title-thumbnail-split phase에서 **이미 분리 완료**.
- 그런데 스테퍼·라벨은 "5단 압축" 시절 표기가 남아, 썸네일 단계가 제목 단계(step 1)에 흡수돼 보인다. 실사용에서 혼동.
- 사용자 결정: **썸네일을 별도 단계로 추가**(6단계). 표시 위치만 손댄다.

## 읽어야 할 파일 (먼저 정독)
- `src/lib/dashboard/stageProgress.ts` — `PIPELINE_STEPS`(5개 StepDef)와 `STATE_MAP`(RunState→{step,phase}). **여기가 핵심.**
- `src/lib/dashboard/labels.ts` — `STATE_LABEL`(titles_* = "제목·썸네일 …", thumbnails_* = "썸네일 …" 이미 있음).
- `src/lib/dashboard/proposalTypes.ts` (75줄 부근) — `STAGE_TITLE` title_thumb = "제목 · 썸네일".
- `src/components/StageStepper.tsx` — `PIPELINE_STEPS`를 순회해 렌더(라벨·crew 표시). 로직 변경 불필요(배열만 바뀌면 자동 반영).
- `src/pipeline/stages.ts` — `STAGE_DESCRIPTORS`(읽기만 — **건드리지 마라**, 이미 분리됨).

## 작업
### 1) `PIPELINE_STEPS`에 썸네일 단계 추가 (`stageProgress.ts`)
현재:
```ts
{ key: "topic", label: "주제", crew: "촉이" },
{ key: "title", label: "제목·썸네일", crew: "훅이" },
{ key: "structure", label: "구성", crew: "구다리" },
{ key: "research", label: "리서치", crew: "셜록" },
{ key: "script", label: "대본", crew: "짠펜" },
```
→ 6개로(제목 라벨 정리 + 썸네일 추가):
```ts
{ key: "topic", label: "주제", crew: "촉이" },
{ key: "title", label: "제목", crew: "훅이" },
{ key: "thumbnail", label: "썸네일", crew: "훅이" },
{ key: "structure", label: "구성", crew: "구다리" },
{ key: "research", label: "리서치", crew: "셜록" },
{ key: "script", label: "대본", crew: "짠펜" },
```
`StepDef.key`가 union 타입이면 "thumbnail"을 union에 추가한다.

### 2) `STATE_MAP` 재인덱싱 (`stageProgress.ts`) — **신중하게**
썸네일이 step 2가 되면서 그 뒤 단계가 한 칸씩 밀린다. 새 인덱스(0=주제,1=제목,2=썸네일,3=구성,4=리서치,5=대본):
- `topic_*` → step 0 (유지)
- `topic_selected` → step 1 await_start
- `titles_proposed` → step 1 await_select
- `titles_selected` → step 2 await_start (제목 확정 → 썸네일 시작 대기)
- `thumbnails_proposed` → step 2 await_select  ← (기존 step 1 흡수에서 **분리**)
- `thumbnails_selected` → step 3 await_start (썸네일 확정 → 구성 시작)
- `structure_proposed` → step 3 await_select
- `structure_selected` → step 4 await_start
- `researching`/`research_ready`/`research_review` → step 4
- `research_approved` → step 5 await_start
- `scripting`/`script_ready`/`script_review` → step 5
- `approved`/`published` → step 5 done
- `paused_soft_cap` → 리서치/스크립트 정지이므로 step 4 working
- `aborted` → step 0 done
- `created` → step 0 working

**모든 RunState 키가 빠짐없이 매핑돼야 한다**(Record<RunState, ...> 타입이 강제). 기존 주석("5단 스테퍼상 제목 스텝에 흡수")은 제거/갱신.

### 3) 라벨 정리
- `labels.ts` `STATE_LABEL`: `titles_proposed: "제목 제안됨"`, `titles_selected: "제목 선택됨"`(← "제목·썸네일 …"에서 변경). thumbnails_* 는 이미 "썸네일 제안됨/선택됨"이라 그대로.
- `proposalTypes.ts` `STAGE_TITLE`: `title_thumb: "제목"`(← "제목 · 썸네일"). thumbnail은 이미 "썸네일".
- (선택, 필수 아님) `src/inngest/functions/hookStage.ts`의 함수 name "훅이 — 제목·썸네일 제안" → "훅이 — 제목 제안". 사용자 미노출(로그용)이라 안 해도 됨.

## 주의 (구체)
- **`STAGE_DESCRIPTORS`·상태 전이 로직·enums를 건드리지 마라.** 이유: 내부 단계는 이미 올바르게 분리됐다. 이 step은 **표시층(PIPELINE_STEPS·STATE_MAP·라벨)만**. 전이/디스크립터를 바꾸면 파이프라인이 깨진다.
- **STATE_MAP의 모든 RunState를 빠짐없이 갱신하라.** 이유: 하나라도 옛 인덱스로 남으면 그 상태에서 엉뚱한 단계가 하이라이트된다. 특히 structure 이후가 +1 밀렸는지 전수 확인.
- 새 step `key: "thumbnail"`이 StageStepper 등 PIPELINE_STEPS 소비처에서 문제없이 렌더되는지 확인(키 union·길이 가정 하드코딩 없는지).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. 위 AC 커맨드를 실행한다(Joy가 git diff + AC로 검수).
2. 아키텍처 체크: 표시층만 변경됐는지(stages.ts·전이·enums 무변경), STATE_MAP 전 상태 매핑, 6단계 일관성(주제→제목→썸네일→구성→리서치→대본).
3. 결과에 따라 `phases/usertest-fixes-1/index.json`의 step 2를 업데이트(completed+summary / error / blocked).

## 금지사항
- `STAGE_DESCRIPTORS`·상태 전이·enums 변경 금지. 이유: 이미 옳음 — 표시층만 손댄다.
- STATE_MAP 일부 상태 누락/미갱신 금지. 이유: 잘못된 단계 하이라이트.
- 기존 테스트를 깨뜨리지 마라.
