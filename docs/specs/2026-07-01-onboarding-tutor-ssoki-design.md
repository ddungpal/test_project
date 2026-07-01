# 설계: 쏙이 (온보딩 튜터) — 구다리 전 "궁금증 아크"로 김짠부를 주제에 올려놓기

_작성: 2026-07-01 · 상태: 설계 승인(구현 대기) · 크루 신설_

## 문제

김짠부가 **구다리(구성)·셜록(리서치) 단계에서 주제 내용을 모르는 상태로 판단**하고 있다.
내용을 모르니 선택이 어렵고 콘텐츠가 어렵게 느껴진다. 시스템 대원칙("김짠부는 선택만,
이유는 AI가 설명")이 성립하려면 **선택 전에 이해**가 있어야 하는데, 주제 확정과 구다리
사이에 *김짠부를 그 주제에 올려놓는 단계*가 통째로 비어 있다.

## 결정 (사용자 확정)

- **성공 정의 = (C) 둘 다**: ①김짠부가 "이제 판단할 만큼 이해했다"고 느끼고(판단 준비),
  ②학습 중 나온 부산물(어려운 지점·아하·핵심 앵글)이 구다리로 넘어가 영상이 초보 친화적이
  된다(콘텐츠 재료). ①만으로도 즉시 가치, ②는 그 위에 공짜로 얹힘.
- **크루 신설 = 쏙이** (`roleId: onboarder`): "쏙쏙 들어오게" 정리하는 튜터. 촉이·훅이 운율 일치.
- **방식 = B안 "궁금증 먼저"**(A안 "프라이머 먼저" 기각): 퀴즈를 *수준 재는 관문*이 아니라
  *학습 엔진*으로 승격. 근거 = **프리테스트/프리퀘스천 효과**(배우기 전 찍으면(틀려도) 궁금증
  간극이 생겨 이후 학습·기억이 좋아짐; 메타분석 다수). "시험" 아닌 "호기심 체크"로 프레이밍.
- **후킹 결 = 사실 성격이 결정**(사용자 규칙): 위험/손해 사실 → **반전 훅**("좋아 보이는데
  사실 손해"), 숨은 혜택 사실 → **실용템 훅**("이거 알면 개이득"). 셜록 financial-risk 분류 재사용.
- **수준 판정 = (가) 고정 아크 + 사후 추론**(적응형 분기 기각): 모두 같은 이야기 아크를 품고
  (관심 유지=끊기지 않는 아크), 어려운 문항을 맞혔나로 **수준 추론** → 기존 `audience_level`
  캘리브레이션(새 축 안 만듦). 적응형 IRT 엔진은 과설계.
- **자막 소스 = (가)+(나) 하이브리드**: (가) 레퍼런스 영상 자막 = 질문거리·헷갈림 소재,
  (나) 영상이 쓴 숫자/사실 = 아하의 탄약(**미검증 플래그** — 진짜 검증은 나중에 셜록).
- **배치 = 게이트 아님 · 온디맨드(눈에 띄게)**: 강제 스텝 추가 안 함(자동화 방향과 안 부딪힘).
  구다리 입구에 **눈에 띄는 "먼저 이해하기" 버튼**, 하면 금맥이 자동으로 구다리에 실림, 건너뛰면 기존대로.
- **자리 = 썸네일 확정 후 / 구다리 진입 전.**

## 핵심 시퀀싱 (반드시 준수)

셜록(리서치)은 **구다리 뒤**에 돈다. 그래서 쏙이 시점엔 **셜록의 검증된 사실이 아직 없다.**
→ 하이브리드 (나)는 "셜록 출력"이 **아니라** "레퍼런스 영상 자체가 주장하는 숫자/사실(가벼운
확인)"이다. 프라이머는 김짠부만 보므로 미검증 수치는 "⚠️확인 필요"로 표시하고, 진짜 팩트체크는
기존대로 셜록에게 맡긴다. (쏙이가 새 검증 파이프라인을 만들지 않는다.)

## 설계 상세

### 데이터 모델 (마이그레이션 0)

**궁금증 아크**(쏙이 생성물)와 **금맥**(김짠부 응답에서 추출)은 전부 JSON payload — 새 컬럼·테이블 없음.

```ts
// OnboardingArc — 쏙이가 한 번에 생성 (인터랙티브 분기 엔진 없음)
type ArcQuestion = {
  prompt: string;
  choices: string[];            // 2~4지선다
  answerIdx: number;
  difficulty: "basic" | "mid" | "deep";      // 사후 수준추론용
  hookMode: "reversal" | "practical";        // 위험→반전 / 혜택→실용템
  ahaReveal: string;                          // 찍은 뒤 여는 해설
  unverifiedNumbers?: string[];               // 미검증 수치(⚠️확인 필요 표시)
  cliffhanger?: string;                        // 이 아하가 다음 문항을 여는 한 줄
};
type OnboardingArc = { questions: ArcQuestion[]; coreAngle: string };

// OnboardingGold — 김짠부 응답에서 추출(순수) → 구다리로 주입
type OnboardingGold = {
  confusionPoints: string[];    // 틀린 문항 = 시청자도 헷갈릴 것 → 구다리가 풀 섹션
  ahaPoints: string[];          // 놀란 반전 = 훅 후보
  coreAngle: string;            // 아크가 수렴한 갈림길 = 영상 핵심 앵글
  calibratedLevel: string;      // 추론된 수준(audience_level 캘리브레이션)
};
```

### A. 생성 — 쏙이 (onboarder)

- `roles.ts`: `onboarder: { roleId: "onboarder", name: "쏙이", defaultModel: "opus", tools: [] }`.
- `src/agents/onboarder/{schema,step}.ts`: 촉이·비교가 골격. schema는 `OnboardingArc`(loose·forced
  tool_use 안전 — 배열 required 함정 주의).
- `ONBOARDER_SYSTEM`: ①**듀얼 훅**(hookMode를 사실 성격으로 — 위험=reversal, 혜택=practical),
  ②**난이도 태그**(basic/mid/deep), ③**클리프행어 아크**(각 ahaReveal이 다음 문항을 열도록·랜덤 금지),
  ④아하는 입력 자막·사실에 근거, **미검증 수치는 unverifiedNumbers에** 넣고 단정 금지, ⑤억지 문항 금지.
- 입력 `OnboarderInput`: `{ topic, transcript?, videoFacts?, referenceTitle? }`.

### B. 입력 — 하이브리드 자막·사실 (쏙이 prepare)

- `src/agents/onboarder/prepare.ts`: 선택된 주제 payload + **레퍼런스 영상**(기존 outlier/searchYouTube
  레퍼런스에서 최상위 1개 재사용) → **(가)** 자막 취득 → **(나)** 영상이 쓴 숫자/사실 추출(미검증).
- `src/lib/onboarding/transcript.ts`: 경량 자막 취득(키 불필요 라이브러리 우선) — **best-effort**.
  실패 시 크래시 금지, **폴백**(영상 설명 + LLM 자체 지식). `fetchVideoStats` best-effort 패턴 미러.
- ⚠️ **유일한 신규 의존성 후보**(자막 라이브러리). 스텝 격리 → 실패해도 폴백으로 나머지 안 막음.

### C. 배선 — 온디맨드 스테이지 + 액션 (게이트 아님)

- **스테이지 등록**: `stages.ts`에 `onboarding` 등록하되 **선형 상태체인 밖**(구다리는 여전히
  `thumbnails_selected`에서 진입 — fromState 안 바꿈). `standalone` 스테이지 패턴 재사용(on-demand).
- **아크 생성 이벤트** `run/onboarding.requested`: 버튼 트리거 → 쏙이(prepare→step) 실행 → 아크
  payload 저장. (Inngest durable·fixtures 리플레이 $0.)
- **응답 제출 액션** `submitOnboarding(runId, answers)`: `extractGold`(순수) 호출 → 금맥 저장.
  requireOwner·audit `onboarding_submitted`.

### D. 금맥 → 구다리 주입 (조건부 · target-persona 패턴 미러)

- `src/agents/structurer/prepare.ts`: onboarding 금맥 payload가 **있을 때만** `StructurerInput`·
  `STRUCTURER_SYSTEM`에 주입(confusionPoints→풀어줄 섹션, ahaPoints→훅, coreAngle→앵글,
  calibratedLevel→수준). **없으면 input·system 바이트 동일 → promptHash 보존 → 기존 구다리 픽스처
  안 깨짐.** (메모리 함정 "픽스처 보존=조건부 주입" 준수.)

### E. UI — 인터랙티브 퀴즈 + 눈에 띄는 진입

- `src/components/OnboardingQuiz.tsx`(Esther): 아크를 **인터랙티브 재생**(찍기→즉시 아하 공개→다음
  클리프행어). 답 수집 → `submitOnboarding`. TRUS 3색·미검증 수치 "⚠️확인 필요" 표식.
- **진입**: 구다리 입구(썸네일 확정 후 상태)에 **눈에 띄는 "먼저 이해하기(쏙이)" 버튼** → 없으면
  `run/onboarding.requested` 발행, 있으면 퀴즈 재생. 건너뛰기 가능(강제 아님).
- 순수 로직(재생 상태·정오 판정)은 컴포넌트 밖 `src/lib/onboarding/`에 두고 컴포넌트는 re-export만
  (메모리 함정 "vitest @/ alias 없음 → 순수 헬퍼는 src/lib에" 준수).

## 안 만드는 것 (과설계 차단)

- ❌ IRT/적응형 난이도 엔진  ❌ 실시간 분기  ❌ 자유 대화 챗봇  ❌ 새 팩트검증 파이프라인(셜록 재사용)
- ❌ 새 컬럼·테이블(전부 JSON payload)  ❌ 강제 게이트 스텝

## 안 깨지는 것 (불변식)

- 구다리·짠펜: onboarding 금맥 **없는 경로는 promptHash·픽스처 불변**(조건부 주입).
- 구다리 fromState(`thumbnails_selected`) **불변**(온디맨드=선형 체인 밖).
- 셜록 검증·말투·lineage·money-safety **불변**.
- 마이그레이션 0 · 새 상태 전이(선형) 0.

## 작업 범위 (harness phase 1개 · 6 step)

| step | 영역 | 변경 |
|---|---|---|
| 0 `onboarding-arc-schema` | 순수 | `OnboardingArc`/`OnboardingGold` 타입 + 순수 헬퍼 `inferLevel`·`extractGold` + 테스트 (deps 0) |
| 1 `onboarder-agent` | 생성 | `roles.ts` 쏙이 + `onboarder/{schema,step}` + `ONBOARDER_SYSTEM`(듀얼훅·아크·미검증플래그) |
| 2 `onboarding-transcript-input` | 입력 | `onboarder/prepare.ts` + `lib/onboarding/transcript.ts`(하이브리드·폴백) — 신규 의존성 격리 |
| 3 `onboarding-stage-wiring` | 배선 | 온디맨드 스테이지 등록 + `run/onboarding.requested`(아크 저장) + `submitOnboarding` 액션(금맥 저장) |
| 4 `structure-gold-injection` | 전파 | 구다리 prepare/SYSTEM 조건부 주입(없으면 바이트 불변) + 테스트 |
| 5 `onboarding-quiz-ui` | UI | `OnboardingQuiz.tsx`(인터랙티브·Esther) + 구다리 입구 "먼저 이해하기" 버튼 + 순수로직 lib 분리 |

의존: 0 → (1,2 병렬 가능) → 3 → (4,5 병렬 가능). 하네스는 순차 실행이라 위 순서로.

## 보류 (후속 — 효과 보고 결정)

- 쏙이 금맥을 **훅이(제목/썸네일)**·**셜록(리서치)**에도 주입(target-persona 보류분과 합류).
- 자막 없는 영상 다수일 때 자막취득 방식 고도화(공식 API·OAuth).
- 아크를 시청자용 콘텐츠 자산으로 재활용(영상 인트로 퀴즈 등).
