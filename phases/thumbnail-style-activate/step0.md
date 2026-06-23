# Step 0: commit-reviewed-from-file  ⭐ (핵심 — 사람 게이트)

**검수·완화한 산출물을 그대로 DB(draft)로 커밋하는 경로를 만든다.** 현재 `learn-ab-style.ts --commit`은 **LLM을 재호출**해 그 출력을 DB에 넣는다. 그래서 사람이 검수 산출물(`corpus/thumbnails/ab-style-proposed-*.json`)에서 손본 수정(예: "절대 깨지 마세요" → "딱 이만큼만 넘으세요" 완화)이 **DB에 반영되지 않는다**(fixture replay 시 완화 전 원본이 들어감). 사람 게이트(검수→수정→**그대로** 커밋) 원칙대로, **검수본 파일을 입력으로 받아 그 `patterns`를 그대로 draft로 INSERT**하는 `--from` 경로를 추가한다.

## 읽어야 할 파일 (먼저 정독)
- `scripts/learn-ab-style.ts` — **주 대상**. 현재 흐름: `loadAbResults` → `buildAbStyleInput` → `callLLM`(opus) → `?? []` 정규화 → 산출물 파일 기록(항상) → `--commit`이면 `style_profiles`(draft, version=max+1, component_type='thumbnail_copy') + `profile_training_sources`(provenance, 영상별 weight) INSERT. 끝에 `import.meta.url` 직접실행 가드 + 헬퍼 export 패턴.
- 검수 산출물 형식 = `corpus/thumbnails/ab-style-proposed-2026-06-23-16-18-50.json`: `{ source_ref, provider, promptHash, videos:[{topic,verdict,weight}], patterns:{copy,visual,banned}, evidence_summary }`. **이미 `patterns`가 DB INSERT에 쓰는 그 형태**다.
- `src/agents/style_extractor/schema.ts` — `STYLE_EXTRACTION_SCHEMA` / `StyleExtractionOutput`(patterns 형태 참조용. 빈 가능 배열은 required 아님).
- `tests/abStyleLearn.test.ts` — 기존 순수함수 테스트(여기에 `--from` 헬퍼 테스트를 추가).

## 작업
1. **`--from <path>` 플래그 추가**(`process.argv`). 동작 분기:
   - `--from`이 있으면 **LLM 호출(callLLM)·costGuard·fixtures 경로를 전부 건너뛴다.** `loadAbResults`/`buildAbStyleInput`도 LLM 입력 빌드용이므로 `--from` 경로에선 호출하지 않는다.
   - 대신 **순수 헬퍼** `export function loadReviewedArtifact(path: string): { patterns: ...; videos: {topic,verdict,weight}[]; source_ref: string }` 를 만들어 파일을 읽고 검증:
     - JSON 파싱 → `.patterns`가 객체이고 `patterns.copy`·`patterns.visual`·`patterns.banned` 키를 가졌는지 확인. 없으면 **throw**(`검수본에 patterns(copy/visual/banned) 없음`).
     - `patterns`는 기존 `?? []`(hook_patterns·emphasis_words·layout_archetypes·devices·banned) 정규화를 **동일하게** 적용해 빈 배열 가능 필드를 안전 수령.
     - `videos`는 있으면 그대로(provenance·weight용), 없으면 `[]`.
     - `source_ref`는 있으면 그대로, 없으면 `from:<basename> @<stamp>` 로 생성.
   - 순수함수로(파일 IO는 그 안에서, 단 DB·LLM 없음 → 테스트 import 안전).
2. **커밋 분기 재사용**: `--from` 일 때도 DB INSERT 코드 경로는 **기존과 동일**하게 탄다(version=max+1, status='draft', component_type='thumbnail_copy', provenance 영상별 weight). `--from`만으로는 **미리보기(무엇이 들어갈지 출력)**, `--from <path> --commit`이어야 실제 INSERT — 기존 `--commit` 게이트 규약 유지(안전).
   - provenance: 검수본 `videos`의 weight로(없으면 INSERT 건너뛰되 경고). 기존 코드가 `inputVideos`를 쓰는 부분을 `--from`에선 검수본 videos로 치환.
3. **메시지**: `--from` 경로 진입 시 `📄 검수본에서 커밋: <path> (LLM 미호출)` 출력. 성공 시 기존처럼 `v{version}(draft, id=...)` + `다음: activate-style.ts` 안내.
4. **기존 LLM 학습 경로(--from 없음)는 1바이트도 바꾸지 마라.** dry-run/record/replay·산출물 기록·--commit 모두 그대로. `--from`은 **추가 분기**일 뿐.

## 테스트 (tests/abStyleLearn.test.ts에 추가)
- `loadReviewedArtifact`: 정상 산출물(위 실제 파일 형태) → `patterns.copy/visual/banned` 보존 + 빈 배열 필드 정규화 확인.
- `patterns` 없는 JSON → throw.
- `videos` 없는 JSON → `videos:[]`, `source_ref` 자동생성(throw 안 함).
- (실제 파일을 픽스처로 읽어도 되고, 인라인 JSON 문자열을 tmp 없이 객체로 검증해도 됨 — **DB·LLM 미접근**.)

## 주의
- **빈 배열 가능 필드는 schema required 금지** 원칙 유지(`?? []`). 검수본에 해당 배열이 비어도 throw하지 말 것.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수. `import.meta.url` 직접실행 가드 유지(테스트 import 시 main 안 돎).
- **DB INSERT를 AC에서 돌리지 마라** — `--from --commit`의 실제 라이브 DB 반영은 step1 런북에서 사람이 트리거(.env 필요). 이 step은 코드+테스트만.
- 범위: `scripts/learn-ab-style.ts` + `tests/abStyleLearn.test.ts`. 다른 파일 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. `git diff`로 **기존 LLM 경로 불변**(--from은 추가 분기) 자가확인.
3. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"learn-ab-style --from <검수본> 경로 추가(LLM 미호출, 검수 patterns 그대로 draft INSERT). 기존 학습경로 불변. tc/test/build 그린"`. 실패(3회) → `"status":"error"` + `error_message`.
