# ARCHITECTURE.md — 시스템 구조 (Front-end / Back-end / DB)

> 이 프로젝트가 **무엇이 어디에 속하는지** 한눈에 보는 지도.
> CLAUDE.md 옆(루트)에 두어 쉽게 찾도록 함. **구조가 바뀌면(파일 추가/삭제·계층 이동) 이 문서를 갱신**한다 → 맨 아래 [변경 로그](#변경-로그).
> 근거: 실제 파일 트리 + `docs/tech.md` + `PROJECT_STATE.md`. 마지막 갱신: **2026-06-18**.

## 범례
- ✅ 구현됨(코드 존재) · 🔄 진행 중 · ⏳ 예정(Phase 표기)

## 큰 그림 (한 장)

```
┌─────────────────────────────────────────────────────────────┐
│  CHANNELS (얇은 어댑터 · 같은 이벤트 버스+DB state 위)  ⏳       │
│  웹 대시보드 · Slack(인터랙티브 버튼·1순위) · 카톡(알림 전용)    │
└───────────────▲──────────────────────────┬──────────────────┘
   notify(아웃바운드)│        버튼/webhook(인바운드) │ → 표준 이벤트
┌───────────────┴──────────────────────────▼──────────────────┐
│  FRONT-END  (브라우저 · Next.js App Router · TRUS Create)      │
│  src/app/* · globals.css · supabase/client.ts(anon)          │
│  ⏳ 대시보드: 제안→선택, 썸네일 3안, 트리아지 승인, lineage 뷰   │
└───────────────▲─────────────────────────────────────────────┘
                │ Server Actions / Route Handlers (⏳ Phase 3)
┌───────────────┴─────────────────────────────────────────────┐
│  BACK-END (SERVER · durable 파이프라인 · 클라이언트와 분리)     │
│  ✅ src/llm/* (callLLM 어댑터·costGuard·fixtures·pricing·백엔드)│
│  ✅ src/agents/roles.ts (role_id·tool 화이트리스트)            │
│  ✅ src/domain/enums.ts (상태머신·verified enum)              │
│  ✅ src/lib/commentHash.ts (HMAC) · supabase/admin·server.ts  │
│  ✅ scripts/ (db-verify·parity-live)                          │
│  ⏳ Inngest 반장(단계 계약·waitForEvent 게이트) · 에이전트 · ingest│
│  ⏳ notify 어댑터(slack/kakao) · webhook 핸들러               │
└───────────────▲─────────────────────────────────────────────┘
                │ @supabase/supabase-js (service-role / anon+RLS)
┌───────────────┴─────────────────────────────────────────────┐
│  DB  (Supabase Postgres · 3층 L1/L2/L3 · 28 테이블)           │
│  ✅ supabase/migrations/ 01~11 (적용·검증 완료) — 진실의 원천   │
│  ✅ database.types.ts (DB→TS 생성 타입, 계층 다리)            │
└─────────────────────────────────────────────────────────────┘
```

> **런타임 계약** (상세 = `tech.md §8·§18`): 모든 단계 = `DB읽기 → 결정적 prep → callLLM ≤1회 → DB저장(proposed) → 상태전이 → 사람 컨펌(selected)`. AI는 **서버 durable 파이프라인**에서 클라이언트 연결과 분리되어 돈다 → **연결이 끊겨도, 재연결해도 재과금 0**(읽기=$0, 게이트 대기=`waitForEvent`=$0, 끝난 단계=메모이제이션). 트리거 = **버튼**(단계 경계/사람 게이트, 멱등성). 학습 = **처음↔최종 델타 × 성과**(중간 수정은 진단용).

---

## 1. FRONT-END (클라이언트 / 브라우저)

**스택**: Next.js 15 (App Router) · React 19 · Tailwind v4 · TRUS Create 디자인 · (⏳ shadcn/ui)

| 영역 | 위치 | 상태 | 설명 |
|---|---|---|---|
| 앱 셸 | `src/app/layout.tsx` · `page.tsx` | ✅ | 루트 레이아웃·진입 페이지(부트스트랩) |
| 디자인 토큰 | `src/app/globals.css` | ✅ | TRUS Create 3색·격동고딕·Tailwind v4 |
| 브라우저 DB 클라이언트 | `src/lib/supabase/client.ts` | ✅ | **anon 키 + RLS**. `NEXT_PUBLIC_*`만 사용(비밀 노출 금지) |
| PostCSS/Tailwind 설정 | `postcss.config.mjs` · `next.config.mjs` | ✅ | — |
| **대시보드** | `src/app/(dashboard)/*` | ⏳ Phase 3 | 제안→선택+한줄이유 · 썸네일 3안 · **위험기반 트리아지 승인** · lineage·비용 뷰 |
| 프리뷰(설계 시각화) | `docs/*.html` · `blueprint.html` | ✅ | research-flow · project-overview (앱 아님, 정적 문서) |

> **경계 규칙**: 프런트엔드에는 anon 키만. service-role 키·`COMMENT_HASH_SECRET`·LLM 키는 절대 클라이언트 번들 금지(`server-only`로 차단).

---

## 2. BACK-END (서버 / 파이프라인 / 에이전트)

**스택**: Next.js 서버(서버 컴포넌트·액션·Route Handler) · ⏳ Inngest(durable) · Node 런타임

### 2.1 LLM 어댑터 계층 — `src/llm/` ✅ (Phase 0 완료)
`callLLM()` 하나로 호출부는 백엔드를 모른 채 동일 코드 사용. **개발=claude -p($0) / 운영=API** 스위치.

| 파일 | 역할 |
|---|---|
| `callLLM.ts` | 진입점: promptHash → **비용 preflight 예약** → fixtures or 백엔드 → 정산 → 스키마 검증 |
| `costGuard.ts` | 2단 비용캡(SOFT $7 / HARD $10)·원장·병렬 누수 차단 |
| `backends/claudeP.ts` | `claude -p` 드라이버(구독·정액·$0, cwd 격리 호출) |
| `backends/api.ts` | Anthropic API 드라이버(운영) |
| `fixtures.ts` | 리플레이(개발 과금 0) |
| `pricing.ts` | 단가·비용 추정/정산 |
| `promptHash.ts` | 호출 정규화 해시(캐시·fixture 키) |
| `schema.ts` | ajv 출력 스키마 강제 |
| `config.ts` · `types.ts` · `index.ts` | 설정·타입·공개 표면 |

### 2.2 에이전트 / 도메인 ✅ (계약·enum)
| 파일 | 역할 | 상태 |
|---|---|---|
| `src/agents/roles.ts` | **stable role_id 레지스트리** + 역할별 **tool 화이트리스트**(인젝션 방어 §10). +`tone_extractor`(학습), `topic_scout` | ✅ |
| `src/domain/enums.ts` | **상태머신 전이**·verified 판정 enum (DB CHECK와 1:1 동기화) | ✅ |
| `src/agents/tone_extractor/` | 말투 추출 schema+system (corpus→tone_profile, §12) | ✅ |
| `src/agents/topic_scout/` | 촉이 schema+system+**prepare(댓글 키워드 집계, 원문 비전송)**+stage | ✅ |
| `src/agents/hook_maker/` | 훅이(title_thumb): 제목3안+썸네일 layout/copy. prep=주제+tone+과거제목+TRUS제약 | ✅ |
| `src/agents/structurer/` | 구다리(structure): 구성2안+섹션(순서·불안완화·오개념). prep=주제·제목+insight+tone.easy_explain | ✅ |
| `src/agents/{sherlock_lead,fact_verifier,numbers,analogist,critic}/` | 셜록 셀 5에이전트: scope·팩트검증·숫자·비유·반론(각 schema+system) | ✅ |
| `src/agents/scribe/` | 짠펜(script): outline+승인facts+assets+tone→script_segments. 말투·쉬운설명·표절·freshness 가드 | ✅ |

### 2.2g 짠펜 스크립트 단계 — `src/pipeline/scriptCell.ts` ✅ (최종 합류, lineage 저장)
- `runScriptStage`: research_approved→scripting → freshness 게이트(stale→researching rework) → callLLM(scribe) → 표절 가드(`scriptGuards.containment`) → script_segments + lineage(script_segment_facts·_explanation_assets) 저장 + used_in_script 마킹 → script_ready
- `scriptGate.ts`: ready→review→approved | rework(scripting). `scripts/activate-tone.ts`: tone_profile draft→active 승격

### 2.2e 검색 어댑터 — `src/search/` ✅ (셜록 리서치용, callLLM과 동형 스위치)
| 파일 | 역할 |
|---|---|
| `search.ts` | `search()` = 백엔드 선택 + tavily fixture 리플레이($0). `SEARCH_BACKEND`(mock\|tavily)·`SEARCH_FIXTURES` |
| `backends/mock.ts` | 결정적·$0·네트워크 없음(한국공식 도메인 풀). [MOCK] 표식 → 팩트검증가가 could_not_verify |
| `backends/tavily.ts` | Tavily API(`TAVILY_API_KEY`, 무료 1,000/월). 한국공식 includeDomains(§9-⑥) |

### 2.2f 셜록 리서치 셀 — `src/pipeline/researchCell.ts` ✅ (fan-out/join, 제안단계와 다른 골격)
- `runResearchCell`: scope(셜록) → **[팩트검증가 ‖ 셈이 ‖ 유이] Promise.all** → **코드 리콘실(7무결성가드 §9 강제**: isVerifiedValid 강등·인용실재 재확인·독립출처 카운트·math 검산) → **§11 트리아지**(escalated) → 반론(critic) → research_facts+explanation_assets 저장 → research_ready
- `researchGate.ts`: ready→review→approved 트리아지(에스컬레이션 fact만 human_approved). enterResearchReview·approveResearch

### 2.2b 파이프라인 spine — `src/pipeline/` ✅ (§8.1 단계계약, 모든 제안 단계 공유)
| 파일 | 역할 |
|---|---|
| `stageContract.ts` | **`runProposalStage`** = §8.1 골격(DB읽기→prep→callLLM≤1→proposed저장→전이→cost_ledger flush) + **멱등 메모이즈**(재호출·재과금 0). 에이전트는 `prepare`+`toCandidates`만 주입 |
| `gate.ts` | **`selectProposal`** = 사람 게이트(stage_selections 기록 → selected 전이, **AI 0회**, §8.4 학습 입력) |
| `runState.ts` | 전이 가드(`canTransition`) + 낙관적 잠금(`.eq(state, from)`) DB 반영 |
| `stages.ts` | 단계 디스크립터(topic·title_thumb·structure → roleId·fromState·proposedState·selectedState) |
| `context.ts` | 다운스트림 공통 로더: `getSelectedStagePayload`(이전 단계 선택값)·`getToneProfile`(active>draft) |

### 2.2c 반장 오케스트레이션 — `src/inngest/` ✅ (촉이 단계, durable §8.3)
| 파일 | 역할 |
|---|---|
| `client.ts` | Inngest 이벤트버스(`run/<stage>.requested` 스키마) |
| `functions/{topicStage,hookStage,structureStage}.ts` | 제안단계 durable 함수(`step.run` 1회 → `_shared.executeProposalStage`). retries=2 |
| `functions/researchStage.ts` | 셜록 셀 durable 함수(`step.run` → runResearchCell). fan-out/join |
| `functions/scriptStage.ts` | 짠펜 durable 함수(`step.run` → runScriptStage) |
| 전 함수 | `concurrency: [{key:"event.data.runId", limit:1}]` — 중복 이벤트 직렬화(이중과금 차단) |
| `app/api/inngest/route.ts` | `serve(functions[5])` 엔드포인트. 로컬=`inngest:dev`+`dev` |
| fan-out/join·rework·kill switch | 셜록 셀·비용캡 연동 | ⏳ Phase 2 잔여 |

### 2.2d Server Actions — `src/app/actions/` ✅ (버튼=단계경계, §8.2)
| `topicRun.ts` | `startTopicRun`(content+run→이벤트발행)·`selectTopic`(게이트). ⚠️owner 인증 TODO |

### 2.3 서버 보안·DB 접근 ✅
| 파일 | 역할 |
|---|---|
| `src/lib/commentHash.ts` | 댓글 ID **HMAC**(원본 미보관·역추적 차단, governance §2) |
| `src/lib/supabase/admin.ts` | **service-role** 클라이언트(RLS 우회: ingest·파이프라인). `server-only` 강제 |
| `src/lib/supabase/server.ts` | SSR 서버 클라이언트(anon + 세션 쿠키 → RLS) |

### 2.4 운영 스크립트 — `scripts/` ✅
| 파일 | 역할 |
|---|---|
| `db-verify.ts` | service-role로 DB 적용 검증(config·테이블·전이) |
| `parity-live.ts` | claude-p ↔ API 스키마/키 동형 실증 |
| `extract-tone.ts` | 말투 추출(corpus→tone_profile draft + provenance). npm `tone:extract` |
| `run-topic-slice.ts` | 촉이 수직 슬라이스 통합 검증(created→topic_selected, $0). npm `slice:topic` |

### 2.5 ⏳ ingest 레이어 (Phase 1 잔여 · **다음 작업**)
| 대상 | 산출 | 상태 |
|---|---|---|
| 구글독스 8편 파싱 | `corpus_editions` / `corpus_components` | ⏳ NEXT |
| YouTube transcript/comments(HMAC) | L1 raw 테이블 | ⏳ |
| owner 계정 시드 · 콜드스타트 시드 | `profiles` 등 | ⏳ |

### 2.6 ⏳ 채널·알림 레이어 (tech.md §18)
> 채널 = 같은 이벤트 버스 + DB state 위의 **얇은 어댑터**. 파이프라인은 채널을 모름.

| 대상 | 위치(예정) | 설명 |
|---|---|---|
| notify 어댑터 | `src/channels/{web,slack,kakao}.ts` | 사람 게이트 도달 시 채널별 포맷 발송 |
| Slack webhook | `src/app/api/slack/interact/route.ts` | 인터랙티브(버튼) — 서명검증→표준 이벤트. **1순위** |
| Kakao 발송 | `src/channels/kakao.ts` + `kakao_recipients` | **알림 전용**(메모 API). `auto-research-agent` 패턴 재사용 |
| 생성↔전달 분리 | — | 비싼 생성 1회, 전달 실패 시 저장본 재발송(재생성 0) |

---

## 3. DB (Supabase Postgres · 3층 구조)

**스택**: Supabase(전용 프로젝트 `hcuwptjaywkchtwhqymj`) · Postgres · RLS · 28 테이블. **적용·검증 완료.**

| 영역 | 위치 | 상태 | 설명 |
|---|---|---|---|
| 마이그레이션 | `supabase/migrations/01~11` | ✅ | 아래 분해 |
| 일괄 적용 | `supabase/_apply_all.sql` | ✅ | SQL 에디터 수동 적용용 |
| **DB→TS 타입** | `src/lib/supabase/database.types.ts` | ✅ | 28테이블 타입(계층 간 다리) |

### 마이그레이션 분해
| # | 파일 | 내용 |
|---|---|---|
| 01 | extensions_functions | 확장·헬퍼 함수(app_role 등) |
| 02 | config_profiles | `config_registry`(고정값·임계·라우팅) · profiles(역할) |
| 03 | contents_runs | `contents`(단일 척추) · `production_runs` |
| 04 | l1_sources | **L1 raw**: script_imports·transcripts·comments_raw·research_sources 등 |
| 05 | l2_pipeline | **L2 structured**: stage_proposals/selections·research_facts·explanation_assets·script_segments(+lineage FK) |
| 06 | l3_knowledge_corpus | **L3 knowledge**: tone_profile·insights·**corpus_editions/components**·provenance FK |
| 07 | indexes | hot FK 인덱스 |
| 08 | state_transitions | 상태 전이 가드(38전이) |
| 09 | immutability | L1·corpus **UPDATE/DELETE 차단 트리거**(불변 원본) |
| 10 | rls | Row Level Security 정책(역할 기반) |
| 11 | seed_config | config_registry 시드(9행) |

### 3층 데이터 모델
- **L1 raw** (불변): script_imports · transcripts · comments_raw · research_sources · reference_media
- **L2 structured**: contents · production_runs · stage_proposals/selections · research_facts · explanation_assets · script_segments(+lineage) · performance_metrics
- **L3 knowledge**: insights · retrospectives · tone_profile · style_profiles · selection_patterns · corpus_editions/components · cost_ledger · eval_runs

---

## 4. 크로스커팅 (계층 가로지름)

| 영역 | 위치 | 설명 |
|---|---|---|
| 테스트 | `tests/parity.test.ts` · `vitest.config.ts` | dev/prod parity 12+ 테스트 |
| 픽스처 | `fixtures/` | LLM 응답 리플레이(개발 $0). **민감 응답은 gitignore** |
| 학습 코퍼스 원본 | `corpus/README.md`(커밋) · `corpus/raw/`(**gitignore**) | 구글독스 export 스크립트 원본 → ingest 입력. 원본은 커밋 금지 |
| 환경변수 | `.env` · `.env.example` | 키(서버 전용 vs `NEXT_PUBLIC_*`) 분리 |
| 문서 | `docs/`(tech·principles·governance) · `CLAUDE.md` · `PROJECT_STATE.md` · `DESIGN.md` | 우선순위: principles > tech > plan |
| 빌드/타입 | `tsconfig.json` · `next-env.d.ts` · `pnpm-*` | — |

---

## 5. 계층 경계 규칙 (반드시)

1. **키 분리**: service-role·HMAC·LLM 키 = 서버 전용. 프런트는 `NEXT_PUBLIC_` anon만. `server-only`가 빌드 차단.
2. **DB 접근 2종**: 파이프라인/ingest = `admin.ts`(service-role, RLS 우회) / 사용자 대시보드 = `server.ts`·`client.ts`(anon, RLS 적용).
3. **enum 단일 출처**: `src/domain/enums.ts` ↔ DB CHECK 제약 1:1 동기화. 한쪽만 바꾸지 않는다.
4. **role_id 불변**: `roles.ts`의 role_id는 절대 변경 금지(fixture·lineage 키).
5. **불변 원본**: L1·corpus 테이블은 INSERT only(트리거가 UPDATE/DELETE 차단).
6. **LLM 호출 단일 경로**: 모든 LLM 호출은 `callLLM()` 경유(비용 가드·스키마·fixture 우회 금지).
7. **실행 ↔ 연결 분리**: AI는 서버 durable 파이프라인에서만. 클라이언트(웹/Slack) 연결 끊김이 실행·비용에 영향 없음. UI는 커밋된 DB state를 읽음(라이브 스트림 의존 금지).
8. **단계당 AI ≤1회**: 단계 계약(§8.1) 준수 — 결과는 컨펌 전 `proposed` 저장, 컨펌은 상태 전환만. 버튼 트리거는 멱등.
9. **채널 = 어댑터**: 웹/Slack/카톡은 동일 이벤트로 수렴. 파이프라인은 채널 비의존. Slack=인터랙티브, 카톡=알림 전용.

---

## 변경 로그

> 구조 변경 시 여기에 한 줄씩. (날짜 · 계층 · 추가/삭제/이동 · 사유)

- **2026-06-18** · 최초 작성. 현재 = Phase 0 완료 + Phase 1 DB 적용·TS타입 완료. 다음 = ingest(구글독스 8편).
- **2026-06-18** · 런타임 계약 확정 — 단계 계약(§8.1)·버튼 트리거(§8.2)·durable 재연결$0(§8.3)·학습 입도(§8.4)·채널 어댑터(§18). 채널 레이어 추가(Slack 인터랙티브 1순위 / 카톡 알림 전용, `auto-research-agent` 카톡 패턴 참고). 경계 규칙 7~9 추가. (코드는 ⏳ Phase 2~3)
