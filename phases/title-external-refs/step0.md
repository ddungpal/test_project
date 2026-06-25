# Step 0: title-reference-rewrite

**제목 생성에 "조회수 높은 관련 유튜브 영상 제목"을 레퍼런스로 주입하고, 그걸 김짠부 말투로 재창작한다.** 사용자(김짠부)는 여전히 **최종 제목 3개만** 보고 1개 고른다(현 흐름 동일). 내부적으로만 2스텝: ① 레퍼런스 수집(검색/데이터, **LLM 0회**) → ② 기존 훅이 LLM 1콜에 레퍼런스를 넣어 직설 말투로 재창작(**LLM 추가 0회**).

## 배경 (왜 이렇게)
- 현재 훅이(`hook_maker`)는 선택된 주제 + 김짠부 과거 제목(corpus) + 학습 규칙만으로 제목을 짓는다. **외부 고조회 영상 제목은 참조하지 않는다.**
- 촉이(`topic_scout`)는 이미 외부 유튜브 신호를 **조회수(viewCount)까지** 수집한다(`src/agents/topic_scout/externalSignals.ts:100` `gatherExternalSignals`). **이 함수를 그대로 재사용**한다 — 새 검색 인프라를 만들지 않는다.
- **A안 정의**: "내부 2스텝"은 LLM을 두 번 부르는 게 아니다. 스텝①=검색/데이터 수집(코드 전용·LLM 0회), 스텝②=기존 LLM 호출에 레퍼런스를 얹는 것. **두 번째 LLM 호출을 추가하지 마라.**

### 핵심 안전장치 (반드시 지킬 것)
1. **옵트인 게이트** — 유튜브 검색은 `SEARCH_BACKEND=mock` 우회 대상이 **아니라** 실 YouTube Data API다(`searchYouTube`가 직접 호출, 검색 추상화 밖). 그래서 개발 $0·오프라인 테스트를 지키려면 수집을 **플래그로 옵트인**한다. `src/config.ts:88`의 `pickYtBackend`(=`PERFORMANCE_SOURCE==='youtube'일 때만`) 패턴을 그대로 미러: **`process.env.TITLE_REFERENCES === "youtube"` 일 때만 수집, 아니면 빈 배열.**
2. **조건부 주입** — 레퍼런스가 비어 있으면(플래그 off / API 실패 / 결과 0) `HookMakerInput`에 `reference_titles_external` 필드를 **아예 넣지 마라**. `prepare.ts`의 `learned_insights` 조건부 주입과 동일. → **promptHash가 안 바뀌어 기존 `fixtures/parity/hook_maker/*` 골든·$0 계약이 보존된다.** 이게 오프라인 AC를 통과시키는 열쇠다.

## 읽어야 할 파일 (먼저 정독)
- `/Users/dongwonchoi/Desktop/동원 백업/동원폴더/claude-code/produce script/CLAUDE.md` — 비용($0 개발)·말투(직설·핵심, 사색/여백 금지)·보안 규칙.
- `src/agents/hook_maker/prepare.ts` — `prepareHookMaker`(17~45), `HookMakerInput`(9~14), `getSelectedStagePayload`로 topic 로드(17~19), corpus 제목 로드(23~30), `learned_insights` **조건부** 주입(이 패턴을 외부 레퍼런스에도 그대로).
- `src/agents/hook_maker/schema.ts` — `HOOK_MAKER_SYSTEM`(말투·기존 reference_titles 사용지침). 외부 레퍼런스 사용 지침을 여기 추가.
- `src/agents/hook_maker/stage.ts` — `hookStageSpec.toCandidates`(reference_titles로 `ref_similarity` 계산하는 패턴, input 없이 호출돼도 빈배열 안전). 외부 레퍼런스 evidence 매핑도 여기.
- `src/agents/topic_scout/externalSignals.ts` — `gatherExternalSignals(opts: { webQueries, ytQuery?, maxPerQuery?, volatility? }): Promise<ExternalItem[]>`(100줄~). `ExternalItem`(source 'youtube'|'web'·title·url·viewCount·publisher). **재사용 대상.**
- `src/config.ts` — `pickYtBackend`(85~88) 옵트인 패턴. 여기에 `titleReferencesEnabled()` 같은 게이트를 미러.
- `tests/eval.test.ts` — hook_maker eval이 **형태(candidates≥3·비자명)만** 보고 레거시/이형 fixture는 건너뛰는 패턴(28~48). 새 형태가 이 검사를 통과하는지.
- `fixtures/parity/hook_maker/` — 골든 fixture 구조(promptHash로 파일명). 플래그 off면 기존 그대로.
- `.env.example` — SEARCH/PERFORMANCE 섹션(18~52). `TITLE_REFERENCES` 추가.

## 작업
### 1) 순수 추림 함수 (오프라인 테스트의 핵심) — `src/agents/hook_maker/externalRefs.ts` (신규)
```ts
import type { ExternalItem } from "../topic_scout/externalSignals.js";

export interface ExternalTitleRef { id: string; title: string; viewCount: number; url: string; publisher: string | null; }

// youtube 소스 & viewCount!=null 만 → 조회수 내림차순 → 제목 중복 제거 → 상위 n.
export function pickTopExternalTitles(items: ExternalItem[], n: number): ExternalTitleRef[];
```
- 순수함수(네트워크·DB 없음). 결정적. 동률 정렬은 안정적으로(viewCount desc, 그다음 id 등 tie-break)·빈 입력 → 빈 배열.

