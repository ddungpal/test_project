# Step 1: structurer-style-injection

## 읽어야 할 파일

먼저 아래를 읽고 조건부 SYSTEM 주입 패턴(썸네일·제목)을 그대로 미러한다:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- **step 0 산출물**: `src/agents/structure_extractor/schema.ts`(`StructureStylePatterns`), 마이그레이션(component_type='structure')
- `src/agents/shared/styleProfile.ts` — `loadActiveThumbnailStyle`/`appendThumbnailStyle`·`loadActiveTitleStyle`/`appendTitleStyle`. **이 패턴을 structure용으로 복제**. 특히 "프로필 없거나 patterns 비면 system 바이트 불변"(promptHash 보존) 규칙
- `src/agents/structurer/prepare.ts` — 주입 지점. 현재 `StructurerInput`{topic,title,structure_insights,tone_easy_explain}, `return { system: STRUCTURER_SYSTEM, input, schema }`
- `src/agents/structurer/schema.ts` — `STRUCTURER_SYSTEM`
- `src/agents/thumbnail_maker/prepare.ts` — `loadActiveThumbnailStyle`+`appendThumbnailStyle` 주입 예(미러 대상)

## 목표

step0이 만든 active structure 프로필을 구다리 SYSTEM에 주입해, 구다리가 김짠부식 구성 패턴을 보고 목차를 짜게 한다. 활성 프로필이 없으면 **기존과 바이트 동일**(promptHash 불변·픽스처 보존).

## 작업

### 1. styleProfile.ts 확장
```ts
export interface ActiveStructureStyle { id: string; version: number; patterns: unknown }

// style_profiles(component_type='structure', status='active') 1개 로드. 없으면 null.
export async function loadActiveStructureStyle(supa: Supa): Promise<ActiveStructureStyle | null>;

// patterns 있으면 system 뒤에 "김짠부 구성 사양" 섹션 덧붙임. 없거나 patterns 비면 system 바이트 불변.
export function appendStructureStyle(system: string, profile: ActiveStructureStyle | null): string;
```
- `appendThumbnailStyle`의 `hasUsablePatterns` 가드·바이트불변 규칙을 그대로 따른다.

### 2. structurer/prepare.ts 주입
- `StructurerInput`에 `structure_style_profile?: { id: string; version: number; patterns: unknown }` 추가(옵셔널 — 없으면 키 생략, 형태 보존).
- prepare 본문: `const structureStyle = await loadActiveStructureStyle(supa); if (structureStyle) input.structure_style_profile = structureStyle;`
- system 주입: `const system = appendStructureStyle(STRUCTURER_SYSTEM, structureStyle); return { system, input, schema };`
  - ⚠️ 기존 `structure_insights`(입력)·`tone_easy_explain` 경로는 그대로 둔다. 구다리는 현재 insights를 SYSTEM에 안 붙이므로 `appendLearnedInsights`를 새로 추가하지 마라(기존 동작·해시 보존). structure 프로필만 SYSTEM에 붙인다.

### 3. SYSTEM 지시 보강(선택, 최소)
- `appendStructureStyle`가 붙이는 섹션에 "아래는 김짠부 과거 영상에서 학습한 구성 패턴 — 이 흐름을 따라 목차를 설계하라(베끼지 말고 이 주제에 맞게 재구성)" 취지의 한 줄을 포함.

### 4. 테스트
- `appendStructureStyle(system, null)` → 입력 system과 **바이트 동일**.
- patterns 있을 때 → 섹션이 붙고 결정적.
- (가능하면) prepare가 active 프로필을 입력·system에 반영, 없으면 불변(fake supa).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(오프라인엔 active structure 프로필이 없다 → `appendStructureStyle`가 no-op → 구다리 promptHash 불변 → 기존 parity/eval 픽스처 보존. 이 불변을 깨지 마라. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 활성 프로필 없을 때 구다리 system이 **바이트 불변**인가(픽스처 보존).
   - 기존 `structure_insights`/`tone_easy_explain` 입력 경로가 그대로인가.
   - `appendLearnedInsights`를 구다리에 새로 추가하지 않았는가(기존 동작 보존).
3. `phases/structure-style-learning/index.json`의 step 1 갱신(completed+summary / error / blocked). index.json 유효 JSON 유지.

## 금지사항

- 활성 structure 프로필이 없을 때 구다리 SYSTEM을 바꾸지 마라. 이유: promptHash 변경 시 기존 오프라인 픽스처·eval이 깨진다("없으면 불변" 원칙).
- 구다리에 `appendLearnedInsights`를 새로 끼워넣지 마라(이 phase 범위 아님 — 기존 동작 보존).
- step0 산출물(structure_extractor·마이그레이션·extract/activate 스크립트)을 바꾸지 마라.
- 기존 테스트를 깨뜨리지 마라.
