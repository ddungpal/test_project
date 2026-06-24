# Step 0: conformance-guard

**A/B 학습에 '이빨'을 주는 사후 가드(백엔드).** 활성 style_profile에서 학습한 `banned`(A/B 패배 패턴)·`winning`(emphasis_words·hook_patterns)으로 훅이 출력을 검사해 부합도/위반을 각 후보 payload에 주석한다. 지금은 학습이 프롬프트 조언일 뿐 강제력이 없다.

## 배경
- 훅이 prepare(`src/agents/hook_maker/prepare.ts`)가 `loadActiveThumbnailStyle()`로 active 스타일을 `input.style_profile`에 넣고, 시스템 프롬프트에 패턴을 주입한다. **그러나 출력이 banned 패턴(예 "TOP4"·"500,000,000원")을 따라도 잡는 게 없다.**
- 직전 phase에서 만든 `ref_similarity`(레퍼런스 베낌 경고)와 **동일한 방식**으로, 학습 부합도를 결정적으로 주석한다.
- ⚠ 휴리스틱: banned/hook_patterns는 LLM이 뽑은 **서술형**(예 "리스트·순위형: 신용카드 TOP4")이라 완전 의미매칭은 불가. **checkable 토큰**(emphasis_words = 깨끗한 키워드, banned/hook의 따옴표 예시구) 기반 근사로 간다. winning_score(emphasis_words 부합)는 견고, banned_hits는 best-effort. (완전 의미판정=LLM judge는 후순위.)

## 읽어야 할 파일 (먼저 정독)
- `src/agents/style_extractor/schema.ts` — `ThumbnailStylePatterns`: `copy.hook_patterns: string[]`·`copy.emphasis_words: string[]`·`banned: string[]`. **이 필드로 검사.**
- `src/agents/hook_maker/stage.ts` — `toCandidates(out, input)`가 각 후보 payload에 `ref_similarity: maxReferenceSimilarity(...)`를 이미 주석(직전 phase). 같은 자리에 `style_conformance` 추가. `input.style_profile?.patterns`로 active 패턴 접근.
- `src/agents/hook_maker/prepare.ts`·`src/agents/shared/styleProfile.ts` — `HookMakerInput.style_profile`(ActiveThumbnailStyle: `{ id, patterns }`) 형태 확인.
- `src/agents/hook_maker/referenceGuard.ts`·`src/pipeline/scriptGuards.ts` — `containment`·토큰 매칭 재사용 후보. `REFERENCE_SIMILARITY_FLAG` 패턴.
- `src/lib/dashboard/proposalTypes.ts` — `TitlePayload`(여기에 `style_conformance?` 추가).

## 작업
### 1) 순수 평가 함수 `src/agents/hook_maker/styleConformance.ts`
```ts
import type { ThumbnailStylePatterns } from "../style_extractor/schema.js";
export interface StyleConformance {
  banned_hits: string[];   // 매칭된 banned 항목(원문 일부)
  winning_score: number;   // 0~1, 승리 신호(emphasis_words 등) 부합도
}
// text(제목+메인문구 합)를 active patterns에 비춰 평가. patterns 없으면 중립({banned_hits:[], winning_score:0}).
export function evaluateStyleConformance(text: string, patterns: ThumbnailStylePatterns | null | undefined): StyleConformance;
export const STYLE_CONFORMANCE_BANNED_FLAG = 1; // banned_hits ≥ 1이면 ⚠
```
- **winning_score**: `copy.emphasis_words`(깨끗한 키워드: 딱·무조건·미친·역대급 등) 중 text에 등장하는 비율(0~1). emphasis_words 비면 0(중립).
- **banned_hits**: 각 `banned` 항목에서 **따옴표 안 예시구**를 추출(정규식 `"…"` / '…')해 text에 substring 포함되면 그 banned 항목을 hit로. 따옴표 예시 없으면 그 항목은 스킵(거짓양성 방지). 추가로 명백한 토큰("TOP", 숫자 자릿수 전체표기 `\d{1,3}(,\d{3})+`)도 옵션 매칭.
- 전부 방어적(빈/깨진 patterns → 중립). 결정적.

### 2) 훅이 주석 (`stage.ts toCandidates`)
- `input.style_profile?.patterns`를 꺼내, 각 후보의 `title`+`thumbnail_main.join(" ")`를 `evaluateStyleConformance`로 평가 → payload에 `style_conformance: { banned_hits, winning_score }` 추가.
- patterns 없으면(스타일 미주입) 주석 생략 또는 중립값 — **payload 형태가 ref_similarity처럼 promptHash와 무관**(LLM 호출 후 변환)임을 유지(픽스처 보존).

### 3) 타입 (`proposalTypes.ts`)
- `TitlePayload`에 `style_conformance?: { banned_hits: string[]; winning_score: number }` 추가(옵셔널).

## 주의
- **promptHash 무관 보장**: toCandidates는 LLM 호출 *후* 변환 — 기존 hook_maker 픽스처·parity 불변(직전 ref_similarity와 동일). git diff로 확인.
- **휴리스틱임을 명시**(주석): banned_hits는 따옴표 예시구 substring 매칭이라 완전하지 않다 — 거짓음성 가능. winning_score가 더 신뢰. // ponytail: 완전 의미매칭=LLM judge는 후순위, 지금은 결정적 근사로 충분.
- 빈/없는 patterns·빈 emphasis_words에 크래시 금지(중립 반환).
- UI는 건드리지 마라(step1).
- exactOptionalPropertyTypes·noUncheckedIndexedAccess 준수.

## 테스트 (`tests/styleConformance.test.ts`)
- banned 예시구("신용카드 TOP4")가 text에 있으면 banned_hits에 그 항목. 없으면 빈 배열.
- emphasis_words(["딱","무조건"]) 중 text에 1/2 등장 → winning_score 0.5.
- patterns null/빈 → 중립({banned_hits:[], winning_score:0}).
- 자릿수 전체표기("500,000,000원") → banned 매칭(옵션 토큰).
- 사실/말투 무관(이 함수는 스타일 부합만).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0. hook_maker parity/eval 픽스처 불변.
2. `git diff`로 toCandidates가 promptHash 영향 없는 payload 주석만 추가했는지 확인.
3. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"evaluateStyleConformance 순수(banned 따옴표예시 substring·자릿수토큰 매칭 + emphasis_words winning_score) + 훅이 toCandidates style_conformance 주석(promptHash 무관) + TitlePayload 타입 + 테스트. 휴리스틱·결정적. DB/LLM 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- toCandidates를 promptHash에 영향 주게 바꾸지 마라(픽스처 깨짐).
- UI 수정 금지(step1).
- 기존 테스트를 깨뜨리지 마라.
