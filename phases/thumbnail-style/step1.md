# Step 1: hook-style-inject

**훅이(hook_maker)가 김짠부 썸네일 스타일을 입게 한다.** 활성(active) `style_profiles`(thumbnail_copy)를 훅이 prepare가 **조건부 주입**한다. 제목 레퍼런스만 보던 훅이가 이제 썸네일 스타일까지 본다.

> ⚠️ **픽스처 보존이 이 step의 핵심 제약**이다. active 스타일 프로필이 **없을 때는 입력·시스템 프롬프트가 기존과 바이트 단위로 동일**해야 한다 → 기존 `fixtures/parity/hook_maker/*` 가 깨지면 안 된다. 이미 검증된 동일 패턴이 `learned_insights` 주입에 있다 — 그걸 그대로 본떠라.

## 읽어야 할 파일 (먼저 정독)
- `src/agents/hook_maker/prepare.ts` — 수정 대상. **이미 있는 `learned_insights` 조건부 주입**(loadApprovedInsights → 있을 때만 input/system 변경)이 정확히 본뜰 패턴이다.
- `src/agents/shared/approvedInsights.ts` — `appendLearnedInsights`(순수: system에 섹션 조건부 추가) 패턴 참고.
- `src/agents/hook_maker/schema.ts` — `HOOK_MAKER_SYSTEM`/스키마(베이스 문자열은 프로필 없을 때 변경 금지).
- `src/pipeline/context.ts` — `getToneProfile`(active>draft 로딩) 패턴 — style 로더를 여기 또는 shared에 같은 식으로.
- `src/lib/supabase/database.types.ts` — `style_profiles`(status='active', component_type='thumbnail_copy', version, patterns).
- `tests/` 의 hook_maker 관련 테스트 + `tests/parity.test.ts`.

## 작업

### 1. active 스타일 프로필 로더 (신규 헬퍼)
`src/agents/shared/styleProfile.ts`(신규) 또는 `context.ts`에 추가:
```ts
// 활성 썸네일 스타일 프로필 1개(status='active', 최신 version). 없으면 null.
export async function loadActiveThumbnailStyle(supa: Supa):
  Promise<{ id: string; version: number; patterns: unknown } | null>
```
- `style_profiles`에서 component_type='thumbnail_copy' AND status='active' 최신 version 1행. 없으면 null.

### 2. `src/agents/hook_maker/prepare.ts` — 조건부 주입
`learned_insights` 패턴을 그대로 따라:
- `HookMakerInput`에 `style_profile?: { id: string; version: number; patterns: unknown }` 추가(옵셔널).
- `loadActiveThumbnailStyle(supa)` 호출.
- **있을 때만**: `input.style_profile = {...}` 설정 + system에 "썸네일 스타일 규칙" 섹션 append(짧은 순수 함수, `appendLearnedInsights`처럼 — 프로필 patterns를 훅이가 따라 쓰도록 지시).
- **없을 때**: input·system을 **전혀 건드리지 않는다**(promptHash 동일 → 기존 픽스처 보존). `exactOptionalPropertyTypes` 때문에 `style_profile: undefined`를 명시 대입하지 마라(조건부 할당).

### 3. (선택) schema.ts
`HOOK_MAKER_SYSTEM` 베이스 문자열은 **바꾸지 마라**(해시 보존). 스타일 지시는 오로지 step 2의 append 섹션으로만 들어간다.

## 주의 (구체)
- 빈 프로필/빈 patterns에도 안전(가드).
- governance: 코퍼스 파생 스타일만. 댓글 등 무관.
- 이 step은 **훅이 prepare + 신규 스타일 로더 + (필요시) 테스트**만 건드린다. 다른 에이전트·파이프라인 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run parity:replay
```
**`parity:replay`가 반드시 그린**이어야 한다(= active 프로필 없을 때 훅이 입력/프롬프트 불변 → 기존 hook_maker 픽스처 보존 입증).

## 검증 절차
1. 위 AC 3개 실행, 전부 exit 0. 특히 `parity:replay` 그린 확인(픽스처 보존).
2. `git status`로 변경 범위 확인(hook_maker/prepare.ts + 신규 styleProfile 로더 + 테스트). 베이스 SYSTEM 문자열 미변경 확인.
3. `phases/thumbnail-style/index.json` step 1 갱신: 성공 → `"status":"completed"`, `"summary":"훅이 prepare 조건부 style_profile 주입(active 없으면 해시 불변·parity 보존). loadActiveThumbnailStyle 추가"`. 실패(3회) → `"status":"error"` + `error_message`.
