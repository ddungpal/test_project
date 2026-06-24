# Step 0: thumbnail-copy-contract

**훅이 출력 데이터 계약 변경(백엔드).** 썸네일 카피를 단일 문자열 → **"메인문구 2개 + 작은 박스 2개"** 구조로 바꾸고(#2), 레퍼런스를 베끼지 않게 하는 프롬프트 + 유사도 가드(#3)를 넣는다. UI 렌더는 step1, 자동 새로고침은 step2.

## 배경 / 목표 구조 (참고 이미지 기준)
김짠부 실제 썸네일은 **메인문구 2개(슬래시로 구분되는 두 줄) + 작은 박스 2개**로 구성된다. 예시(파킹통장):
- 메인문구: `["매달 돈 주는 통장", "300만 원 이상이면 무조건 여기"]`
- 작은 박스: `["파킹통장 추천", "연 4% 이자 실화?"]`
- (이미지·인물 지시는 기존 `thumbnail_layout` 텍스트에 계속 담는다 — 예 "은행 입금 이미지")

## 읽어야 할 파일 (먼저 정독)
- `src/agents/hook_maker/schema.ts` — `HookCandidateOut`·`HOOK_MAKER_SCHEMA`·`HOOK_MAKER_SYSTEM`. **현재 `thumbnail_copy: string` 필드를 교체한다.**
- `src/agents/hook_maker/stage.ts` — `hookStageSpec.toCandidates`가 LLM 출력 → payload로 매핑(현재 thumbnail_copy 그대로 전달).
- `src/agents/hook_maker/prepare.ts` — `input.reference_titles`(과거 제목 12개 `{id,text}[]`)를 만든다. #3 유사도 가드가 이걸 쓴다.
- `src/pipeline/scriptGuards.ts` — **재사용**: `buildCorpusShingles(texts)`·`containment(text, shingles)`(문자 5-gram 포함도 0~1). 짠펜 표절가드와 동일 기법. #3에 그대로 쓴다(새 알고리즘 만들지 마라).
- `src/pipeline/stageContract.ts` — `ProposalStageSpec`·`runProposalStage`. `toCandidates(out)`가 어디서 호출되는지 본다(여기에 prepared input을 한 인자 더 넘긴다).
- `src/lib/dashboard/proposalTypes.ts` — `TitlePayload`.
- `tests/eval.test.ts` (52~62줄, 훅이 블록) — 픽스처 출력 품질 검증. `thumbnail_copy` 검증을 새 구조로 바꾼다.
- `fixtures/parity/hook_maker/*.json` — 기존 9개(레거시 `thumbnail_copy` 문자열). **재녹화하지 않는다**(아래 픽스처 전략 참고).

## 작업
### 1) 스키마 (`schema.ts`)
`HookCandidateOut`에서 `thumbnail_copy: string`을 제거하고 추가:
```ts
thumbnail_main: string[];   // 메인문구 정확히 2개
thumbnail_boxes: string[];  // 작은 박스 정확히 2개
```
`HOOK_MAKER_SCHEMA`의 candidate item:
- `thumbnail_main`·`thumbnail_boxes`: `{ type: "array", items: { type:"string", minLength:1 }, minItems: 2, maxItems: 2 }`.
- `required`에서 `thumbnail_copy` 빼고 `thumbnail_main`·`thumbnail_boxes` 추가. `thumbnail_layout`·`title`·`reason`·`evidence_ids`는 유지.

`HOOK_MAKER_SYSTEM`에 추가(기존 TRUS 색·톤 제약은 유지):
- **구조 지시**: "썸네일 카피는 ① 메인문구 2개(`thumbnail_main`: 큰 글자로 박힐 핵심 두 마디) ② 작은 박스 2개(`thumbnail_boxes`: 보조 후킹·구체수치·질문) 로 나눠 쓴다. 각각 정확히 2개." + 위 파킹통장 예시를 그대로 한 개 제시.
- **#3 anti-dup**: "레퍼런스(reference_titles·스타일 프로파일)는 **톤·구조 참고용**이다. 문구를 **그대로 베끼지 마라** — 표현·단어를 재구성해 김짠부답되 매번 새롭게. 레퍼런스 제목과 거의 동일한 제목/카피는 금지."

### 2) #3 유사도 가드 (순수, scriptGuards 재사용)
새 파일 `src/agents/hook_maker/referenceGuard.ts`:
```ts
import { buildCorpusShingles, containment } from "../../pipeline/scriptGuards.js";
export const REFERENCE_SIMILARITY_FLAG = 0.6; // 이상이면 '레퍼런스 거의 베낌' 신호
// text가 references 중 어느 하나와 가장 많이 겹치는 포함도(0~1). references 비면 0.
export function maxReferenceSimilarity(text: string, references: string[]): number;
```
- 구현은 `containment(text, buildCorpusShingles([ref]))`의 references 최대값. (전체를 한 셋으로 합치지 말고 **개별 ref와 비교한 최대** — "한 레퍼런스를 통째 베낌"을 잡기 위함.)

### 3) toCandidates 배선 (`stage.ts` + `stageContract.ts`)
- `ProposalStageSpec.toCandidates` 시그니처를 `(out, input?) => Candidate[]`로 **확장**(2번째 인자 = prepare가 만든 input, 선택적). `runProposalStage`가 `spec.toCandidates(res.data, preparedInput)`로 호출하게 한다.
  - **중요(픽스처 보존)**: `toCandidates`는 promptHash와 무관(LLM 호출 *후* 변환)이다. 다른 단계(topic/structure)의 toCandidates는 2번째 인자를 안 쓰므로 payload·해시 전부 불변. 이 점을 테스트로 확인.
- 훅이 `toCandidates(out, input)`가 각 후보 payload에 담을 것:
  - `title`, `thumbnail_layout`, `thumbnail_main`, `thumbnail_boxes`
  - `thumbnail_copy`(**파생·back-compat**): `[...thumbnail_main, ...thumbnail_boxes].filter(Boolean).join("\n")`. (기존 `summarizeChoicePayload`·레거시 렌더가 계속 작동하게 — 이 필드 없애면 retrospective가 깨진다.)
  - `ref_similarity`: `maxReferenceSimilarity(title, (input?.reference_titles ?? []).map(r => r.text))` (UI가 step1에서 경고 배지로 surface).

### 4) 타입 (`proposalTypes.ts`)
`TitlePayload`에 추가(레거시 호환 위해 신규는 옵셔널):
```ts
thumbnail_main?: string[];
thumbnail_boxes?: string[];
thumbnail_copy?: string;   // 이제 파생/레거시 — 옵셔널로
ref_similarity?: number;
```

### 5) eval + 골든 픽스처 (오프라인 유지의 핵심)
- `tests/eval.test.ts` 훅이 블록(52~62줄)을 **신규 구조 기준**으로:
  - 필터를 신규형만 통과하게: `outputs("hook_maker")` 중 `candidates[].thumbnail_main`이 배열인 것만(레거시 9개는 자동 제외 — eval.test 상단 주석 "형태 변이 견고·레거시 건너뜀" 철학).
  - `it("골든셋 존재", () => expect(fx.length).toBeGreaterThan(0))` 유지.
  - 각 후보: `title` 비자명(≥6), `thumbnail_main` 길이 2·각 비자명(≥2), `thumbnail_boxes` 길이 2·각 비자명(≥2), `thumbnail_layout` 비자명, `evidence_ids` ≥1. (`thumbnail_copy` 검증 줄은 제거.)
- **신규형 골든 픽스처 1개 추가**: `fixtures/parity/hook_maker/structured-paking.json`. eval은 디렉토리의 모든 .json의 `rawJson`을 파싱해 읽으므로(promptHash 매칭 불필요), 손으로 작성한 골든 1개면 신규형 커버리지가 산다. 위 파킹통장 예시로 **후보 3개**(서로 다른 앵글)를 채운다. 형식은 기존 픽스처와 동일(`{promptHash, roleId:"hook_maker", model:"sonnet", rawJson:"<JSON 문자열>", usage, recordedAt}`), rawJson 안에 `{candidates:[{title, thumbnail_layout, thumbnail_main:[2], thumbnail_boxes:[2], reason, evidence_ids:[≥1]}, …3개]}`.
  - 레거시 9개 픽스처는 그대로 둔다(프롬프트 변경으로 replay엔 어차피 미스 — record 모드 라이브서 새로 녹화됨, eval은 신규형만 봄).

### 6) 테스트 (신규 `tests/hookThumbnailContract.test.ts`)
- 스키마: `HOOK_MAKER_SCHEMA`가 main/boxes 2개 강제(ajv로 1개·3개 거부, 2개 통과) — 기존 `src/llm/schema.ts` validator 재사용.
- `maxReferenceSimilarity`: 레퍼런스와 **동일 문자열** → ≥ REFERENCE_SIMILARITY_FLAG(거의 1). **재구성된 다른 표현** → 낮음(< flag). references 빈 배열 → 0.
- `toCandidates`: main/boxes 입력 → payload에 main/boxes 보존 + `thumbnail_copy` 파생(join) + `ref_similarity` 계산. input 없이 호출해도 크래시 없음(ref_similarity 0 또는 생략).

## 주의
- **`thumbnail_copy`를 출력 스키마에선 빼되 payload엔 파생으로 남겨라.** 이유: `src/agents/retrospectivist`·`summarizeChoicePayload`(retrospective.test.ts:35)가 `payload.thumbnail_copy` 문자열을 읽는다 — 없애면 회고가 깨진다.
- **새 유사도 알고리즘 만들지 마라.** 이유: `scriptGuards.containment`가 이미 같은 문제(문구 베낌)를 푼다 — 재사용이 단일 출처.
- **레거시 픽스처 9개 재녹화/삭제 금지.** 이유: 재녹화는 DB+라이브가 필요(이 step은 오프라인). eval을 신규형만 보게 만들고 골든 1개를 손으로 추가하면 충분.
- `toCandidates` 시그니처 확장은 **additive**(2번째 인자 옵셔널) — 다른 단계 payload 1바이트도 안 바뀌게.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수(배열 인덱스 `?.`, 옵셔널에 undefined 명시대입 금지).
- UI 파일(ThumbnailCanvas·ProposalSelector·RequestStageButton)은 **건드리지 마라**(step1·step2).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0. 특히 `npm test`의 eval(훅이 신규형 ≥1)·기존 retrospective·parity 그린.
2. `git diff`로 topic/structure 단계 payload·기존 픽스처 불변 자가확인.
3. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"훅이 출력=thumbnail_main[2]+thumbnail_boxes[2](파생 thumbnail_copy back-compat)+ref_similarity, 프롬프트 구조·anti-dup, maxReferenceSimilarity(containment 재사용), toCandidates(out,input) additive, eval 신규형+골든픽스처1, 테스트. DB/LLM 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- UI 컴포넌트 수정 금지(step1·step2). 이유: 레이어 분리.
- 레거시 픽스처 재녹화/삭제 금지(위 이유).
- 기존 테스트(retrospective·parity·hookMakerPrepareWiring 등)를 깨뜨리지 마라 — 깨지면 호환되게 고쳐라(없애지 말고).
