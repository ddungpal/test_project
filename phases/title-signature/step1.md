# Step 1: title-signature-check

**제목 김짠부 시그니처 강화 — 소프트 경고(#3)**. 생성된 제목 후보가 김짠부 시그니처(signature_words/skeleton 흔적)를 **하나도 안 쓰면** 후보 카드에 ⚠ 소프트 경고를 띄운다. 썸네일의 `detectTopicMissing` 패턴을 그대로 미러 — **표시 전용·차단/자동거부 없음·오탐 회피(중립 우선)**.

## 배경

- step0이 프롬프트로 김짠부 스타일을 강제했지만, LLM이 여전히 빗나갈 수 있다 → 사람이 검수 때 "이 제목 김짠부답나?"를 빠르게 보게 하는 안전망.
- 기존 패턴: `thumbnail_maker/topicMissing.ts`의 `detectTopicMissing`(순수·중립 우선·크래시 0) + `thumbnail_maker/stage.ts`가 후보에 `topic_missing` annotation 부착 + `CandidateBody.tsx`가 ⚠ 칩 렌더. 이걸 제목용으로 미러.

## 읽어야 할 파일

- `src/agents/thumbnail_maker/topicMissing.ts` — **`detectTopicMissing`**(순수·중립 반환 규칙). 미러 대상. `tests/topicMissing.test.ts`.
- `src/agents/hook_maker/styleConformance.ts` — 제목 후보의 기존 휴리스틱 annotation(banned_hits·winning_score) 계산. 시그니처 체크를 여기 두거나 인접 모듈로.
- `src/agents/hook_maker/stage.ts` — 제목 후보 annotation 부착부(line 16~ `candidates.map`·`loadActiveTitleStyle` line 37). 여기에 `signature_missing` 부착(thumbnail stage line 43 `topic_missing: detectTopicMissing(...)` 미러).
- `src/lib/dashboard/proposalTypes.ts` — 후보 annotation 타입(`style_conformance`·`topic_missing` line 38·45). `signature_missing` 추가.
- `src/components/CandidateBody.tsx` — **`title_thumb` 분기**(line 30~58·제목 + ref/banned 칩). 여기에 ⚠ 시그니처 칩 추가. (thumbnail 분기 line 82·120의 topic_missing 칩 패턴 참고.)
- `CLAUDE.md` TRUS 디자인(3색·이모지 금지·⚠는 기존 칩 톤 따름).

## 작업

### 1) 순수 휴리스틱 `detectTitleSignatureMissing`

`hook_maker/styleConformance.ts`(또는 신규 `titleSignature.ts`)에:

```ts
export interface TitleSignatureMissing { missing: boolean }
// 제목이 김짠부 시그니처를 하나도 안 쓰면 missing:true. 시그니처 데이터 없으면 중립(경고 안 함).
export function detectTitleSignatureMissing(title: string, patterns: unknown): TitleSignatureMissing;
```

규칙(detectTopicMissing 중립 철학 미러):
- patterns에서 `signature_words`(string[])와 skeleton의 **고정 어구**(template의 슬롯 `{...}` 제외한 리터럴 토큰, 예 "이만큼 사두세요"·"총정리"·"꼭 알아야") 후보를 모은다. **시그니처 후보가 0개면 `{missing:false}`**(데이터 없음 → 경고 안 함·오탐 회피).
- `title`(정규화)에 시그니처 후보 중 **하나라도 부분일치**하면 `missing:false`.
- 전부 없을 때만 `missing:true`.
- title/patterns 어느 것이 깨져도 크래시 없이 `{missing:false}` 중립.

### 2) `stage.ts` annotation 부착

- 제목 후보 map에서 `signature_missing: detectTitleSignatureMissing(c.title, activeTitleStylePatterns)` 부착(active title style는 stage가 이미 `loadActiveTitleStyle`로 로드 — patterns 전달). **프로필 없으면 patterns 없음 → 중립(경고 안 뜸)**.
- 기존 annotation(style_conformance 등)·로컬 스켈레톤 경로·생성 로직은 **불변**(부착만 추가).

### 3) `proposalTypes.ts` 타입

- 후보 annotation에 `signature_missing?: { missing: boolean }` 추가(optional·기존 style_conformance/topic_missing 미러).

### 4) `CandidateBody.tsx` — 제목 ⚠ 칩 (Esther)

- `title_thumb` 분기(line 30~58)에서 `p.signature_missing?.missing === true`면 ⚠ **"김짠부 시그니처 약함"** 칩 렌더(기존 "⚠ 레퍼런스와 유사"·"⚠ A/B 패배 패턴" 칩과 동일 톤·TRUS 3색·이모지 금지·차단 없음). title 같은 hover 설명 선택.

## fixture/promptHash 주의

이 step은 **LLM 입력·프롬프트를 바꾸지 않는다**(생성 후 표시용 annotation + UI) → hook_maker promptHash **불변**·fixture 영향 0.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - `detectTitleSignatureMissing`이 순수·중립 우선(시그니처 데이터 없으면 missing:false·크래시 0)인가?
   - 제목 후보에 `signature_missing`이 부착되고, 프로필 없으면 경고 안 뜨는가? 생성 로직 불변인가?
   - CandidateBody title_thumb 분기에 ⚠ 칩이 (missing일 때만) 뜨고 TRUS 3색·차단 없음인가?
   - hook_maker promptHash 불변(LLM 입력 무변경)인가?
3. `phases/title-signature/index.json`의 step 1 갱신.

## 금지사항

- 시그니처 누락을 **자동 거부·후보 차단**으로 만들지 마라. 이유: 표시 전용 소프트 경고(detectTopicMissing 철학) — 사람 최종판단.
- 시그니처 데이터 없을 때 경고를 띄우지 마라(중립). 이유: 오탐(프로필 없는데 경고) 회피.
- 생성/프롬프트(`appendTitleStyle`·`HOOK_MAKER_SYSTEM`·callLLM 입력)를 건드리지 마라(step0에서 끝·이 step은 사후 표시). 이유: promptHash 보존.
- 기존 annotation(style_conformance·topic_missing)·로컬 스켈레톤 경로를 깨지 마라.
- 명세 외 신규 파일을 커밋에 섞지 마라(`git status`). 기존 테스트를 깨뜨리지 마라.
