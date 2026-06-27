# Step 0: structure-view-data

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `src/lib/dashboard/copyLearnView.ts` — /copy-learn 데이터 뷰. 현재 썸네일·제목 스타일 draft/active를 어떻게 싣는지(패턴 미러 대상). structure를 여기에 추가
- `src/agents/shared/styleProfile.ts` — `loadActiveStructureStyle`(structure active 로더, 직전 phase 산출물), `ActiveStructureStyle`
- `src/agents/structure_extractor/schema.ts` — `StructureStylePatterns`(section_archetypes·flow_principles·hook_placement·anxiety_relief·misconception_handling·banned·confidence·tentative_notes·reference_outlines) 형태
- `src/app/copy-learn/` 페이지 + 컴포넌트 — 뷰가 어떤 타입을 소비하는지(다음 step UI 연결점 파악)
- DB: `style_profiles`(component_type='structure', status active/draft, patterns jsonb, version)

## 목표

copyLearnView가 **active(및 최신 draft) structure 프로필**을 실어, /copy-learn UI(step1)가 구다리 구조 학습을 보여줄 수 있게 한다. 읽기 전용(편집/재학습 없음).

## 작업

- `copyLearnView.ts`에 structure 프로필 로드를 추가한다(썸네일/제목 스타일을 싣는 기존 패턴 미러):
  - active structure 프로필(`style_profiles` component_type='structure', status='active') 1개 + (있으면) 최신 draft 1개.
  - 반환 타입에 structure 항목 추가: `{ version, status, patterns }`(patterns는 jsonb 원본 — UI가 재귀 렌더). 없으면 null/생략(형태 보존).
- 기존 썸네일/제목 스타일 로드·반환을 깨지 마라(필드 추가만).
- best-effort: style_profiles 조회 실패/테이블 이슈에도 /copy-learn 전체가 안 깨지게(기존 가드 패턴 따름).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - structure active(+draft) 프로필을 component_type='structure' 스코프로만 조회하는가(썸네일/제목과 분리).
   - 기존 copyLearnView 반환(썸네일/제목/영상 등) 형태 보존.
   - 프로필 없을 때 null/생략으로 안전한가.
3. `phases/copy-learn-structure-view/index.json`의 step 0 갱신. index.json 유효 JSON.

## 금지사항

- UI 렌더는 건드리지 마라(step1). 이 step은 뷰 데이터만.
- structure_extractor·extract/activate 스크립트·structurer 주입을 건드리지 마라(읽기만).
- 기존 copyLearnView 소비처를 깨지 마라(필드 추가 only).
- 기존 테스트를 깨뜨리지 마라.
