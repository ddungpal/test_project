# Step 2: local-gen-wiring (생성 배선 — 로컬 우선·LLM 폴백)

**제목/썸네일 생성·다시생성이 활성 스켈레톤을 로컬로 채워($0) 후보를 만들고, callLLM을 건너뛰게 배선.** 스켈레톤 없거나 mode=llm이면 기존 LLM 경로 그대로. UI는 step3.

## 배경 (왜 이렇게)
- 생성 진입점 = `src/pipeline/stageContract.ts`의 `runProposalStage`: `prepare`(99) → **`callLLM`(120, AI 1회)** → `toCandidates`(133) → stage_proposals insert(135) → 상태전이.
- 하이브리드: `callLLM` **앞에 로컬 단락(short-circuit)**을 끼운다 — 활성 스켈레톤 + 런 주제로 step0 생성기가 후보를 만들면 **callLLM 스킵(비용 $0)**, 이후 insert/전이는 공유. 없으면 기존 LLM 경로.
- 적용 단계 = **제목(hook_maker)·썸네일(thumbnail_maker)만.** topic/structure/research/script은 로컬 훅 미구현 → 항상 LLM(불변).

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md`, `CLAUDE.md`, `docs/principles.md`(AI 호출 규율).
- `src/pipeline/stageContract.ts` — **주 수정 대상.** `ProposalStageSpec`(27)·`runProposalStage`(55): prepare(99)·callLLM(120)·toCandidates(133)·insert(135)·상태전이·cost flush. 로컬 단락을 여기에.
- `src/agents/shared/localCopyGen.ts`(step0) — `fillTitleSkeletons`/`fillThumbnailSkeletons`/`LocalGenContext`/`CopySkeletons`.
- `src/agents/shared/styleProfile.ts` — `loadActiveTitleStyle`/`loadActiveThumbnailStyle`(활성 patterns→skeletons 소스).
- `src/agents/hook_maker/stage.ts`·`prepare.ts` / `src/agents/thumbnail_maker/stage.ts`·`prepare.ts` — `hookStageSpec`/thumbnail spec의 `toCandidates`·candidate.payload 형태. 로컬 후보도 동일 payload·동일 candidate 구조(idx·payload·reason·evidence_ids)로.
- `src/pipeline/regenerateDecision.ts` + `src/agents/*/prepare.ts`의 `buildRegenerateAugmentedSystem` — 다시생성 force·변주(회차 nonce) 경로. 로컬 다시생성은 nonce를 `offset`으로.
- `src/llm/config.ts` — env 노브 추가 위치(`COPY_GEN_MODE`).
- `src/app/actions/topicRun.ts`·`RegenerateButton` 액션 — 다시생성 호출 경로(step3가 mode 전달, 이 step은 계약만).

## 작업
### 1) `ProposalStageSpec`에 옵셔널 로컬 훅
```ts
export interface ProposalStageSpec<TOut> {
  // ...기존...
  /** 활성 스켈레톤+런 주제로 로컬 후보 생성($0). 반환 null = 로컬 불가 → callLLM 폴백. mode=llm/force-llm이면 호출 안 함. */
  localCandidates?(supa: Supa, prep: { input: unknown }, ctx: { offset: number }): Promise<Candidate[] | null>;
}
```
### 2) `runProposalStage`에 로컬 단락
- `prepare` 후, **mode가 로컬 허용 + `spec.localCandidates`가 non-null 후보를 반환**하면:
  - `callLLM` **호출하지 않음**. candidates = 로컬 후보.
  - stage_proposals insert·상태전이·자동새로고침은 **기존과 동일 경로 공유**. cost ledger = **$0 항목**(또는 비용 기록 생략, 단 단계 완료 처리는 정상).
- 아니면(로컬 null·mode=llm) 기존 `callLLM` 경로 **그대로**(promptHash·픽스처·비용 불변).
- 모드 판정: `COPY_GEN_MODE`(env: `hybrid`기본 | `llm` | `local`) + 호출별 override(`forceLlm` — step3의 '새로 써줘'). `hybrid`=생성·다시생성 로컬 우선·새로써줘 LLM. `llm`=항상 LLM(기존). `local`=로컬만(스켈레톤 없으면 후보 0).

### 3) hook_maker·thumbnail_maker spec에 `localCandidates` 구현
- `loadActiveTitleStyle`/`loadActiveThumbnailStyle`로 활성 patterns.skeletons 로드 → 없으면 null(LLM 폴백).
- `buildLocalGenContext`(런 topic + research facts에서 keyword/number/target 추출)를 구성 → `fillTitle/ThumbnailSkeletons(sk, ctx, {count, offset, banned})`.
- 결과를 spec.toCandidates와 동일 payload로 candidate화(reason="로컬 스켈레톤 생성", evidence_ids=["style:active","skeleton"]).
- **0개 반환 시 null**(스켈레톤 소진/슬롯 부족) → LLM 폴백.

### 4) `buildLocalGenContext` (제목·썸네일 공용, 결정적)
- topic 문자열·research_facts(검증 수치)에서 keyword(주제 핵심 명사)·number(대표 숫자)·target(런 수준/타깃) 추출. 못 뽑은 슬롯은 ctx에서 생략(step0가 그 슬롯 후보를 버림).

## 주의 (구체)
- **하위호환 절대**: 활성 스켈레톤 없거나 mode=llm → `callLLM` 경로가 **바이트 동일**(promptHash·픽스처·비용). 이유: forward parity 픽스처·기존 테스트 보존. **로컬 경로는 callLLM을 절대 호출하지 않아 픽스처를 건드리지 않는다.**
- **로컬 경로=AI 0회**: callLLM 미호출 → 비용 0·CostGuard 통과. 단 stage_proposals·상태전이·자동새로고침은 정상 수행. 이유: 파이프라인 무결성.
- **다시생성 변주**: 회차 nonce→`offset`. 로컬 스켈레톤 소진되면 null→LLM 폴백(또는 mode=local이면 빈 후보 안내). 이유: 무한 동일후보 방지.
- **payload 동형**: 로컬 후보 payload가 toCandidates 출력과 정확히 같아야 downstream(선택·확정·conformance·UI)이 분기 없이 동작. 이유: 회귀 차단.
- topic/structure/research/script에 `localCandidates` **추가 금지**(제목·썸네일만). 이유: 그 단계는 창작 규칙 미학습·범위.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트
- runProposalStage 단락: `localCandidates`가 후보 반환 → callLLM 미호출(목으로 호출 0 검증)·candidates=로컬·insert 정상. 반환 null → callLLM 경로(기존 동작).
- mode: `llm`이면 로컬 훅 미호출(기존 경로). `hybrid`+활성 스켈레톤 → 로컬. `hybrid`+스켈레톤 없음 → LLM.
- hook/thumbnail localCandidates: 활성 스켈레톤+ctx → payload 동형 후보 / 스켈레톤 없음 → null.
- buildLocalGenContext: 슬롯 추출 결정적.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수). 기존 파이프라인/agent 테스트·forward parity 회귀 0.
2. 체크: 로컬 단락 callLLM 스킵($0)·하위호환(스켈레톤 없음/mode=llm 동일)·payload 동형·제목/썸네일만 적용·상태전이 정상.
3. `phases/copy-local-gen/index.json` step 2 갱신.

## 금지사항
- 로컬 경로에서 callLLM 호출 금지(스킵이 핵심). 이유: $0·픽스처 무영향.
- 스켈레톤 없음/mode=llm에서 기존 LLM 경로 동작을 바꾸지 마라. 이유: 하위호환·forward 픽스처.
- topic/structure/research/script에 로컬 생성 적용 금지. 이유: 범위·창작 규칙 미학습.
- 로컬 후보 payload를 toCandidates와 다르게 만들지 마라. 이유: downstream 회귀.
- UI 수정 금지(step3). 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