### 2) 수집 래퍼 (게이트 포함) — 같은 파일 또는 prepare 내부
```ts
// 플래그 off거나 결과 없으면 [] (오프라인·$0). topic 문자열로 gatherExternalSignals 호출.
export async function gatherTitleReferences(topic: string): Promise<ExternalTitleRef[]>;
```
- `TITLE_REFERENCES !== "youtube"` → 즉시 `[]` 반환(네트워크 0).
- 활성 시 `gatherExternalSignals({ webQueries: [topic], ytQuery: topic, maxPerQuery: ~8, volatility: "slow" })` → `pickTopExternalTitles(items, 5)`.
- `gatherExternalSignals`는 best-effort(실패 시 빈 결과)라 throw 전파 안 하게 방어.

### 3) prepare 주입 (조건부) — `src/agents/hook_maker/prepare.ts`
- `HookMakerInput`에 `reference_titles_external?: ExternalTitleRef[]` 추가(옵셔널).
- `const externalRefs = await gatherTitleReferences(topic);` 후 **비어있지 않을 때만** input에 넣는다(스프레드 조건부, `learned_insights`와 동일). 비면 필드 부재 → promptHash 불변.

### 4) 시스템 프롬프트 — `src/agents/hook_maker/schema.ts`
- `HOOK_MAKER_SYSTEM`에 한 단락 추가(대략): "입력에 `reference_titles_external`(주제 관련 고조회 유튜브 제목+조회수)이 있으면, 그 **후킹 프레이밍·각도**를 분석해 참고하라. 단 **낚시·자극을 그대로 베끼지 말고**, 김짠부의 직설·핵심 말투로 **재창작**하라. 조회수가 높다고 표현을 모방하지 않는다(말투 일관성 > 모방)."
- 기존 reference_titles(김짠부 과거 제목) 지침은 유지.

### 5) toCandidates evidence (back-compat) — `src/agents/hook_maker/stage.ts`
- 기존 `ref_similarity`(김짠부 과거 제목 대비) 로직 **그대로 유지**.
- 외부 레퍼런스가 후보 생성에 쓰였음을 근거로 곁들이려면, `reference_titles_external`을 evidence로 가볍게 노출(선택). 기존 페이로드 형태(title·ref_similarity)는 깨지 말 것(다운스트림 회고/요약이 읽음).

### 6) config + .env.example
- `src/config.ts`에 `titleReferencesEnabled()`(또는 동등) 추가 — `pickYtBackend` 미러.
- `.env.example`에 `TITLE_REFERENCES=off`(또는 미설정=off) + 한 줄 주석(youtube로 켜면 제목 단계가 고조회 관련 제목을 참조·YOUTUBE_API_KEY 필요·운영 과금).

## 테스트 (신규 `tests/hookMakerExternalRefs.test.ts`)
- `pickTopExternalTitles`: ① 조회수 내림차순 top n ② web 소스·viewCount null 제외 ③ 제목 중복 제거 ④ 빈 입력 → [] ⑤ n보다 적으면 있는 만큼.
- (가능하면) `gatherTitleReferences`가 플래그 off에서 네트워크 없이 `[]` 반환(게이트 검증).

## 주의 (구체)
- **플래그 off/오프라인일 때 prepare의 promptHash·출력이 1바이트도 바뀌면 안 된다.** 이유: 기존 hook_maker parity 골든이 깨지고 $0·회귀가 발생. 조건부 주입 필수(빈 배열도 넣지 마라 — 필드 자체를 부재로).
- **두 번째 LLM 호출을 추가하지 마라.** 이유: A안은 LLM 1콜에 레퍼런스를 얹는 것. 비용·정의 위반.
- **테스트가 실제 네트워크에 의존하면 안 된다.** 이유: 오프라인 $0. 기본(플래그 off)에서 `gatherExternalSignals`가 호출조차 안 되게 게이트.
- **낚시 제목을 베끼지 마라(프롬프트에 명시).** 이유: 김짠부 말투 일관성 > 외부 모방(principles.md 직설·핵심).
- **hook_maker만 건드려라.** topic_scout·structure·thumbnail 등 침범 금지(externalSignals는 import만, 수정 금지). 이유: 단일 모듈 범위.
- `exactOptionalPropertyTypes`(옵셔널에 undefined 명시대입 금지 → 조건부 스프레드)·`noUncheckedIndexedAccess` 준수.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```
(전부 오프라인·$0. 플래그 미설정이라 외부 수집 없이 기존과 동일 동작 + 새 순수함수 테스트 통과.)

## 검증 절차
1. 위 AC 커맨드 실행(Joy가 git diff + AC로 검수).
2. 아키텍처 체크: 조건부 주입으로 기존 hook_maker fixture 보존(플래그 off promptHash 불변), LLM 호출 수 불변, 말투 원칙(직설·낚시 모방 금지) 프롬프트 반영, 보안($0·키 비커밋).
3. 결과에 따라 `phases/title-external-refs/index.json`의 step 0 갱신:
   - 성공 → `"status": "completed"`, `"summary"`에 **"라이브 검증 미수행 — 사용자가 TITLE_REFERENCES=youtube + YOUTUBE_API_KEY로 record 1회 돌려 외부 레퍼런스 반영을 확인해야 함"** 포함.
   - 실패(3회) → `"status": "error"`, `"error_message"`.
   - 외부 자격 필요 → `"status": "blocked"`, `"blocked_reason"`.

## 금지사항
- 플래그 off 경로의 출력/promptHash 변경 금지. 이유: 기존 fixture·$0 보존.
- 두 번째 LLM 호출 추가 금지. 이유: A안 정의·비용.
- 테스트의 네트워크 의존 금지. 이유: 오프라인 $0.
- 외부 낚시 제목 모방 금지(프롬프트). 이유: 말투 일관성.
- hook_maker 외 모듈 수정 금지(externalSignals는 import만). 이유: 단일 범위.
- 기존 테스트를 깨뜨리지 마라.
