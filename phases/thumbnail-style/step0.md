# Step 0: style-extractor

**Phase A(썸네일 스타일 일치)의 추출 토대.** 김짠부 썸네일 스타일을 코퍼스에서 1회 추출해 `style_profiles`로 만드는 **에이전트 + 스크립트**를 구축한다. 기존 **말투추출(tone_extractor) 패턴을 그대로 미러링**한다.

> ⚠️ 이 step은 **코드만** 만든다. 실제 LLM 추출(`--commit`)은 **돌리지 마라.** 이유: 시각 라벨(`corpus/thumbnails/golden-visual-labels.json`의 `visual.*`)이 아직 사람에 의해 채워지지 않았다(빈 상태). 추출 실행은 라벨 완료 후 사람이 수동으로 한다(tone:extract와 동일). AC는 `typecheck`+`test`만이다.

## 읽어야 할 파일 (먼저 정독)
- `src/agents/tone_extractor/schema.ts` — **미러 대상**(스키마+시스템 프롬프트 구조).
- `scripts/extract-tone.ts` — **미러 대상**(DB읽기→prep→callLLM 1회→dry-run/`--commit` 저장).
- `scripts/activate-tone.ts` — **미러 대상**(draft→active 승격).
- `src/agents/roles.ts` — 역할 등록부(여기에 style_extractor 추가).
- `src/lib/supabase/database.types.ts` — `style_profiles`(component_type "title"|"thumbnail_copy"|"description", version, patterns jsonb, status), `profile_training_sources`(profile_type, style_profile_id, edition_id, weight), `corpus_components`(type "thumbnail_copy" 등).
- `corpus/thumbnails/golden-visual-labels.json` — 추출 입력의 한 축(시각 라벨). 구조: `editions[].{edition_id, topic, thumbnail_copy_observed[], visual{face,layout,emphasis,color,number_treatment,devices,notes}}`. **값은 비어있을 수 있다 — 구조만 의존하고, 채워진 값이 있으면 전달**한다.
- `docs/tech.md` §13.2(컴포넌트별 스타일 학습), `CLAUDE.md`, `.claude/rules/rules.md`.

## 작업

### 1. `src/agents/roles.ts` — 역할 추가
`tone_extractor` 줄을 본떠 한 줄 추가:
```ts
style_extractor: { roleId: "style_extractor", name: "스타일추출", defaultModel: "opus", tools: [] }, // 기반·저빈도 → 품질 우선 opus. 파이프라인 단계 아님.
```

### 2. `src/agents/style_extractor/schema.ts` (신규)
`tone_extractor/schema.ts`를 본떠 작성:
- `interface ThumbnailStylePatterns` — `style_profiles.patterns`(jsonb)에 그대로 저장될 형태. 다음을 포함하라(이름은 재량, 의미는 유지):
  - **copy 패턴**: 후킹 방식(hook_patterns), 메인카피↔작은박스 구조(structure), 강조어(emphasis_words), 길이/문장수 경향(length_notes).
  - **visual 패턴**: 인물(face), 레이아웃 아키타입(layout_archetypes), 색 사용(color_usage), 숫자 표현(number_treatment), 시각장치(devices).
  - **banned**: 김짠부 썸네일에서 안 쓰는 표현/스타일.
  - 각 필드는 "관찰된 특징 + 코퍼스/라벨 인용"으로 채우도록 프롬프트가 유도.
- `STYLE_EXTRACTION_SCHEMA: JsonSchema` — `additionalProperties:false`. **빈 배열이 될 수 있는 필드는 절대 `required`에 넣지 마라.** 이유: forced tool_use도 required 100% 보장 못 함 → 모델이 빈배열 시 통째 누락 → api 무재시도서 전체 실패(과거 critic 사건). 빈 가능 필드는 step에서 `?? []` 기본값.
- `STYLE_EXTRACTION_SYSTEM: string` — "너는 김짠부 **썸네일** 스타일 분석가다. 입력은 김짠부 썸네일의 카피(텍스트)와 시각 라벨이다. 따라 만들 수 있는 '썸네일 스타일 사양'을 만든다. 추측 금지·코퍼스/라벨에 실재하는 것만·말투(스크립트)가 아니라 **썸네일 표현 방식**만·한국어." (tone 프롬프트의 원칙 미러)

### 3. `scripts/extract-style.ts` (신규 — `extract-tone.ts` 미러)
- DB 읽기: `corpus_editions`(status='done', include_in_training=true)별 `corpus_components`(type='thumbnail_copy') 카피 수집 + `corpus/thumbnails/golden-visual-labels.json`을 `edition_id`로 매칭해 `visual` 결합.
- 결정적 prep: `input = { creator:"김짠부", note, editions: [{ topic, copy: string[], visual: {...} }] }`.
- `callLLM<...>({ roleId:"style_extractor", system, input, schema, runId:"style-extract", maxTokens:4096 }, { config, costGuard })` — 비용가드/fixtures/스키마강제는 callLLM 담당(tone과 동일).
- dry-run(기본): `corpus/thumbnails/style-proposed-<stamp>.json`에 산출물 기록(미반영).
- `--commit`: `style_profiles` insert(component_type='thumbnail_copy', version=max+1 (해당 component_type 내), patterns, status='draft') + `profile_training_sources` insert(profile_type='thumbnail_copy', style_profile_id, edition_id, weight:1).
- top-level await 금지 → `main().catch(e=>{...; process.exit(1)})` 패턴(tone 동일).

### 4. `scripts/activate-style.ts` (신규 — `activate-tone.ts` 미러)
- `style_profiles`(component_type='thumbnail_copy')의 특정 draft를 `active`로 승격. **기존 active는 retired로 내림**(migration 18 B3: style_profiles active 단일성 partial unique → 위반 시 거부되므로 반드시 먼저 내려야 함).

### 5. `tests/styleExtractor.test.ts` (신규)
- 순수 검증만(LLM 호출 없음): ① `STYLE_EXTRACTION_SCHEMA` 형태 유효성(required에 빈배열 가능 필드 없음 포함) ② prep의 결정적 헬퍼(editions→{topic,copy,visual} 매핑)가 라벨 빈 편/채운 편 모두 안전 처리.

## 주의 (구체)
- `exactOptionalPropertyTypes`: optional 필드에 `undefined`를 **명시 대입하지 마라**(조건부 할당).
- `noUncheckedIndexedAccess`: 배열 인덱스 접근은 `?.`/가드.
- `src/` 파이프라인·다른 에이전트 파일은 **건드리지 마라**(이 step 범위 밖). roles.ts 한 줄 + style_extractor 신규 + 스크립트 2개 + 테스트 1개만.
- **추출/활성화 스크립트를 실행하지 마라**(DB 변경·라벨 미완). 코드만.

## Acceptance Criteria
```bash
npm run typecheck
npm test
```

## 검증 절차
1. 위 AC를 실행해 exit 0 확인.
2. `git status`로 변경 파일이 위 범위(roles.ts·style_extractor/·extract-style.ts·activate-style.ts·styleExtractor.test.ts)인지 확인. 파이프라인 파일 변경 없어야 함.
3. `phases/thumbnail-style/index.json` step 0 갱신: 성공 → `"status":"completed"`, `"summary":"style_extractor 역할+스키마+extract/activate-style+테스트. 추출 미실행(라벨 대기). typecheck/test 그린"`. 실패(3회) → `"status":"error"` + `error_message`.
