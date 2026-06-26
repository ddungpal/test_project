# Step 1: topic-curiosity-relearn

## 읽어야 할 파일

먼저 아래를 읽고 재학습(스타일 추출) 프롬프트 구조를 이해하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- **step 0 산출물**: `src/agents/thumbnail_maker/schema.ts`(추가한 주제 키워드·호기심 갭 규칙) — 재학습도 같은 방향이어야 한다
- `src/agents/style_extractor/schema.ts` — `STYLE_EXTRACTION_SYSTEM`(썸네일 스타일 추출), `ThumbnailStylePatterns` 구조(copy.hook_patterns / copy.structure.main_copy_notes·small_box_notes / emphasis_words / banned / skeletons / confidence)
- AB/교정 재학습 프롬프트: `AB_STYLE_SYSTEM`(및 제목용 `TITLE_STYLE_SYSTEM`이 같은 파일/모듈에 있으면 참고만 — 이 step은 **썸네일만**), 교정 학습 합류 경로(`thumbnail-correction-learning` phase에서 만든 buildAbStyleInput single 미러)
- `src/agents/shared/styleProfile.ts` — patterns 주입 경로

## 배경

step 0은 생성 SYSTEM에 규칙을 박았다. 하지만 active 스타일 patterns가 다음 런 SYSTEM에 덧붙으므로(`appendThumbnailStyle`), **재학습이 이 방향을 모르면 patterns가 SYSTEM 의도를 희석/덮을 수 있다.** 따라서 재학습 프롬프트(스타일 추출·AB·교정)도 "주제 키워드 포함 + 호기심 갭"을 학습 기준으로 인식하게 만들어 patterns에 지속적으로 반영되게 한다.

## 작업

썸네일 재학습 SYSTEM 프롬프트에 step 0과 **같은 방향**의 학습 지시를 추가한다(한국어, 기존 톤 유지):

- `STYLE_EXTRACTION_SYSTEM`(그리고 썸네일 AB/교정 재학습 SYSTEM): 추출 시 다음을 패턴으로 포착·강화하라는 지시 추가 —
  1. **주제 키워드 노출 경향**: 김짠부 우승 썸네일이 영상 주제 핵심 키워드를 메인에 그대로 노출하는 패턴을 `copy.structure.main_copy_notes`(또는 hook_patterns)에 반영.
  2. **호기심 갭 경향**: 내용을 힌트로 흘려 클릭을 유도하고 영상에서 답하는 구조를 `copy.structure.small_box_notes`/`hook_patterns`에 반영.

구현 규칙(반드시):
- patterns **스키마에 required 키를 추가하지 마라**. 기존 옵셔널 구조를 그대로 쓰고, LLM이 기존 키(`main_copy_notes`/`small_box_notes`/`hook_patterns`)에 이 방향을 담도록 SYSTEM 지시만 강화한다.
- 제목(title) 재학습 경로는 건드리지 마라(이 phase는 썸네일 한정). 같은 파일에 있어도 썸네일 SYSTEM만 수정.
- 교정 학습(correction) 합류 경로가 별도 SYSTEM을 쓰면 거기도 같은 한 줄을 넣어 일관성 유지. 백엔드 로직(합성 A/B·테이블)은 건드리지 마라.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(SYSTEM 변경으로 style_extractor promptHash가 바뀌면 해당 픽스처가 record로 재생성된다. eval은 출력 형태만 보므로 통과해야 한다.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - patterns 스키마에 **required 키를 추가하지 않았는가**(기존 픽스처·다운스트림 보존).
   - 썸네일 재학습만 바꿨고 제목 경로는 불변인가.
   - step 0 SYSTEM과 방향이 일치하는가(주제 키워드 + 호기심 갭).
3. `phases/thumbnail-topic-curiosity/index.json`의 step 1 갱신.

## 금지사항

- `ThumbnailStylePatterns` 등 patterns 스키마에 required 필드를 추가하지 마라. 이유: 기존 style_profiles 픽스처·active 프로필을 깨고 결정적 실패를 부른다(과거 `style-extract-fold-stray` 사건과 같은 클래스).
- 제목(title) 재학습/스타일 경로를 수정하지 마라(이 phase는 썸네일 한정).
- 교정 학습의 합성 A/B·테이블·트리거 로직을 바꾸지 마라(SYSTEM 문구만).
- 기존 테스트를 깨뜨리지 마라.
