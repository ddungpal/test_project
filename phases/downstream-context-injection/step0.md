# Step 0: hook-persona

타겟 페르소나(`target_persona`)를 **훅이(제목 메이커·`hook_maker`)** 프롬프트에 조건부 주입한다. 방식 = **B (input 키 + system 지시문)**. 제목 후킹이 "이 타겟의 막막함"을 정확히 찌르도록. 짠펜(scribe)의 persona 주입 패턴을 그대로 미러한다.

## 읽어야 할 파일

먼저 아래를 읽고 설계 의도·주입 패턴·불변식을 파악하라:

- `docs/specs/2026-07-02-downstream-context-injection-design.md` — **이 phase 전체 설계(단일 출처).** 특히 "불변식"·"주입 맵".
- `src/agents/scribe/schema.ts` (L95~103 부근 `SCRIBE_PERSONA_DIRECTIVE`) + `src/agents/scribe/step.ts` (L13 부근) — **참조 패턴.** persona 있을 때만 system에 전용 상수 append, input에도 조건부 키. 이걸 그대로 미러한다.
- `src/agents/structurer/prepare.ts` (L26/L29/L51-52 부근) — 구다리의 topic payload에서 `target_persona` 조건부 input 주입(바이트 불변 패턴) 참조.
- `src/agents/hook_maker/prepare.ts` — **수정 대상.** `prepareHookMaker(supa, runId): { system, input, schema }`. 현재 selected topic.title을 읽고, system을 `appendTitleStyle(appendLearnedInsights(HOOK_MAKER_SYSTEM, ...), ...)`로 조립한다. `HookMakerInput` 타입, `HOOK_MAKER_SYSTEM` 상수 위치 확인.
- `src/agents/hook_maker/schema.ts` — **수정 대상.** `HookMakerInput` 타입 + `HOOK_MAKER_SYSTEM` 상수.
- `ARCHITECTURE.md`, `CLAUDE.md`(TRUS·보안 규칙).

## 작업

### 1) `src/agents/hook_maker/schema.ts`

- `HookMakerInput`에 optional `target_persona?: string` 추가.
- `HOOK_PERSONA_DIRECTIVE` 상수 신설(짠펜 `SCRIBE_PERSONA_DIRECTIVE` 미러). 내용: 짧은 지시문 — 제목이 이 타겟(누구+상황+막막함)의 **막막함을 정확히 후킹**하도록. **HOOK_MAKER_SYSTEM 본문은 절대 늘리지 마라. 이유: 없던 런의 promptHash를 바꿔 골든 픽스처를 깬다 — 지시문은 반드시 별도 상수로 분리해 persona 있을 때만 append.**

### 2) `src/agents/hook_maker/prepare.ts`

- topic payload에서 `target_persona`를 읽는다(구다리 `prepare.ts`와 동일하게 `getSelectedStagePayload(...,"topic")` 경로 — 이미 topic을 읽고 있으면 같은 payload에서 추출, 없으면 그 조회를 재사용). edited_payload 우선(사람 수정본).
- persona가 **있을 때만**: `input.target_persona = persona` + system 조립 체인에 `HOOK_PERSONA_DIRECTIVE`를 append(기존 `appendTitleStyle`/`appendLearnedInsights` 체인과 같은 "있을 때만 append" 방식).
- persona가 **없으면**: input 키·system append 둘 다 생략 → **바이트 동일**. 기존 `reference_titles`·`learned_insights`·`style_profile` 등 다른 조건부 주입은 **그대로 보존**(순서·조립 불변).

## Acceptance Criteria

```bash
npm run typecheck   # 컴파일 에러 없음
npm test            # 신규 회귀 테스트 포함 전부 통과
npm run build       # 빌드 성공
```

신규 `tests/hookPersona.test.ts`(또는 기존 hook_maker 테스트에 케이스 추가) — 짠펜 persona 테스트 스타일 미러:
- persona 있으면 `prepareHookMaker` 결과 system에 `HOOK_PERSONA_DIRECTIVE` 포함 + `input.target_persona` 존재.
- persona 없으면 system에 지시문 미포함 + `input.target_persona` 부재(바이트 불변). 다른 조건부 주입(learned/style) 동작 불변.

## 검증 절차

1. 위 AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 조건부 주입 불변식(있을 때만 추가·없으면 바이트 동일)을 지켰는가.
   - `HOOK_MAKER_SYSTEM` 본문을 늘리지 않고 지시문을 별도 상수로 분리했는가.
   - 새 의존성·마이그레이션 없는가.
3. 결과에 따라 `phases/downstream-context-injection/index.json`의 step 0을 갱신:
   - 성공 → `"completed"` + `"summary"`(수정 파일·지시문 상수명·테스트).
   - 3회 시도 실패 → `"error"` + `"error_message"`.

## 금지사항

- **`HOOK_MAKER_SYSTEM` 본문을 수정/확장하지 마라. 이유: persona 없는 런의 promptHash가 바뀌어 골든 픽스처가 깨진다.** 지시문은 별도 상수로 분리해 조건부 append.
- **썸네일(`thumbnail_maker`)·셜록·구다리를 건드리지 마라. 이유: 이 step은 훅이(hook_maker) 하나만.** 썸네일=step1, 셜록=step2.
- **기존 조건부 주입(reference_titles·learned_insights·style_profile·reference_titles_external)의 조립 순서·동작을 바꾸지 마라.**
- 기존 테스트를 깨뜨리지 마라.
