# Step 0: title-style-mandate

**제목 김짠부 시그니처 강화 — 프롬프트 레이어(#1·#2)**. 진단 결과: 활성 제목 프로필 `title v3`(signature_words·존댓말 banned·**김짠부식 skeletons**)이 주입되고 있으나, **JSON 덤프 + 약한 지시**라 LLM이 느슨한 참고로만 취급 → 일반 호기심 훅으로 희석 + 방금 강화한 외부 레퍼런스(고조회 외부 제목)와 경쟁. 이 step은 (#1) skeleton을 **강제 템플릿**으로 주입하고 (#2) HOOK_MAKER 프롬프트에 **김짠부 스타일 최우선·외부는 각도 영감만** 위계를 못박는다.

## 배경 (진단 — 이미 확인됨)

- `title v3` active(2026-06-29~). `prepareHookMaker`→`loadActiveTitleStyle`→`appendTitleStyle`로 주입됨(배선 정상).
- 오늘 녹화된 제목 출력(v3 활성 후)이 존댓말·"총정리"·"왕초보"·호기심은 일부 묻으나 **v3 skeleton 구조·시그니처는 거의 안 씀** → 일반 재테크 유튜버 톤.
- 원인: ① `appendTitleStyle`이 patterns를 JSON으로 덤프하고 "패턴에 맞춰 쓰라"고만 함(skeleton을 템플릿으로 쓰라는 강제 없음). ② `HOOK_MAKER_SYSTEM`이 "tone 따름 + 외부 프레이밍 참고"를 병렬로 둬 김짠부 스타일이 MUST가 아님. + 외부 레퍼런스가 일반 바이럴 훅으로 끌어당김.

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·디자인(존댓말 톤·낚시 금지).
- `src/agents/shared/styleProfile.ts` — **`appendTitleStyle`**(line 79~·JSON 덤프 + "반드시 따라 쓰기")·`hasUsablePatterns`. 주 대상.
- `src/agents/hook_maker/schema.ts` — **`HOOK_MAKER_SYSTEM`**(line 40~·"tone·과거 제목 톤"·"reference_titles_external 후킹 프레이밍 참고"). 주 대상.
- `src/agents/hook_maker/prepare.ts` — `appendTitleStyle(appendLearnedInsights(HOOK_MAKER_SYSTEM, learned), titleStyle)` 합성 순서.
- **참고(실제 v3 patterns 형태)**: `style_profiles(component_type='title')`의 patterns = `{ signature_words: string[], banned: string[], skeletons: { title: [{template, slots}] }, ... }`. `appendTitleStyle`는 이 형태를 가독 렌더해야 한다(키 이름은 방어적으로 — 없으면 스킵).

## 작업

### #1) `appendTitleStyle` — skeleton을 강제 템플릿으로

`appendTitleStyle`이 patterns를 **그냥 JSON 덤프하지 말고**, 김짠부 시그니처를 LLM이 실제로 쓰게 강하게 렌더한다:

- **skeletons.title**(있으면)을 **가독 템플릿 목록**으로 렌더("아래 김짠부 제목 골격 — 슬롯을 채워 실제로 써라"). 그리고 **강제 지시**: "후보 3개 중 **최소 1~2개는 이 골격을 실제로 채워** 쓴다(주제에 안 맞는 골격은 억지로 쓰지 말 것)."
- **signature_words**(있으면)를 별도로 노출하고 "김짠부 시그니처 워딩을 적극 활용" 지시.
- **banned**(있으면) 그대로 "피하라".
- 나머지 patterns는 JSON으로 덧붙여도 되나, 위 3개(skeleton·signature·banned)는 **자연어 지시 + 가독 렌더**로 강조(JSON에 묻히지 않게).
- patterns 형태는 unknown 기반 → 각 키는 **있을 때만**(타입 방어·없으면 그 블록 스킵). `hasUsablePatterns` 가드 유지(프로필 null/빈 patterns면 system 불변=해시 보존).
- **문구 정정**: 현재 "CTR로 성과가 검증된 제목들" → v3는 raw 채널 제목 기반(CTR 무관)이므로 "김짠부 채널 제목들에서 추출한 스타일"로 정확히(과장 제거).

### #2) `HOOK_MAKER_SYSTEM` — 위계 명문화 (김짠부 최우선·외부는 영감만)

기존 원칙 보존하고 위계를 박는다:

- **★ 최우선(MUST)**: 김짠부 말투(tone)와 **제목 스타일 사양(skeleton·signature_words)을 반드시 따른다.** 제목의 후킹·워딩은 김짠부 시그니처가 먼저다.
- **reference_titles_external(외부 고조회 제목)**: **각도·소재 영감으로만** 참고. 표현·훅 문구를 모방·차용하지 마라 — 김짠부 말투/골격으로 **재창작**한다. (조회수 높다고 표현 모방 금지 = 기존 문구 강화.)
- 기존: 직설 한 줄·낚시 금지·3개 서로 다른 앵글·evidence·한국어 등 **보존**. 단 "서로 다른 앵글"이 시그니처를 희생하지 않게(앵글은 다르되 전부 김짠부 톤).

## fixture/promptHash 주의

`appendTitleStyle`·`HOOK_MAKER_SYSTEM` 변경 → hook_maker promptHash 변경 → 기존 fixture는 다음 **라이브 런 자동 재기록**(claude-p $0). **AC 무관**(eval은 fixture 파일 읽기). 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - `appendTitleStyle`이 skeletons를 가독 템플릿 + "최소 1~2개 채워 써라" 강제로 렌더하는가? signature_words 강조? 각 키 타입 방어(없으면 스킵)?
   - `hasUsablePatterns` 가드 유지(프로필 없으면 system 바이트 불변=해시 보존)인가?
   - HOOK_MAKER_SYSTEM에 "김짠부 스타일 MUST·외부는 영감만" 위계가 명시됐는가? 기존 원칙 보존?
   - "CTR 검증" 과장 문구가 정정됐는가?
3. `phases/title-signature/index.json`의 step 0 갱신.

## 금지사항

- `hasUsablePatterns` 가드를 제거하지 마라(프로필 없을 때 system 불변 — 해시·픽스처 보존).
- patterns 키를 무방비로 접근하지 마라(unknown → 타입 가드·없으면 스킵). 이유: 크래시·이형 프로필.
- 외부 레퍼런스(reference_titles_external) 자체를 제거하지 마라 — '영감만'으로 강등(소재 다양성은 유지). 이유: 과교정 방지.
- 시그니처 체크(#3)·UI·stage 로직을 건드리지 마라(step1 범위).
- fixture를 손으로 재기록하지 마라. 명세 외 신규 파일을 커밋에 섞지 마라(`git status`). 기존 테스트를 깨뜨리지 마라.
