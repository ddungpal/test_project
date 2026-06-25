# Step 1: thumbnail-copy-learning

**썸네일 문구 품질을 올린다 — 김짠부 실제 썸네일 문구 학습을 제대로 반영 + 고조회 레퍼런스 배선 + 길이 제한.** 사용자 불만: "문구가 다 마음에 안 든다, 고조회 레퍼런스·짠부 채널 썸네일 문구 학습이 반영 안 됨, 박스 문구가 너무 길다."

## 배경 (DB 진단으로 밝혀진 근본원인 — 데이터 아니라 코드 문제)
라이브 DB 조회 결과:
- ✅ **활성 스타일 프로필 존재**: `style_profiles` `component_type='thumbnail_copy'` v1 **status=active** (copy/banned/visual 패턴 풍부 — emphasis_words "딱/무조건/미친/역대급", 2단 구성[메인 후킹 + 작은박스 구체정보], length_notes "메인은 짧은 한 호흡"). 배선(`loadActiveThumbnailStyle`→`appendThumbnailStyle`)도 살아있음.
- 🐛 **그런데 thumbnail_maker가 과거 레퍼런스를 `corpus_components` `type='title'`(제목 8개)로 읽음.** 정작 **`type='thumbnail_copy'`(김짠부 실제 썸네일 문구 24개)는 안 쓰임.** → "썸네일 문구 학습 반영 안 됨"의 핵심.
- 🐛 **고조회 외부 레퍼런스가 썸네일엔 미배선** (제목 단계엔 `gatherTitleReferences`로 붙였지만 썸네일엔 없음).
- 🐛 **박스/메인 글자수 제한이 schema에 없음**(minLength:1만) → 문구가 길어짐.

## 결정(사용자 확정)
- **박스 ≤ 6자, 메인문구 ≤ 14자** (schema `maxLength`로 강제 + 프롬프트 글자수 지침).
- 김짠부 썸네일 문구 학습 = `thumbnail_copy` corpus(24개) + active 스타일 프로필을 **둘 다** 반영.
- 고조회 레퍼런스 = 제목 단계의 `gatherTitleReferences`(고조회 관련 영상 제목) **재사용**(같은 `TITLE_REFERENCES=youtube` 게이트), 썸네일 후킹 프레이밍 참고용(베끼지 말 것).

## 읽어야 할 파일 (먼저 정독)
- `src/agents/thumbnail_maker/prepare.ts` — 전체(~59줄). 선택 topic·title 로드, **corpus 레퍼런스 로드(현재 `type='title'`, ~31-38)**, `loadApprovedInsights(["thumbnail"])`, `loadActiveThumbnailStyle`, `appendThumbnailStyle`/`appendLearnedInsights` 합성(~55-56). `ThumbnailMakerInput` 인터페이스.
- `src/agents/thumbnail_maker/schema.ts` — `THUMBNAIL_MAKER_SYSTEM`(짧고 강하게 지침·예시)와 출력 스키마(`thumbnail_main`/`thumbnail_boxes` minItems/maxItems 2, **maxLength 없음**, ~19-42).
- `src/agents/thumbnail_maker/stage.ts` — `toCandidates`(reference로 ref_similarity 계산). 레퍼런스 출처가 바뀌면 비교 대상도 thumbnail_copy로.
- `src/agents/shared/styleProfile.ts` — `loadActiveThumbnailStyle`(15~28)·`appendThumbnailStyle`(40~54). length_notes 등 patterns를 JSON으로 통째 주입. (강조 방식 보강 여지.)
- `src/agents/hook_maker/externalRefs.ts` — `pickTopExternalTitles`·`gatherTitleReferences`(게이트 `titleReferencesEnabled`). **재사용**(import). 새로 만들지 마라.
- `src/agents/hook_maker/prepare.ts` — 외부 레퍼런스 조건부 주입 패턴(참고).
- `tests/eval.test.ts`·`fixtures/parity/thumbnail_maker/` — 프롬프트 변경 시 promptHash 변동 대응(신규형 eval + 골든).
- `docs/principles.md` — 직설·핵심 말투(낚시 모방·교육조 금지).

## 작업
### 1) 레퍼런스 출처 수정 (핵심) — `prepare.ts`
- corpus 레퍼런스 쿼리를 **`type='title'` → `type='thumbnail_copy'`** 로 변경(`is_final=true`, limit ~12). 김짠부 실제 썸네일 문구를 레퍼런스로.
- `ThumbnailMakerInput`의 해당 필드명을 의미에 맞게(예: `reference_thumbnail_copies`) 정리하고, `toCandidates`의 ref_similarity 비교 대상도 이걸로(베껴쓰기 가드 유지).

