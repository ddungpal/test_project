# Step 0: structure-extractor

## 읽어야 할 파일

먼저 아래를 읽고 검증된 "코퍼스→프로필 추출" 패턴을 그대로 따른다:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `scripts/extract-tone.ts` — **주 템플릿**: corpus 스크립트 읽기 → 결정적 prep → callLLM 1회 → 파일(dry-run)/DB(--commit, profile+provenance) 저장. 이 흐름을 구성용으로 복제
- `src/agents/tone_extractor/schema.ts` — `TONE_EXTRACTION_SYSTEM`·`ToneComponents`·스키마. 시스템 프롬프트 어조 참고
- `scripts/extract-style.ts` — 썸네일 스타일 추출(component_type='thumbnail_copy'로 style_profiles+provenance 저장). DB 저장·version=max+1·provenance 패턴 참고
- `src/agents/style_extractor/schema.ts` — `STYLE_EXTRACTION_SCHEMA`·`foldStrayPatternFields`/`normalizePatterns`. ★**stray-fold 패턴 필수 참고**(아래 금지 참조)
- `scripts/activate-style.ts` — 승격(draft→active, 같은 component_type active 1개·기존 retired, partial unique). 구조용으로 복제
- `src/lib/supabase/database.types.ts` — `corpus_editions`·`corpus_components`(type='script')·`style_profiles`(component_type)·`profile_training_sources`(profile_type) 행 타입
- `supabase/migrations/` 최근 파일 — 마이그레이션 네이밍/형식(`YYYYMMDDHHMMSS_name.sql`)

## 목표

김짠부 완성 스크립트 코퍼스에서 **구성/전개 패턴**을 1회 추출해 `style_profiles(component_type='structure')`에 draft로 저장하는 producer를 만든다. (consumer=구다리 주입은 step1.)

## 작업

### 1. 마이그레이션 (a안)
`supabase/migrations/<새 타임스탬프>_style_profiles_structure.sql`:
- `style_profiles.component_type` CHECK 제약에 `'structure'` 추가(기존 'title','thumbnail_copy','description' 보존 — DROP/ADD).
- `profile_training_sources.profile_type`에 CHECK 제약이 있으면 거기에도 `'structure'` 추가(없으면 생략).
- 멱등하게(이미 있으면 안전) 작성. **이 마이그레이션은 사람이 적용**한다(라이브 활성화 시) — AC 테스트는 실DB를 안 친다.

### 2. structure_extractor 에이전트
`src/agents/structure_extractor/schema.ts`:
- `STRUCTURE_EXTRACTION_SYSTEM`: tone_extractor 어조 미러. "너는 김짠부의 영상 구성을 분석하는 분석가다. 입력은 김짠부가 쓴 완성 스크립트 여러 편이다. 이 코퍼스만 근거로 **구성/전개 패턴**을 분해한다(추측·날조 금지·코퍼스에 실재하는 것만)." 추출 대상: 반복되는 섹션 유형, 전개 순서 원칙(쉬운 것 먼저 등), 훅(오프닝) 배치, 불안 완화 위치, 오개념 선제 제거 방식, 안 쓰는 구성(banned).
- `STRUCTURE_STYLE_SCHEMA` → `StructureStylePatterns`(필드 예시, 내부 구현 재량):
  ```ts
  interface StructureStylePatterns {
    section_archetypes: string[];   // 반복 섹션 유형(예: "공감형 오프닝","사례 먼저","오개념 박살","실행 체크리스트")
    flow_principles: string[];      // 전개 순서 원칙
    hook_placement: string;         // 오프닝 훅을 어디·어떻게
    anxiety_relief: string;         // 불안 완화 패턴
    misconception_handling: string; // 오개념 선제 제거 방식
    ordering_notes: string;         // 전형적 전개 순서 메모
    banned: string[];               // 김짠부가 안 쓰는 구성
    confidence?: "high" | "tentative";
    tentative_notes?: string[];
  }
  ```
- 출력은 `{ patterns: StructureStylePatterns }` 형태(style_extractor와 동형).

### 3. 추출 스크립트
`scripts/extract-structure-style.ts`(extract-tone.ts + extract-style.ts 복제):
- DB 읽기: `corpus_editions(include_in_training=true, status='done')` → `corpus_components(type='script', is_final=true)` → `{ topic, script }[]`.
- 결정적 prep: 입력 `{ creator: "김짠부", scripts: [...] }`, roleId `"structure_extractor"`.
- `callLLM` 1회(maxTokens 충분). fold/normalize 적용.
- dry-run: `corpus/structure/structure-proposed-<stamp>.json` 저장(DB 미반영).
- `--commit`: `style_profiles(component_type='structure', version=max+1, status='draft', patterns)` + `profile_training_sources(profile_type='structure', edition_id, weight=1)` INSERT.

### 4. 승격 스크립트
`scripts/activate-structure-style.ts`(activate-style.ts 복제, component_type='structure' 스코프): 최신(또는 인자 version) draft→active, 같은 component_type 기존 active→retired.

### 5. roles 등록
`structure_extractor` roleId를 `src/agents/roles.ts`(또는 동등 레지스트리)에 추가(defaultModel=opus, 다른 추출기와 동일).

### 6. 테스트
`tests/`에 structure_extractor 스키마 테스트: 유효 patterns 통과 + **claude-p가 top-level로 토한 stray 필드(banned/confidence 등)를 fold로 흡수**하는지(style_extractor fold 테스트 미러).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 추출(callLLM)·DB는 AC에서 호출하지 않는다 — 라이브 활성화는 사람이 머지 후. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 마이그레이션이 기존 component_type/profile_type을 보존하며 'structure'만 추가하는가.
   - structure_extractor 스키마가 top-level stray 필드를 fold로 흡수하는가(결정적 실패 방지).
   - extract/activate 스크립트가 component_type='structure' 스코프로만 쓰는가(thumbnail/title 충돌 없음).
   - 구다리(structurer)·prepare를 건드리지 않았는가(step1 몫).
3. `phases/structure-style-learning/index.json`의 step 0 갱신(completed+summary / error / blocked).
   - **주의(rules.md)**: index.json은 반드시 **유효한 JSON**으로 저장하라.

## 금지사항

- `src/agents/structurer/*`·`prepare.ts`를 건드리지 마라(주입은 step1).
- structure_extractor 스키마를 stray 필드에 취약하게 만들지 마라. 이유: claude-p가 `banned`/`confidence`/`tentative_notes`를 `patterns` 밖 최상위로 일관 출력해 결정적 실패를 낸 전례(style-extract-fold-stray phase). 스키마가 top-level도 허용 + fold로 patterns 안에 흡수해야 한다.
- 기존 extract-style.ts/activate-style.ts/extract-tone.ts를 변형하지 마라(구조용은 **새 파일**로 복제 — thumbnail/tone 동작 보존).
- 마이그레이션을 자동 적용하지 마라(사람 게이트). 실DB·LLM을 AC에서 호출하지 마라.
- 기존 테스트를 깨뜨리지 마라.
