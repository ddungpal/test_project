# 다음 작업 로드맵 (Roadmap — Next)

> 작성: 2026-06-23. 근거: 코드 실측(에이전트 병렬 분석) + `docs/` 기획 대조.
> 원칙: **5단계 파이프라인의 마지막 빈 칸(썸네일)부터 닫고 → 학습 루프 5/5 완성 → 운영 실연결 → AX 도약 → 배포.**
> 각 Phase = 하네스 phase 하나. step은 "한 step = 한 레이어/모듈"로 쪼갠다. 실제 `phases/<dir>/step*.md`는 해당 Phase **시작 시** 생성한다.

## 현황 한 줄
파이프라인·학습루프·대시보드·인증·LLM·비용캡 전부 ✅. **딱 비어있는 곳 = 썸네일 스타일/학습**(`style_profiles` 앱코드 0회 사용, 훅이 스타일 레퍼런스 無, `ThumbnailCanvas`=정적 mockup). 부차 갭 = YouTube Analytics OAuth stub, AX 미착수.

## 불변 거버넌스 (모든 Phase 공통 준수)
- 댓글 **원문 비전송**·작성자 PII 미저장(HMAC만) · 팩트 7가드 · 비용 SOFT $7 / HARD $10 · max_rework 2.
- 개발 = `claude -p` + fixtures **replay**($0). record는 과금 주의.
- **픽스처 보존**: 에이전트 input 변경은 **조건부**로만(없으면 promptHash 동일) → 기존 parity 깨짐 방지.
- 빈 배열 가능 필드는 schema `required` 금지(api 무재시도 치명).

---

## Phase A — 썸네일 스타일 일치  〔phase dir: `thumbnail-style`〕
**목표**: 생성 썸네일이 김짠부 실제 스타일과 닮게. 사용자 지적 ①(스타일 불일치) 해소.
**의존성**: 없음(즉시 시작). **참조 기획**: tech.md §13.2, principles.md §1.

| step | 이름 | 작업 | AC |
|---|---|---|---|
| 0 | `thumbnail-corpus` | 과거 썸네일 데이터 확보: `contents.thumbnail_url` + 카피/레이아웃 라벨을 corpus로 수집(`scripts/ingest-thumbnails.ts`, 골든 8편 우선). YouTube 수집 or 수동 라벨. | `tsc`0, corpus N편 적재, 멱등 |
| 1 | `style-extractor` | 스타일 추출 에이전트 `src/agents/style_extractor/`(tone_extractor 패턴 재사용): 썸네일 카피/레이아웃 패턴 → `style_profiles`(component=`thumbnail_copy`, patterns jsonb) **1회 추출**. `scripts/extract-style.ts`(dry-run/`--commit`, fixture record). | `tsc`0, vitest, `style_profiles` v1 **draft** 1행, 근거=corpus 인용 |
| 2 | `hook-style-inject` | 훅이 `hook_maker/prepare.ts`가 **active** style_profile(thumbnail)을 system에 **조건부 주입**(있을 때만 — 픽스처 보존). 제목 레퍼런스 + 스타일 레퍼런스 병행. | `tsc`0, **기존 parity 보존**(프로필 없을 때 promptHash 동일), 라이브 프롬프트에 스타일 반영 |
| 3 | `canvas-template` | `ThumbnailCanvas.tsx` → HTML/CSS 템플릿(인물 슬롯 + 카피 자동배치, TRUS 3색·격동고딕2). esther 투입. | `next build`0, 샘플 렌더 |

**사람 게이트**: style_profile draft → **active 승격**(tone_profile과 동일 패턴, `scripts/activate-style.ts`).
**산출**: 훅이가 김짠부 썸네일 스타일을 입은 제안을 낸다.

---

## Phase B — 썸네일/제목 A/B 학습 루프 닫기  〔phase dir: `thumbnail-ab-learning`〕
**목표**: 어떤 썸네일이 좋았는지 학습 → **학습 루프 5/5 완성**(현재 4/5: 촉이·제목·구성·말투). 사용자 지적 ②(A/B 학습 경로 없음) 해소.
**의존성**: Phase A(style_profiles 존재해야 갱신 대상). **참조**: tech.md §13.2, `abVerdict.ts`(기존).

