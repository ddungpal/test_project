# Step 0: outline-extract

## 읽어야 할 파일

먼저 1단계(structure-style-learning) 산출물을 읽고 그 위에 얹는다:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `src/agents/structure_extractor/schema.ts` — **1단계 산출물**: `StructureStylePatterns`, `StructureExtractionOutput { patterns, evidence_summary }`, `STRUCTURE_STYLE_SCHEMA`(additionalProperties:false·top-level 거울·required 규칙), `STRUCTURE_EXTRACTION_SYSTEM`, `foldStructureStrayFields`/`normalizeStructurePatterns`
- `scripts/extract-structure-style.ts` — 코퍼스(type='script') 읽기 → callLLM → normalize → dry-run/--commit. reference_outlines 정규화 추가 지점
- `src/agents/thumbnail_maker/prepare.ts` 및 winning refs 관련 — `reference_winning_thumbnails` few-shot 패턴(참고: 구체 예시를 few-shot으로 주입하는 선례)
- `src/agents/structurer/schema.ts` — 구다리 출력 outline 형태(section/goal/why) 참고(예시 목차 표현 일관)

## 목표

`structure_extractor`가 집계 패턴(1단계)에 더해 **코퍼스 각 편의 실제 목차**(reference_outlines)도 추출해 같은 structure 프로필 `patterns`에 담는다. (렌더링=step1.) 마이그레이션 없음 — 기존 patterns jsonb 재사용.

## 작업

### 1. 출력 스키마 확장
`StructureStylePatterns`에 옵셔널 필드 추가:
```ts
reference_outlines?: {
  topic: string;                                   // 그 편 주제
  outline: { section: string; note?: string }[];  // 실제 목차(섹션 순서대로, 각 한 줄)
}[];
```
- `STRUCTURE_STYLE_SCHEMA`의 `patterns`에 `reference_outlines` 등재(배열·옵셔널, required 제외). `additionalProperties:false`라 명시 등재 필요.
- top-level 거울/`foldStructureStrayFields`: claude-p가 reference_outlines를 patterns 밖으로 낼 가능성에 대비해 1단계와 동일한 fold 정책으로 patterns 안에 흡수(다운스트림 nested 불변).

### 2. SYSTEM 프롬프트 보강
`STRUCTURE_EXTRACTION_SYSTEM`에 지시 추가:
- "추가로, 입력 스크립트 중 **대표 편들의 실제 목차**를 `reference_outlines`로 충실히 출력하라 — 그 편이 실제로 전개된 섹션 순서대로, 각 섹션은 짧은 한 줄. **요약은 충실히, 날조·창작 금지**(스크립트에 없는 섹션 추가 금지). 최대 N편(예: 6)만, 서로 구성이 다른 편 위주로."
- 집계 패턴(section_archetypes 등)과 구체 목차(reference_outlines)는 **다른 것**임을 명시(혼동 금지).

### 3. extract 스크립트 정규화
`scripts/extract-structure-style.ts`:
- normalize 단계에서 `reference_outlines`를 보존하되 **cap N(예: 6)** 적용, 빈 outline·빈 topic 항목 폐기, section 문자열만 추려 방어(claude-p 깨진 출력 안전).
- dry-run/--commit 저장 로직은 그대로(patterns에 reference_outlines가 포함돼 함께 저장됨).

### 4. 테스트
`tests/structureExtractor.test.ts`(또는 인접)에 추가:
- 스키마가 reference_outlines 포함 출력을 통과.
- 정규화가 cap N 적용·빈 항목 폐기·top-level로 온 reference_outlines를 fold로 흡수.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 추출(callLLM)·DB는 AC에서 호출 안 함 — 라이브는 사람이 머지 후 재추출. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - reference_outlines가 **옵셔널**이고 required/기존 patterns 형태를 깨지 않는가.
   - top-level fold·cap·빈항목 폐기가 동작하는가.
   - 렌더링(appendStructureStyle)은 건드리지 않았는가(step1 몫).
3. `phases/structure-outline-fewshot/index.json`의 step 0 갱신(completed+summary / error / blocked). index.json 유효 JSON 유지.

## 금지사항

- `src/agents/shared/styleProfile.ts`(appendStructureStyle)를 건드리지 마라(렌더링은 step1).
- 새 마이그레이션·새 테이블·corpus_components 신규 타입을 만들지 마라. 이유: reference_outlines는 기존 style_profiles(structure) patterns jsonb에 임베드한다(2단계 설계).
- reference_outlines를 required로 만들지 마라(옵셔널 — 없어도 1단계 동작 보존).
- 실제 스크립트에 없는 섹션을 만들게 두지 마라(SYSTEM에 날조 금지 명시 — few-shot은 충실한 실제 목차여야 함).
- 기존 테스트를 깨뜨리지 마라.
