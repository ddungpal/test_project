# Step 0: export-doc-builder

## 배경 (자기완결 — 이 phase의 목적)

대본이 완성된 런의 **제목·썸네일 카피·더보기란/고정댓글·스크립트**를 하나의 문서로 묶어, 김짠부가 쓰는 **구글 문서 구조와 동일하게** 내보내고 싶다(구글 문서로 가져와 확인). 방식은 **`.md` 파일 다운로드**(구글독스가 마크다운 변환 — 학습 코퍼스가 "구글독스→.md export"로 만들어지므로 그 역방향, 같은 포맷).

이 step은 **마크다운 문자열을 조립하는 순수 함수만** 만든다(다운로드 route·버튼은 step 1).

### 맞춰야 할 정확한 구조 (김짠부 실제 스크립트 문서 = 학습 코퍼스 포맷)

`corpus/README.md`의 라벨 매핑 + 실제 원본 파일(`corpus/raw/`) 기준. **섹션 순서·라벨·구분선을 그대로** 재현한다:

```
**썸네일**

메인 : <상단 메인문구>
메인 : <하단 메인문구>
작은 박스1 : <박스문구1>
작은 박스2 : <박스문구2>

—---------------------------------------------------------------------------------------------------

**제목**

<대표 제목>
(후보 있으면 아래에 1. 2. 로)

—---------------------------------------------------------------------------------------------------

**더보기란/고정댓글**

<빈 칸 — 김짠부가 직접 작성 (플레이스홀더 한 줄)>

—---------------------------------------------------------------------------------------------------

**🎬 스크립트**

<대본 본문>
```

- 라벨은 굵게(`**라벨**`), 섹션 사이는 **긴 em-dash 구분선**(`—` + 하이픈 다수 — 원본과 동일 길이·문자). 상수로 둔다.
- 더보기란/고정댓글은 **빈 칸**(사용자 결정: 자동 생성 안 함). 라벨 아래 안내 플레이스홀더 한 줄(예: `(여기에 더보기란·고정댓글을 직접 작성하세요)`).

## 읽어야 할 파일

- `corpus/README.md` — 라벨→컴포넌트 매핑·export 컨벤션(정본).
- `corpus/raw/[김짠부] 스크립트-*.md` 중 1개 — **실제 라벨·구분선·`메인 :`/`작은 박스N :` 형식** 확인(민감 원본이라 구조만 참고, 내용 복붙 금지).
- `src/agents/thumbnail_maker/schema.ts` — `thumbnail_main`(2개: 상단/하단), `thumbnail_boxes`(2개) 필드 의미.
- `src/pipeline/segmentBlock.ts` — 스크립트 블록 payload 형태: `table {columns,rows,caption?}` · `case {intro?,branches:{condition,outcome}[]}` · `visual {cue,cueType?,note?}` · `prose`(payload null).
- `src/agents/scribe/schema.ts` — `ScriptSegmentOut`(text·kind·payload).
- `tests/` 하위 순수함수 테스트 1개 — 위치·스타일.

## 작업

**신규 파일** `src/lib/export/scriptDoc.ts`:

```ts
export interface ScriptDocInput {
  title: string;                 // 대표 제목
  titleAlternates?: string[];    // 후보(있으면)
  thumbnailMain: string[];       // 메인문구(보통 2개: 상단/하단)
  thumbnailBoxes: string[];      // 작은 박스(보통 2개)
  segments: { kind?: string; text: string; payload?: unknown }[]; // 스크립트 세그먼트(ord 순)
}

// 김짠부 구글 문서 구조 그대로의 마크다운 문서를 만든다(순수·결정적).
export function buildScriptDocMarkdown(input: ScriptDocInput): string;
```

**렌더 규칙:**
- **썸네일**: `thumbnailMain` 각 문구를 `메인 : <문구>` 줄로, `thumbnailBoxes`를 `작은 박스1 : …`/`작은 박스2 : …`로. 개수가 다르면 있는 만큼만(방어).
- **제목**: 대표 제목 한 줄. `titleAlternates` 있으면 그 아래 `1. …` `2. …`.
- **더보기란/고정댓글**: 라벨 + 플레이스홀더 한 줄(빈 칸).
- **🎬 스크립트**: 세그먼트를 ord 순으로 렌더 —
  - `prose`(또는 kind 미지정): `text`를 문단으로(문단 사이 빈 줄).
  - `table`: 마크다운 표(`| col | … |`), caption 있으면 위/아래 한 줄.
  - `case`: intro(있으면) + 각 branch를 `- 만약 <condition> → <outcome>` 식으로.
  - `visual`: `[화면: <cue>]`(cueType 있으면 배지처럼 `[자막: …]`/`[화면캡처: …]` 등). text와 payload.cue 중 있는 걸 쓴다.
  - 알 수 없는 kind는 조용히 prose로 폴백(text만) — throw 금지(segmentBlock 정신).

**핵심 규칙:**
- **순수 함수**(DB·fetch·`Date.now()` 없음). 결정적 → 단위 테스트.
- 라벨·구분선·`메인 :`/`작은 박스N :` 표기를 **코퍼스 포맷과 일치**시킨다(구글독스 가져오기가 자연스럽게). 구분선은 상수.
- 입력 배열이 비거나 짧아도 throw하지 않는다(방어·빈 섹션은 라벨만).

**신규 테스트** `tests/scriptDoc.test.ts`:
- 4개 라벨(`**썸네일**`·`**제목**`·`**더보기란/고정댓글**`·`**🎬 스크립트**`)과 구분선이 순서대로 존재.
- 더보기란은 빈 칸(플레이스홀더).
- 썸네일 메인/박스, 제목+후보 렌더.
- 블록 렌더(table 표·case 분기·visual 큐) + 알 수 없는 kind prose 폴백.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.

## 검증 절차

1. AC 실행.
2. 순수 함수인지(supabase/fetch import 0), 코퍼스 포맷과 라벨·구분선·순서 일치 확인.
3. UI·route는 이 step에서 **미변경**(step 1). git diff가 신규 `scriptDoc.ts`+테스트만.
4. `git status`로 범위 외 untracked(fixtures 등) 제외.
5. `phases/script-doc-export/index.json` step 0 갱신(완료 → completed + summary / 실패 → error).

## 금지사항

- 기존 파일 수정 금지(신규 `scriptDoc.ts`+테스트만). 이유: 조립과 배선 분리.
- 더보기란/고정댓글을 자동 생성하지 마라(사용자 결정: 빈 칸). 이유: 범위 밖.
- 실제 코퍼스 원본(`corpus/raw/`)의 민감 내용을 테스트/코드에 복사하지 마라(구조만 참고).
- 마이그·의존성 추가 금지. 기존 테스트를 깨뜨리지 마라.
