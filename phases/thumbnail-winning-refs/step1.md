# Step 1: winning-refs-wiring (prepare 배선 + schema SYSTEM 주입)

**step0의 `loadWinningThumbnailRefs`를 썸네일 생성 prepare에 꽂고, SYSTEM 프롬프트에 '김짠부 실제 고성과 썸네일 — 이 스타일로 재창작' few-shot 지시를 추가한다.** 이 step으로 방법 A가 라이브에서 작동한다.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md` — 계층·디자인(TRUS 3색)·비용($0).
- `phases/thumbnail-winning-refs/step0.md` + step0이 만든 **`src/agents/thumbnail_maker/winningRefs.ts`** — `loadWinningThumbnailRefs`/`WinningThumbnailRef` 시그니처. (step0 summary도 컨텍스트로 전달됨.)
- `src/agents/thumbnail_maker/prepare.ts` — **주 수정 대상.** 특히 `style_profile`(54)·`learned_insights`(50)·`reference_titles_external`(58)이 **"있을 때만 주입(없으면 input/system 불변)"** 하는 패턴. 이걸 **그대로 미러**하라.
- `src/agents/thumbnail_maker/schema.ts` — `ThumbnailMakerInput` 타입(없음 — prepare.ts에 정의됨)·`THUMBNAIL_MAKER_SYSTEM`(44). 박스 12자·메인 20자·banned·anti-dup 규칙이 이미 있다(유지).
- `src/agents/shared/styleProfile.ts` — `appendThumbnailStyle`(41)의 "있을 때만 섹션 추가, 없으면 원본 그대로(해시 불변)" 순수 합성 패턴. SYSTEM 주입 방식의 모범.
- `tests/` — 썸네일 관련 기존 테스트(thumbnail_maker·eval). 깨지면 안 됨.

## 작업
### 1) `src/agents/thumbnail_maker/prepare.ts` — 입력 타입 + 주입
- `ThumbnailMakerInput`(11)에 옵셔널 필드 추가:
```ts
  reference_winning_thumbnails?: { id: string; topic: string; main: string[]; boxes: string[] }[];
  // 김짠부 실제 고성과 우승 썸네일(ab_variants 성과순 top N) — few-shot. 있을 때만(없으면 promptHash 불변).
```
- prepare 본문: `loadWinningThumbnailRefs(supa)` 호출 → **`length > 0`일 때만** `input.reference_winning_thumbnails = refs` 세팅. (style_profile/learned_insights와 동일 조건부.)
- system 합성: 우승 레퍼런스가 있을 때만 SYSTEM에 섹션을 덧붙인다. **순수 합성 함수**(schema.ts에 두거나 styleProfile.ts의 append* 옆에 미러)로 만들어, 빈 배열이면 원본 그대로 반환(바이트 불변). 기존 `appendThumbnailStyle(appendLearnedInsights(...))` 체인에 이어 붙인다.

### 2) SYSTEM 섹션 내용 (few-shot 지시)
새 합성 함수가 덧붙일 섹션(예시 — 표현은 재량, 의도는 고정):
- 머리말: "── 김짠부 실제 고성과 썸네일(점유율·CTR·조회수로 검증된 우승작) ──"
- 지시: "아래는 김짠부 채널에서 **실제로 성과가 가장 좋았던 썸네일**이다. 이 **톤·구조·후킹 강도**로 새 후보를 써라. ★그대로 베끼지 마라 — 표현·단어를 재구성해 김짠부답되 매번 새롭게(거의 동일하면 anti-dup ref_similarity 가드에 걸린다). 이 스타일을 따른 후보는 evidence_ids에 해당 id(style:winner:…)를 포함하라."
- 그 뒤 각 레퍼런스를 사람이 읽기 쉬운 줄로: `- (id) 메인: "<main[0]>" / "<main[1]>"  · 박스: "<boxes[0]>" / "<boxes[1]>"`.
- 기존 SYSTEM의 메인 20자·박스 12자·단정톤·banned·"두 메인은 각자 완성"·TRUS 3색 규칙은 **그대로 유지**(이 섹션이 덮어쓰지 않는다).

## 주의 (구체)
- **빈 결과 → 바이트 불변**: `reference_winning_thumbnails`가 없거나 비면 input·system이 기존과 **완전히 동일**해야 한다. 이유: 오프라인·corpus 비었을 때 promptHash 불변 → 기존 parity 픽스처·eval 보존. 이게 phase 핵심 계약(step0과 동일).
- **새 필드는 옵셔널·조건부 세팅**. `input.x = undefined`로 두지 말고 **있을 때만 키 추가**하라(style_profile 방식). 이유: `exactOptionalPropertyTypes`에서 undefined 키도 직렬화에 영향.
- **기존 SYSTEM 규칙 삭제·약화 금지.** 메인 20/박스 12/단정톤/banned/anti-dup를 그대로 둔 채 **섹션만 추가**. 이유: 이전 phase들이 박은 품질 가드.
- **reference_thumbnail_copies(기존 corpus 슬롯)는 건드리지 마라.** 그대로 둔다(라이브 0건이라 무해·하위호환). 이유: 범위 최소화.
- 라이브에서 우승작이 채워지면 promptHash가 바뀌어 새 픽스처가 record된다($0, claude-p). **이건 정상**이며 이 step의 오프라인 AC와 무관(오프라인엔 우승 데이터 없음). eval 테스트는 출력 형태만 보므로 통과해야 한다.
- `noUncheckedIndexedAccess`: `main[0]`/`boxes[1]` 접근 시 길이 가드 또는 옵셔널 처리.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```
(오프라인엔 ab_variants 우승 데이터가 없어 새 필드 부재 → 기존 픽스처·eval 전부 그대로 green이어야 한다.)

## 검증 절차
1. 위 AC 실행(Joy가 직접 실행해 exit code 확보). 특히 **기존 썸네일·eval 테스트가 전부 그대로 통과**하는지(하위호환 = promptHash 불변).
2. 체크:
   - 우승 레퍼런스 빈 배열일 때 system·input이 기존과 바이트 동일한가(합성 함수 순수·조건부)?
   - 기존 SYSTEM 품질 규칙(메인20/박스12/banned/anti-dup)이 보존됐는가?
   - `loadWinningThumbnailRefs`를 prepare가 올바르게 호출하는가(style_profile 조건부 패턴 미러)?
3. `phases/thumbnail-winning-refs/index.json` step 1 갱신: 성공 → `completed` + `summary`. 실패 3회 → `error`. 외부개입 → `blocked`.

## 금지사항
- 우승작 없을 때 input/system을 바꾸지 마라. 이유: promptHash 불변 계약(기존 픽스처·eval 무효화 방지).
- 기존 SYSTEM 규칙(메인20/박스12/단정톤/banned/anti-dup)을 지우거나 약화하지 마라. 이유: 누적된 품질 가드.
- `reference_thumbnail_copies` 슬롯·corpus 쿼리를 수정하지 마라. 이유: 범위 밖·하위호환.
- step0의 `winningRefs.ts`/`viewsConfidence`를 수정하지 마라. 이유: step0에서 확정·테스트됨.
- 기존 테스트를 깨뜨리지 마라.
