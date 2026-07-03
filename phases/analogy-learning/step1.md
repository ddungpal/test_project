# Step 1: 마이그레이션 + 추출 에이전트 + 재학습 sweep (draft까지)

> 백엔드 학습 파이프라인 완성: 트랜스크립트 → 비유 기법 프로필 **draft**. 활성화·주입은 이후 step. 유이·fixture **무영향**(아직 주입 안 함).

## 읽어야 할 파일

- `docs/specs/2026-07-03-analogy-learning-design.md` — §2 결정, §4.2 추출, §4.3 저장.
- `supabase/migrations/20260627120025_style_profiles_structure.sql` — **이 마이그를 템플릿으로** 그대로 미러('structure' → 'analogy_style').
- `src/agents/style_extractor/schema.ts` — 추출 스키마 방식(빈배열 required 금지) 미러.
- `src/agents/analogist/schema.ts`, `src/agents/roles.ts` — 유이 톤·roleId 참고.
- `src/app/actions/copyLearn.ts`(`requestCopyRelearn`), `src/performance/styleRelearn.ts`(`styleRelearnSweep`) — sweep/draft 삽입 패턴 미러.
- `src/lib/learning/transcribeReels.ts` — step0 산출(입력 소스).
- `src/lib/supabase/database.types.ts` — component_type 유니온(함께 확대).
- `.claude/rules/rules.md` — enum/CHECK 넓히면 database.types.ts 동반 확대 규칙.

## 작업

### 1) 마이그레이션 (신규 파일, `20260627120025_*` 미러)
- `style_profiles_component_type_check`를 drop/재생성해 `'analogy_style'` 추가(기존 4종 보존).
- **같은 커밋**에서 `src/lib/supabase/database.types.ts`의 `style_profiles` 관련 component_type 유니온에 `'analogy_style'` 추가.
- ⚠️ `profile_training_sources`의 profile_type CHECK는 **건드리지 않는다** — 이번 v1은 training_sources 행을 **삽입하지 않음**(YAGNI, §8). style_profiles draft만 만든다.

### 2) 추출 에이전트 — 신규 `src/agents/analogy_extractor/{schema.ts,step.ts}`
- 입력: `ReelTranscript[]`(트랜스크립트 뭉치). 출력: `AnalogyStylePatterns`(스펙 §4.2 골격).
  - `techniques/target_domains/do/banned: string[]`, `distortion_guard: string`, `confidence?`, `tentative_notes?`.
  - **빈 가능 string[] 필드는 절대 required에 넣지 않는다**(critic 사건). step에서 `?? []`.
- 시스템 프롬프트: "레퍼런스 영상들에서 **재사용 가능한 비유 기법**을 뽑아라. 특정 사례 복붙이 아니라 일반화된 규칙. 비유가 사실을 왜곡하지 않게 하는 지침(distortion_guard) 포함. 김짠부 톤." roleId 신설(`analogy_extractor`, roles.ts 등록). 개발=claude -p.

### 3) 재학습 sweep 액션 — `requestAnalogyRelearn()` (copyLearn.ts 또는 인접)
- `requestCopyRelearn` 미러: `requireOwner` 후 **동기 await**.
  1. `transcribeReels('learning/analogy-reels')` (step0).
  2. 트랜스크립트 없으면 `{ transcribed: 0 }` 반환(빈 폴더 방어).
  3. `analogy_extractor` step 1회 실행 → `AnalogyStylePatterns`.
  4. `style_profiles`에 `component_type='analogy_style'`, `status='draft'`, `patterns=<결과>`, `version=<기존 max+1>` 삽입.
  - draft까지만(활성화는 사람 게이트·이후 step).

### 4) 활성화 매핑 확장(백엔드만)
- `activateCopyStyle`가 쓰는 `CopyComponent`/`componentTypeFor`(`copyLearnMap.ts`)에 `'analogy'` → `'analogy_style'` 추가. (버튼은 step2.) 기존 매핑 무변경.

## 테스트

- `tests/analogyExtractorSchema.test.ts` — 빈 배열 필드가 required에 없는지(회귀). 스키마 유효성.
- `tests/requestAnalogyRelearn.test.ts` — supa/transcribeReels/extractor를 스텁 주입: 트랜스크립트 2개 → extractor 1회 → `style_profiles` insert가 `component_type='analogy_style'`·`status='draft'`로 불렸는지. 빈 폴더 → insert 미호출.
- `componentTypeFor('analogy') === 'analogy_style'` 단위 확인.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 전부 exit 0. stale `.next` 의심 시 `rm -rf .next` 후 재빌드.
2. 체크리스트: 마이그 CHECK에 analogy_style 있고 database.types.ts도 함께 넓혔나(드리프트 0)? 빈배열 required 없나? sweep가 draft만 만들고 활성화 안 하나? 유이 코드·fixture 무변경인가?
3. `git status`로 범위 외 파일(떠돌이 fixtures 등) 점검 후 제외.
