# Step 0: skeleton-engine (로컬 생성 엔진 — 순수 + 테스트)

**학습된 '스켈레톤(파라메트릭 템플릿)'을 런의 주제 키워드로 채워 제목/썸네일 후보를 LLM 없이 만드는 순수 생성기.** DB·LLM·UI 무관. 학습시 방출은 step1, 생성 배선은 step2, UI는 step3. 이 step은 **도메인/순수 계층만** — ground-truth부터.

## 배경 (왜 이렇게)
- 현재 `style_profiles.patterns`는 **채점 규칙(rubric)** — emphasis_words·banned·visual 가이드일 뿐, 새 주제용 완성 문구가 없다. 그래서 매 생성마다 LLM이 그 규칙을 보고 새로 쓴다(= API 비용).
- 사용자 의도: **재학습(API)만 비용, 생성/재생성은 학습 결과로 로컬($0)**. 이를 위해 학습이 '스켈레톤'(슬롯 있는 템플릿)을 같이 만들고(step1), 이 step의 순수 생성기가 그 스켈레톤을 런의 주제 데이터로 채운다.
- 예) 스켈레톤 main `"{number}년 묶이면 절대 깨지 마세요"` + box `"{target} 필수"` → 주제 컨텍스트(number=3, target=사회초년생)로 채움 → "3년 묶이면 절대 깨지 마세요" / "사회초년생 필수".

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md`, `docs/tech.md`(§12·§13 스타일/학습), `CLAUDE.md`.
- `scripts/learn-ab-style.ts` — `ThumbnailStylePatterns` 구조(copy.emphasis_words·visual·banned·confidence/tentative_notes 안전수령 패턴, 340~). **patterns에 추가될 skeletons 형태를 여기 타입과 일관되게.**
- `src/agents/shared/styleProfile.ts` — `loadActiveTitleStyle`/`loadActiveThumbnailStyle`(활성 patterns 로더). 반환 patterns에 skeletons가 실릴 자리.
- `src/agents/hook_maker/stage.ts`·`src/agents/thumbnail_maker/stage.ts` — `toCandidates`가 만드는 `Candidate` 형태(payload 구조: 제목 `{title}`, 썸네일 `{copy_main:[],copy_boxes:[]}`). 로컬 생성기 출력이 이 payload와 같아야 step2가 그대로 쓴다.
- `src/agents/hook_maker/styleConformance.ts` — `evaluateStyleConformance`(banned substring·emphasis 부합). banned 필터 재사용 가능.

## 작업
### 1) 스켈레톤 타입 + 로컬 생성기 `src/agents/shared/localCopyGen.ts`
```ts
// 스켈레톤(학습 산출·patterns.skeletons에 저장). 슬롯 = {number}|{target}|{keyword}|{topic}.
export interface TitleSkeleton { template: string; slots: string[] }            // 제목 1줄
export interface ThumbnailSkeleton { main: string[]; boxes: string[]; slots: string[] } // 메인2·박스2 템플릿
export interface CopySkeletons { title?: TitleSkeleton[]; thumbnail?: ThumbnailSkeleton[] }

// 런 데이터에서 추출한 슬롯 채움 재료(step2가 DB/run에서 구성해 주입 — 이 함수는 순수).
export interface LocalGenContext {
  topic: string;
  keyword?: string;   // 주제 핵심 명사
  number?: string;    // 주제/리서치에서 뽑은 대표 숫자(있으면)
  target?: string;    // 타깃/수준(예: 사회초년생, 입문)
}

// 슬롯 치환 + banned 필터 + 라운드별 변주(offset)로 후보 N개. 순수·결정적(같은 입력+offset=같은 출력).
export function fillTitleSkeletons(sk: TitleSkeleton[], ctx: LocalGenContext, opts: { count: number; offset?: number; banned?: string[] }): { title: string }[];
export function fillThumbnailSkeletons(sk: ThumbnailSkeleton[], ctx: LocalGenContext, opts: { count: number; offset?: number; banned?: string[] }): { copy_main: string[]; copy_boxes: string[] }[];
```
- **슬롯 치환**: `{number}`·`{target}`·`{keyword}`·`{topic}`를 ctx에서 치환. ctx에 없는 슬롯이 템플릿에 남으면 그 후보는 **버린다**(어색한 빈 슬롯 누출 금지) — 부족하면 후보 수가 count보다 적어도 됨(빈 슬롯 채운 가짜 후보 금지).
- **banned 필터**: 결과 문구가 banned 표현(substring)을 포함하면 제외(`evaluateStyleConformance`의 banned 매칭 재사용 가능).
- **변주(offset)**: 다시생성 라운드마다 `offset`을 늘려 스켈레톤 배열을 회전/순열 → 라운드 간 다른 후보. 스켈레톤 소진 시 빈 배열 반환(step2가 LLM 폴백 결정).
- **출력 payload 형태**는 `toCandidates`의 candidate.payload와 동일(제목 `{title}`, 썸네일 `{copy_main,copy_boxes}`) — step2가 그대로 candidates로 감싼다.

## 주의 (구체)
- **순수 함수**: DB·네트워크·LLM·시각(Date/random) 금지. ctx·skeletons는 인자로만. 이유: 테스트 용이·step2가 재료를 주입.
- **빈 슬롯 누출 금지**: 치환 못한 슬롯이 남은 후보는 버린다. 이유: "{number}년..." 같은 깨진 문구가 사용자에게 노출되면 안 됨.
- **결정적+변주 양립**: 같은 (ctx, offset)은 항상 같은 출력(테스트 가능), offset이 다르면 다른 후보(다시생성 다양성). random 쓰지 말 것(스켈레톤 인덱스 회전으로 변주).
- **빈 입력 안전**: skeletons 빈 배열/undefined → 빈 배열 반환(throw 금지). 이유: 활성 스켈레톤 없으면 step2가 LLM 폴백.
- 이 step은 **schema·DB·agent·UI 미침범**(step1·2·3).
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트 (`tests/localCopyGen.test.ts`)
- 제목/썸네일 채움: 슬롯 전부 있는 ctx → count개 후보, payload 형태 정확.
- 빈 슬롯 누출 방지: ctx에 없는 슬롯 템플릿 → 그 후보 제외(개수 감소 허용).
- banned 필터: banned 포함 결과 제외.
- 변주: offset 0 vs 1 → 다른 후보 집합. 같은 offset 2회 → 동일(결정적).
- 빈 skeletons → 빈 배열.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수).
2. 체크: 순수성(DB/LLM/random 없음)·빈슬롯 누출 차단·banned 필터·결정적 변주·payload 형태가 toCandidates와 일치.
3. `phases/copy-local-gen/index.json` step 0 갱신.

## 금지사항
- DB·LLM·네트워크·random·Date 사용 금지. 이유: 순수성·결정성(테스트·재료는 step2가 주입).
- 빈 슬롯이 남은 후보를 내보내지 마라. 이유: 깨진 문구 노출 방지.
- schema/agent/UI 수정 금지(step1·2·3). 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