| step | 이름 | 작업 | AC |
|---|---|---|---|
| 0 | `ab-manual-input` | A/B CTR 수동입력 경로(UI 또는 `scripts/ingest-ab.ts`). Studio "테스트 및 비교" %를 `ab_variants`에 멱등 적재(ingest 기존 활용). 변형별 라벨/디자인 차원 메타 저장. | `tsc`0, 멱등 upsert, `judgeComponent` 판정 산출 |
| 1 | `style-learning-writer` | `src/performance/styleLearning.ts`(순수+writer): decisive(≥10%)/marginal(3%) A/B → 이긴 패턴 `weight=ctr/Σctr`로 `style_profiles.patterns` 갱신 + `profile_training_sources` 출처링크. **inconclusive(<3%)는 학습 보류**(잡음 차단). | 순수함수 vitest, 멱등, 보류 경계 검증 |
| 2 | `style-approval-gate` | style_profile 갱신은 **사람 승인 후 active**(insight 승인 패턴 재사용·과적합 방지). 미승인분은 훅이 주입 제외. | `tsc`0, **승인분만** 환류 라이브검증 |

**산출**: A/B 성과 → 이긴 스타일 학습 → 다음 썸네일 제안 반영. 루프 닫힘.

---

## Phase C — 성과 자동수집 실연결  〔phase dir: `youtube-analytics-oauth`〕
**목표**: 회고 루프를 **실데이터**로 자동 가동(현재 mock/manual). **의존성**: 독립(B와 병행 가능).
**참조**: `youtubeAnalytics.ts`(어댑터 존재·OAuth만 stub), governance §5(자격증명 서버 전용).

| step | 이름 | 작업 | AC |
|---|---|---|---|
| 0 | `yt-oauth-token` | `getYoutubeAccessToken` 실구현(refresh token 교환). `pickYtBackend=PERFORMANCE_SOURCE=youtube` 경로 실가동. record/replay fixture. | `tsc`0, 토큰 교환 fixture, 키 서버전용 |
| 1 | `yt-collect-live` | 성과 자동수집 Cron(`performanceCron`)을 실 백엔드로 라이브 검증(도래 윈도우 d1/d7/d14/d30 수집→ingest→`performance/collected`→회고 sweep). | 실수집 1편 검증, 2회차 0fetch 멱등 |

**사용자 액션(1회)**: 채널 OAuth 인증 → `.env` `YT_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`.
**산출**: 발행 → 성과 자동수집 → 회고 → 인사이트 draft 자동.

---

## Phase D — AX 전환 시작: 말투내재화 (#1)  〔phase dir: `ax-tone-internalize`〕
**목표**: RAG→AX 첫 도약. 우선순위 #1 = 말투내재화. **의존성**: C 이후(신호 데이터 축적). **참조**: principles.md §4, tech.md §14.

| step | 이름 | 작업 | AC |
|---|---|---|---|
| 0 | `adoption-signal` | 채택률 신호: `stage_selections`에서 **선택 vs 수정 비율**을 에이전트별 집계 → 대시보드 지표. | `tsc`0, 지표 계산 vitest |
| 1 | `tone-fidelity-eval` | 말투충실도 eval(골든셋 기준, 말투≠사실 분리 — governance). | eval test 통과 |
| 2 | `ax-stage-flag` | 단계별 AX 전환 골격: 정성 트리거("이제 됐다") → 해당 단계 플래그(few-shot 강화 or 모델 전환 준비). | 플래그 존중·롤백 가능 |

**산출**: 한 단계라도 AX 전환 시작(다음 = 선제제안 → 자율성).

---

## Phase E — 배포 게이트 (사용자 액션·하네스 아님·병행 가능)
체크리스트(`docs/operations.md`): owner 비번 설정 · 브라우저 최종검증(`DEV_OWNER_BYPASS=0`) · repo 정리(`test_project` vs `produce-script` 일원화) · Vercel 운영 env(`LLM_BACKEND=api`·`LLM_FIXTURES=off`·캡·바이패스 미설정) · Inngest 프로덕션 · OpenAI/구글 키 rotate.

---

## (후순위) Phase 5 하드닝
knowledge graph(entities/events/relations) · `eval_runs` 확장(말투충실도·제안품질·이해도) · `agent_graduation`(AX 자동전환 임계) · `selection_patterns`(왜 그 선택을 했는가). 전부 tech.md §15에서 Phase 5 명시 연기.

---

## 실행 방식 (각 Phase 공통)
1. Phase 시작 시 이 로드맵의 step 표 → `phases/<dir>/{index.json, step*.md}` 생성(자기완결·AC는 실행커맨드).
2. 백그라운드 하네스 실행(`python3 scripts/run.py <dir>`) — Max 구현→검증→Joy 검수→커밋. (`--window` 분리실행은 불안정 → 백그라운드 권장)
3. 라이브 검증($0=replay) → 사람 게이트(승급) → 다음 Phase.
