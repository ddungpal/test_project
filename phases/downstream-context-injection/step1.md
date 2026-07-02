# Step 1: thumbnail-persona

타겟 페르소나(`target_persona`)를 **썸네일 메이커(`thumbnail_maker`)** 프롬프트에 조건부 주입한다. step0(hook-persona)과 **동일한 B 패턴**(input 키 + system 지시문)을 썸네일 에이전트에 적용한다.

## 읽어야 할 파일

먼저 아래를 읽고 설계 의도·패턴을 파악하라:

- `docs/specs/2026-07-02-downstream-context-injection-design.md` — phase 전체 설계.
- `phases/downstream-context-injection/step0.md` 및 step0 산출물 — **직전 step에서 만든 훅이 persona 주입.** 같은 패턴을 썸네일에 그대로 적용하면 된다. step0가 만든 `HOOK_PERSONA_DIRECTIVE`·`prepareHookMaker` 변경을 참고해 미러하라.
- `src/agents/scribe/schema.ts`·`step.ts` — 원본 참조 패턴(`SCRIBE_PERSONA_DIRECTIVE` 조건부 append).
- `src/agents/thumbnail_maker/prepare.ts` — **수정 대상.** `prepareThumbnailMaker(supa, runId)`. 현재 system을 `appendWinningThumbnailRefs(appendThumbnailStyle(appendLearnedInsights(THUMBNAIL_MAKER_SYSTEM, ...), ...), ...)`로 조립하고 selected_title·tone 등을 입력받는다.
- `src/agents/thumbnail_maker/schema.ts` — **수정 대상.** `ThumbnailMakerInput` 타입 + `THUMBNAIL_MAKER_SYSTEM` 상수.

## 작업

### 1) `src/agents/thumbnail_maker/schema.ts`

- `ThumbnailMakerInput`에 optional `target_persona?: string` 추가.
- `THUMBNAIL_PERSONA_DIRECTIVE` 상수 신설(step0의 `HOOK_PERSONA_DIRECTIVE` 미러). 내용: 썸네일 카피가 이 타겟의 **막막함을 정확히 후킹**하도록. **THUMBNAIL_MAKER_SYSTEM 본문은 늘리지 마라(promptHash 보존) — 별도 상수로 분리.**

### 2) `src/agents/thumbnail_maker/prepare.ts`

- topic payload에서 `target_persona`를 읽는다(step0·구다리와 동일 경로·edited_payload 우선).
- persona가 **있을 때만**: `input.target_persona = persona` + system 조립 체인에 `THUMBNAIL_PERSONA_DIRECTIVE` append.
- persona가 **없으면**: input 키·system append 생략 → **바이트 동일**. 기존 조건부 주입(`reference_thumbnail_copies`·`learned_insights`·`style_profile`·`reference_titles_external`·`reference_winning_thumbnails`)은 조립 순서·동작 **그대로 보존**.

## Acceptance Criteria

```bash
npm run typecheck   # 컴파일 에러 없음
npm test            # 신규 회귀 테스트 포함 전부 통과
npm run build       # 빌드 성공
```

신규 `tests/thumbnailPersona.test.ts`(또는 기존 thumbnail_maker 테스트에 케이스 추가):
- persona 있으면 `prepareThumbnailMaker` 결과 system에 `THUMBNAIL_PERSONA_DIRECTIVE` 포함 + `input.target_persona` 존재.
- persona 없으면 미포함 + 부재(바이트 불변). 기존 조건부 주입(winning refs·style 등) 동작 불변.

## 검증 절차

1. 위 AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 조건부 주입 불변식 준수(있을 때만·없으면 바이트 동일).
   - `THUMBNAIL_MAKER_SYSTEM` 본문 미확장(별도 상수 분리).
   - 새 의존성·마이그레이션 없음.
3. 결과에 따라 `phases/downstream-context-injection/index.json`의 step 1을 갱신:
   - 성공 → `"completed"` + `"summary"`.
   - 3회 시도 실패 → `"error"` + `"error_message"`.

## 금지사항

- **`THUMBNAIL_MAKER_SYSTEM` 본문을 확장하지 마라. 이유: persona 없는 런의 promptHash가 바뀌어 골든 픽스처가 깨진다.**
- **훅이(step0에서 완료)·셜록·구다리를 다시 건드리지 마라. 이유: 이 step은 썸네일 하나만.**
- **기존 조건부 주입(특히 `reference_winning_thumbnails`·`appendWinningThumbnailRefs` 체인)의 조립 순서·동작을 바꾸지 마라.**
- 기존 테스트를 깨뜨리지 마라.
