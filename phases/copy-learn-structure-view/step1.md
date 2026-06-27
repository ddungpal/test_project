# Step 1: structure-view-ui

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·TRUS 3색(검정#121212/노랑#F8F082/흰색·그라데이션/그림자 금지)
- **step 0 산출물**: `src/lib/dashboard/copyLearnView.ts`의 structure 프로필 항목
- `src/app/copy-learn/` 페이지·컴포넌트 — 스타일 draft "상세 보기" **재귀 patterns 렌더러**(copy/banned/visual/confidence/tentative_notes 한글 라벨). 이 렌더러를 재사용한다(중복 구현 금지)
- `src/agents/structure_extractor/schema.ts` — `StructureStylePatterns` 필드(한글 라벨 매핑 참고): section_archetypes(반복 섹션 유형)·flow_principles(전개 원칙)·hook_placement(훅 배치)·anxiety_relief(불안 완화)·misconception_handling(오개념 처리)·ordering_notes(전형 순서)·banned(안 쓰는 구성)·confidence·tentative_notes·reference_outlines(실제 목차 예시)

## 목표

/copy-learn에 **'구성 학습'(구다리) 섹션**을 추가해 active structure 프로필을 사람이 읽기 쉽게 보여준다. 읽기 전용.

## 작업

- /copy-learn 페이지에 "구성 학습 (구다리)" 섹션 추가:
  - 헤더에 버전·상태(active/draft) 표시(썸네일/제목 스타일 카드 패턴 미러).
  - patterns를 기존 **재귀 렌더러로 펼쳐 보기**(가능하면 한글 라벨). 최소한 section_archetypes·flow_principles·hook_placement·anxiety_relief·misconception_handling·banned·confidence를 사람이 읽게 렌더.
  - `reference_outlines`(실제 목차 예시)는 재귀 JSON 덤프 대신 **가독 목록**으로: `[주제] → 1. 섹션 — note` 형식(structure 프로필 few-shot 렌더와 일관). 깨진 값 방어.
  - 프로필 없으면 "아직 학습된 구성 프로필이 없습니다. (extract-structure-style.ts → activate)" 안내.
- TRUS 3색·기존 copy-learn 톤 일관. 편집/재학습 버튼 없음(읽기 전용).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 기존 스타일 patterns 재귀 렌더러를 재사용했는가(중복 구현 안 함).
   - reference_outlines가 가독 목록으로 뜨는가(JSON 덤프 아님).
   - 프로필 없을 때 빈 상태 안내가 뜨는가.
   - TRUS 3색·읽기 전용.
3. `phases/copy-learn-structure-view/index.json`의 step 1 갱신. index.json 유효 JSON.

## 금지사항

- 구조 학습에 편집·재학습 트리거 UI를 넣지 마라(이 phase는 읽기 전용 확인용).
- patterns 렌더러를 새로 만들지 마라(기존 재귀 렌더러 재사용).
- 썸네일/제목 스타일 표시를 바꾸지 마라(섹션 추가만).
- 기존 테스트를 깨뜨리지 마라.