### 2) 고조회 외부 레퍼런스 배선 — `prepare.ts`
- `gatherTitleReferences(topic)`(hook_maker externalRefs 재사용) 호출 → **비어있지 않을 때만** `ThumbnailMakerInput.reference_titles_external?`에 조건부 주입(promptHash 보존 패턴). 게이트 off/빈 결과면 미주입.

### 3) 길이 제한 — `schema.ts`
- 출력 스키마: `thumbnail_boxes` items `maxLength: 6`, `thumbnail_main` items `maxLength: 14` 추가(minItems/maxItems 2 유지).
- `THUMBNAIL_MAKER_SYSTEM`: "**박스는 6자 이내 단어·짧은 구(임팩트), 메인문구는 14자 이내 한 호흡**. 정보는 박스로 분리하고 메인은 후킹 한 방." 명시. 예시도 짧은 형태로 갱신.

### 4) 스타일·레퍼런스 반영 강화 — `schema.ts`(+필요시 `styleProfile.ts`)
- 시스템 프롬프트에: "입력 `reference_thumbnail_copies`(김짠부 과거 썸네일 문구)와 active 스타일 사양의 emphasis_words·hook_patterns·2단 구성·length_notes를 **반드시 따르고**, `reference_titles_external`(고조회 관련 영상 제목)의 후킹 각도는 참고하되 **낚시·교육조를 베끼지 말 것**(banned 항목 회피)." 지침 추가.
- (선택) `appendThumbnailStyle`에서 length_notes/emphasis_words를 JSON 외에 한 줄로도 강조해 모델이 놓치지 않게.

### 5) 픽스처/오프라인 $0 (필수)
- 위 변경으로 thumbnail_maker promptHash가 바뀐다 → 기존 `fixtures/parity/thumbnail_maker/*` 골든 무효.
- **기존 phase 패턴 그대로**: `tests/eval.test.ts`가 thumbnail_maker를 **신규형(candidates≥3·thumbnail_main/boxes 형태·길이)** 만 보게 하고, 레거시 골든은 건너뛰되 골든셋 개수는 강제. 새 형태 골든 1개를 **손작성**하거나 claude-p record로 1개 재녹화($0). **라이브 재녹화로 과금 금지.**

## 주의 (구체)
- **외부 레퍼런스(`reference_titles_external`)는 비면 미주입.** 이유: 게이트 off/오프라인에서 promptHash 보존·$0. (단, corpus 출처 변경[title→thumbnail_copy]은 무조건 적용이라 promptHash는 어차피 바뀜 → 위 5)로 흡수.)
- **두 번째 LLM 호출 추가 금지.** 이유: 레퍼런스 수집은 검색/데이터(LLM 0회), 생성은 기존 1콜.
- **낚시·교육조·banned 패턴 모방 금지(프롬프트 명시).** 이유: 김짠부 직설 말투·A/B 패배 패턴 회피.
- **thumbnail_maker만 수정.** hook_maker externalRefs는 import만(수정 금지), styleProfile.ts는 강조 보강 정도. topic/structure 침범 금지.
- `maxLength`는 한글 글자 기준(JS string length=코드유닛이라 한글 1자=1, 이모지 주의 — 일반 한글/숫자면 안전). 스키마 검증이 한글 길이를 의도대로 자르는지 확인.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트
- `pickTopExternalTitles` 재사용이라 기존 테스트로 커버. **신규**: thumbnail_maker eval이 길이(박스≤6·메인≤14)·형태를 보게 + (가능하면) prepare가 thumbnail_copy corpus를 읽는지 단위 검증(목 supa로 type 필터 확인).
- 레퍼런스 출처가 thumbnail_copy인지(쿼리 `.eq("type","thumbnail_copy")`) 단위/통합으로 박아라.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. 위 AC 실행(Joy 검수). 오프라인 $0(외부 게이트 off·골든 손작성/record).
2. 체크: 레퍼런스 출처=thumbnail_copy(24개), 외부 레퍼런스 조건부 배선, 박스≤6·메인≤14 강제, 스타일/banned 프롬프트 반영, 픽스처 오프라인 보존.
3. `phases/thumbnail-quality-fixes/index.json` step 1 갱신. summary에 **"실문구 품질은 사용자가 TITLE_REFERENCES=youtube로 새 런 1회 돌려 확인(active 스타일 v1·thumbnail_copy 24개 반영) 필요"** 포함.

## 금지사항
- 외부 레퍼런스 비었는데 주입 금지(조건부). 이유: $0·promptHash.
- 두 번째 LLM 호출 추가 금지. 이유: 비용.
- 낚시·banned 패턴 모방 금지. 이유: 말투·A/B 학습.
- thumbnail_maker 외 모듈 대규모 수정 금지(외부refs import·styleProfile 강조만). 이유: 범위.
- 라이브 재녹화 과금 금지(골든 손작성/claude-p record). 이유: $0.
- 기존 테스트를 깨뜨리지 마라.
