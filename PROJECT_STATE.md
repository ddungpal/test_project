# produce script — 진행 상태 (PROJECT_STATE)

> 다음 세션에서 이어서 작업하기 위한 상태 파일.
> 사용자가 `1`을 입력하면 이 파일을 읽어 "다음 진행 작업 + 남은 작업"을 정리해 보여준다.
> 전체 설계 근거는 플랜 파일: `/Users/dongwonchoi/.claude/plans/inherited-mixing-honey.md`

_Last updated: 2026-06-28(낮 — **단독 실행(standalone-stages) phase 완료·main push·마이그레이션 적용·dev 서버 기동**. tip=`ce73c77`·test 614(+28)·typecheck 0·origin push 완료) · 단계: **실사용 검증 + 학습 루프 강화. ▶▶ 다음(재개점) = 단독 실행 라이브 검증(localhost:3000 떠있음·claude-p $0): 메인 '단독 실행' 섹션 → ①셜록 골라 입력칸이 주제+구성만 뜨는지(썸네일 안 물음=핵심 목적) → 실행 시 /runs/[id]로 리서치만 도는지 ②구다리=주제만(제목 선택)으로 구성안 ③짠펜=구성+검증사실(여러줄)로 스크립트 ④단독 run이 메인 목록엔 안 보이는지(숨김). 그다음 기존 구다리 학습 검증(아래). 검증 후 후속: 구다리 3단계(성과기반 목차 랭킹)·썸네일 방법 B(예시30+)·⚠️OpenAI/구글 키 rotate(배포 전 최우선). ((이전 재개점=구다리 학습 검증은 아래 세션로그.))**_

> ## 📜 세션 로그 (2026-06-28 낮) — 단독 실행(standalone-stages) phase (하네스 5 step, main push `ce73c77`, test 586→614)
> **사용자 요구=각 크루를 선형 파이프라인 강제 없이 '단독 도구'처럼 개별 실행(브레인스토밍으로 (1)단독도구형 확정, 짠펜 포함·메인화면 진입). 방법 A=스크래치 런 시딩. 하네스 5 step 전부 1라운드 PASS·AC(typecheck/test/build) exit 0. ff-merge·push·feat 정리·마이그레이션 적용·dev 재기동까지 완료.**
> - **핵심 설계**: DB 트리거가 INSERT를 `state='created'` 강제+전이표만 허용 → 임시 run을 만들어 목표 단계 `enters`까지 `transitionRun`으로 walk하며 사용자 입력만 `stage_proposals`+`stage_selections`(+짠펜은 `research_facts`/`explanation_assets`)에 **LLM 0·$0**로 시드 → 목표 단계 하나만 평소처럼 실행. 기존 실행엔진·게이트·lineage·학습자산 100% 재사용.
> - **의존성 진실 반영**: `STANDALONE_DEPS`(deps.ts)가 진짜 필요한 입력만 — **셜록=주제+구성, 구다리=주제(+제목옵션), 둘 다 썸네일 안 물음**(셜록은 썸네일 미사용). structure shape=`{approach, outline:[{section,goal,why}]}`(structurer/stage.ts 소비형 일치).
> - **step0 `standalone-deps-core`**: 순수 의존성맵+selection shaping(topic/title→{title}, structure→outline). **step1 `standalone-run-flag`**: 마이그레이션 26 `production_runs.is_standalone`(additive·default false) + `listRuns` 필터(메인 목록서 단독 run 숨김, 상세 /runs/[id]는 불변). **✅ 사용자 마이그레이션 적용 완료.** **step2 `standalone-seeder`**: `seed.ts`(seedStandaloneRun)+`standaloneRun.ts`(runStandalone, use server) — walk+시드+이벤트 발사(raw update 0). **step3 `standalone-script-seed`**(money-safety 격리): 짠펜 facts를 `human_approved=true`·`verification_status='unverified'`로 시드 → scriptCell 게이트 **미수정** 통과(verified-CHECK 우회). **step4 `standalone-ui`**(Esther): `StandaloneRunButton.tsx`+메인 page.tsx 섹션, 크루 6탭·STANDALONE_DEPS로 필요한 입력만 동적 렌더.
> - **Joy 규칙 제안 1건**(`phases/standalone-stages/rules-proposals.md`): 단독UI thumbnail 크루 라벨('썸네일')이 CLAUDE.md 크루정의(훅이=썸네일·제목)와 표면 불일치 — 라벨 컨벤션만, 기능 무관. **병합/무시 미결정**(다음 세션 rules review에서).
> - **▶ 다음 = 단독 실행 라이브 검증**(위 재개점 ①~④). dev·inngest 기동됨·preflight ✅.

> ## 📜 세션 로그 (2026-06-27 저녁) — 구다리(구성) 스크립트 학습 활성화 + 픽스 (tip=`4cf96bc`)
> _(상세는 아래 6-27 세션 로그들. 단독실행 검증 후 이어서 구다리 새 구성 런으로 김짠부식 구성·실제 목차 반영 확인.)_

_(2026-06-27 tip)_ 단계: **실사용 검증 + 학습 루프 강화. ▶▶ (이전 재개점) 라이브 검증: ①구다리 새 구성 런 — 김짠부식 구성(고정인사→비유 개념정의→오개념박살→케이스분기→커피쿠폰)·실제 목차 흐름 반영 확인(활성화 전과 비교) ②`/copy-learn` "구성 학습(구다리)" 섹션에 추출된 구조 보이는지 ③구성 생성 시 결과 자동표시(수동 새로고침 불필요) ④확정후 손편집·AI재생성(다운스트림)·새 썸네일 런 주제키워드/호기심갭. 검증 후 후속 후보: 구다리 3단계(성과기반 목차 랭킹)·썸네일 방법 B(예시30+)·OpenAI/구글 키 rotate(배포 전 최우선). ((이전 tip d5c93fd 이하 이력은 아래.))**_

> ## 📜 세션 로그 (2026-06-27 낮 밤5) — 구다리(구성) 스크립트 학습 2 phase + 라이브 활성화 (하네스 2 phase, main push `c7edca3`, test 549→577)
> **구다리가 5크루 중 학습 레버가 가장 약했음(고정 SYSTEM + 입력 참고만) → 김짠부 실제 스크립트를 학습해 목차 짜게 함. 검증된 tone 추출 파이프라인 복제. 각 step 1라운드 PASS·AC exit 0. ff-merge·push.**
> - **`structure-style-learning`**(2 step, 1단계=집계 패턴): (a)안 — `style_profiles`에 `component_type='structure'` 추가(마이그레이션 `20260627120025` ✅사용자 적용). 신규 `structure_extractor` 에이전트(tone_extractor 미러·top-level fold로 style-extract-fold-stray 재발 방지) + `extract-structure-style.ts`(corpus type='script' 본문→구성 패턴 추출→draft) + `activate-structure-style.ts`. 구다리 주입: `loadActiveStructureStyle`+`appendStructureStyle`(썸네일 미러)→`structurer/prepare.ts`. 활성 없으면 promptHash 불변(픽스처 보존).
> - **`structure-outline-fewshot`**(2 step, 2단계=실제 목차 few-shot): 마이그레이션 0 — 같은 structure 프로필 patterns에 `reference_outlines`(각 편 실제 목차·최대 6편·날조 금지) 임베드 → `appendStructureStyle`이 "── 김짠부 실제 목차 예시 ──" 가독 블록으로 렌더(JSON 덤프엔 replacer로 중복 제외). 편별 성과(CTR) 없어 랭킹 없이 대표 N편.
> - **✅ 라이브 활성화 완료**(claude-p $0): `extract-structure-style.ts` dry-run→검수→`--commit`→`activate`. **`style_profiles(structure) v1 active`**(provenance 8편). 추출 품질 **confidence=high** — 김짠부 패턴 정확 포착(고정 인사·비유 개념정의[도시락/졸업장/차용증/주차]·'놉놉 아닙니다' 오개념박살·케이스 분기·'5명 추첨 커피쿠폰 그럼 안녕~' 마무리·banned[타이밍매매/종목추천 구성 없음]) + 실제 목차 6편. ⚠️운영 메모: extract/activate 스크립트는 dotenv 미사용 → `set -a; . ./.env; set +a` 로 SUPABASE 키 주입 후 실행.
> - **`stage-gen-autorefresh`**(1 step, 라이브 검증 중 발견한 버그): 구성(제안 단계) 실행 시 결과가 자동으로 안 뜨고 "이전 단계 완료 후 진행됩니다" stale 섹션이 남던 버그(서버 렌더는 정상·curl 확인). 근본원인=`stageProgress.ts` `isWorking`이 researching/scripting만 true → 제안 단계는 생성 중 run.state가 이전 *_selected 그대로라 isWorking=false → 페이지 LiveRefresh 안 돔(자동갱신이 버튼 클라이언트 submitted 세션에만 의존). 픽스=`runProposalStage`가 생성 중 progress 마커 set/clear(try/finally), `getProgress(state, progressNote?)`로 PROPOSAL_GEN_STATES 한정 마커 존재 시 isWorking=true(종료/검수/research·script 제외해 stale 폴링 방지). StageStepper가 progressNote 전달.
> - **`copy-learn-structure-view`**(2 step, 사용자 요청=구조 학습 확인 UI): `/copy-learn`에 읽기전용 **"구성 학습 (구다리)"** 섹션 — `copyLearnView.getStructureProfiles`(active+최신draft, component_type='structure' 단독조회) → `StructurePanel`이 기존 PatternNode 재귀 렌더러 재사용 + `reference_outlines`만 '[주제]→1.섹션—note' 가독 목록. structure 7키 한글 라벨. 빈상태 안내. 백엔드 무변경.
> - **▶ 다음 = 라이브 검증**: 새 구성 런으로 구다리가 김짠부식 구성·실제 목차 흐름 반영하는지(활성화 전과 비교) + /copy-learn 구조학습 표시 확인 + 구성 자동표시. 후속=3단계(성과 기반 목차 랭킹, perf 데이터 생기면).

> ## 📜 세션 로그 (2026-06-27 새벽 밤4) — "확정 후 수정" 버그 2개 픽스 (하네스 2 phase, main push `d5c93fd`, test 537→549)
> **밤3의 확정후-수정 기능을 라이브 검증하며 발견한 버그 2건을 하네스로 픽스. 각 1 step·1/3 PASS·AC exit 0. 라이브 확인 후 ff-merge·push.**
> - **`regen-confirmed-view-fix`**(1 step): 확정 후 "AI로 다시 생성"하면 제목 섹션이 "이전 단계 완료 후 진행됩니다" placeholder로 사라지던 버그. 근본원인=`runDetail.ts`가 stage selection을 **최신 proposal id 기준으로만** 읽음(`selByProposal.get(prop.id)`) → 재생성이 만든 새 proposal엔 selection 없음 → sv.selection=null → 확정 분기 탈락. 픽스=순수 헬퍼 `selectionResolve.ts` 추출, selection을 **stage 횡단 최신**으로 잡고 payload는 **자신의 proposal** 후보로 해석(edited_payload ?? candidate[chosen_idx] ?? {}). `sv.proposal`은 최신 proposal 유지(재생성 폴링·draft 채움 기준). 보너스로 재생성 draft 채움 UX도 정상화(확정 뷰 유지→완료 감지 도달).
> - **`edit-guard-downstream`**(1 step): 손편집 "저장"이 `⚠ 제목 손편집은 titles_selected에서만 가능(현재 thumbnails_selected)`로 막히던 버그. 근본원인=`gate.ts` editSelectedTitle/editSelectedThumbnails가 `run.state===selectedState`(확정 *직후*)만 허용 → 다음 단계 진행 시 영구 차단. 픽스=가드를 `stageIsConfirmed`(그 stage proposal들 중 selection 존재, **stage 횡단**)로 교체 → 다운스트림 상태에서도 편집 허용, 확정 전이면 throw 유지. 상태전이/마이그레이션 없음.
> - **▶ 다음 = 라이브 검증 계속**: 다운스트림 상태 손편집 저장·AI재생성 동작·새 썸네일 런(주제키워드/호기심갭). (rules.md 신선도: rules-proposals 정리됨·없음.)

> ## 📜 세션 로그 (2026-06-26 밤3) — 확정후 수정 UX 2 + 썸네일 학습포인트 1 (하네스 3 phase, 전부 main push `fffb5c9`, test 511→537)
> **사용자 요구 3건을 하네스로 처리. 전 step Max·Joy(·Esther) 1~2라운드 PASS, AC(typecheck/test/build) exit 0. A→B 스택 ff-merge·push.**
> - **`post-confirm-edit`**(2 step): 확정(selected) 후 제목·썸네일 **손편집**. gate.ts `editSelectedTitle`/`editSelectedThumbnails`(상태 전이 없이 최신 proposal에 새 selection INSERT — selectedState엔 자기전이 없어 transitionRun 금지가 핵심), topicRun `editTitle`/`editThumbnails` 액션. getSelectedStagePayload가 최신 edited_payload 우선이라 자동 반영. UI: 확정 카드에 "수정" 토글. 한계: 제목 수정은 이미 생성된 하위 단계 자동 전파 안 됨(수동 보정).
> - **`thumbnail-topic-curiosity`**(3 step, ★김짠부 피드백): ①메인문구에 **주제 핵심 키워드 그대로**(약자·우회 금지) ②**호기심 갭**(영상이 풀어줄 '왜?'). 생성 SYSTEM(즉효)+재학습 SYSTEM(STYLE_EXTRACTION_SYSTEM·AB_STYLE_SYSTEM, 지속)에 둘 다 박음. 누락 시 **소프트 경고 배지**(`detectTopicMissing` 순수 휴리스틱·표시전용·자동거부 없음·오탐 회피 보수). topicMissing.ts + 테스트.
> - **`post-confirm-regenerate`**(2 step): 손편집 패널에 **"AI로 다시 생성"**. 동기 callLLM은 opus ~185s 타임아웃→**Inngest 비동기+proposalId 폴링** 재사용. runProposalStage `postConfirm` 모드(selectedState에서 상태 전이/낙관잠금 없이 새 proposal만 INSERT·비용 patch는 id로만), inngest 플래그, `regenerateAfterConfirm` 액션. UI는 결과를 **draft만 채우고**(자동저장 금지) 저장은 기존 editTitle/editThumbnails. ⚠️**하네스 크래시 1회**: step1 완료 후 세션이 index.json을 깨진 JSON(닫는 `}` 누락)으로 써서 execute.py가 재읽기로 크래시(exit 1) — 코드·AC는 정상, JSON 수정+step1 수동 커밋으로 복구. (execute.py가 깨진 index에 견고하지 못한 견고성 이슈.)
> - **부수**: 후보 카드 **"A/B 부합 %" 표기 삭제**(`87fdeac`) — winning_score는 강조어 목록 중 카피에 든 비율인데 짧은 썸네일은 100%가 구조적으로 불가능 → % 절대표기가 "13점"처럼 오해 유발. banned·주제키워드 ⚠ 칩은 유지. (백엔드 winning_score 계산은 banned 칩과 공유라 존속, 화면만 제거.)
> - **▶ 다음 = 라이브 검증**(localhost:3000·claude-p $0): 손편집·AI재생성·주제키워드/호기심갭. + 방법 B(예시 30+개 입력). (rules-proposals 2건은 기존 규칙 재강조라 병합 없이 삭제됨.)

_(이전 tip)_ 단계: **실사용 검증 + 학습 루프 강화. tip=`9cf4ae1`(test 511·typecheck 0). ▶▶ 교정 학습 루프 end-to-end 검증됨(런 교정 3건→재학습→썸네일 v4 draft에 교정 반영 확인). 다음=v4 활성화→새 런 효과 확인 + "다시 생성($0)" 3개 정상 확인. (이하 7 phase 이력은 아래 세션로그.) 이번 세션 처리(시간순): ①`thumbnail-winning-refs`(방법 A — ab_variants 우승 썸네일 top8 few-shot 주입) ②`copy-learn-add-videos`(학습영상 추가 + 회고 sweep production_run 가드=위험완화) ③`copy-learn-edit-title`(영상 이름 수정) ④`copy-learn-manage-videos`(삭제+업로드일 — cascade를 contentLifecycle.ts로 추출·재사용) ⑤어투 직접수정(존댓말 명령 강제·반말 banned — THUMBNAIL_MAKER_SYSTEM+재학습 프롬프트) ⑥`fixture-record-after-validate`(callLLM record 버그: 검증 전 저장→불량 박제→영구 실패. saveFixture를 검증 후로) ⑦`style-extract-fold-stray`(claude-p가 banned/skeletons를 patterns 밖 최상위에 둬 결정적 실패 → fold로 흡수) ⑧`thumbnail-correction-learning`(교정 학습 모듈: 이상카피 입력→생성과 차이분석→합성 A/B로 재학습 합류. 마이그레이션 20260626120024 ✅적용됨). ▶▶ 다음 = 라이브 검증(교정 학습 써보기·재학습으로 어투/few-shot 효과 확인) + 방법 B(예시 30+개 입력→재학습→활성화). 상세=아래 세션로그.**_

> ⚠️ 라이브 dev 운영 메모(이번 세션 학습):
> - **dev 기동**: `pnpm dev`/`pnpm inngest:dev` 래퍼는 pnpm 빌드스크립트 승인 게이트(sharp/protobufjs)에서 막힘 → 바이너리 직접 사용: `./node_modules/.bin/next dev -p 3000` + `npx inngest-cli dev -u http://localhost:3000/api/inngest`.
> - **포트 고정 필수**: 3000이 차면 next가 조용히 3001로 밀리고 Inngest가 죽은 포트를 때려 모든 런이 'Unable to reach SDK URL'로 침묵 실패. `next dev -p 3000`로 고정·`npm run preflight`로 점검(아래 dev-pipeline-port-guard phase).
> - **`next build`는 떠 있는 dev `.next`를 깬다** → 검증 빌드는 dev stop → build → restart 순서로. 깨지면 dev 재시작이면 복구.
> - **$0 유지**: `.env` `LLM_BACKEND=claude-p` + 새 런 시 `SEARCH_BACKEND=mock`(tavily 과금 회피). 실리서치 보려면 `tavily`.
> - 다른 프로젝트(auto-research-agent)가 PM2로 3000 선점할 수 있음 → `npx pm2@7.0.1 stop ara-web ara-worker`로 비움.

## 📜 세션 로그 (2026-06-26 오후~저녁) — copy-learn 실사용 검증 중 7 phase + 어투 수정 (전부 main push, tip `d8fe754`)
**copy-learn(문구 학습)을 실사용하며 발견한 필요·버그를 하네스 phase로 연속 처리. 각 phase 전부 1라운드 PASS·AC 그린. test 450→503. 하네스 운영 정착: stray fixture 격리(/tmp)→복원(roleId별), 머지마다 dev clean 재시작(rm .next).**
- **`thumbnail-winning-refs`**(방법 A, `7bb9915`): 아래 "방법 A 완료" 섹션 참조.
- **`copy-learn-add-videos`**(`933bcfd`): 새 학습영상 추가(`createLearningVideo`·stub source='produced'·멱등) + **위험완화**: `eligibleForRetrospective`에 `withRun` 추가 → 회고 sweep이 production_run 있는 영상만(학습 전용 영상 자동회고 차단, 기존 9개도 보호).
- **`copy-learn-edit-title`**(`cae9954`): `updateContentTitle` + VideoCard 인라인 이름 편집("(제목 없음)" 행 수정 가능).
- **`copy-learn-manage-videos`**(`81d7296`): 삭제(`deleteLearningVideo`)+업로드일(`updateContentUploadDate`). ★검증된 cascade를 `src/app/actions/contentLifecycle.ts`(비-'use server')로 **추출**해 deleteRun과 공유(복붙 금지·pts/insights CHECK 함정 단일출처). source='produced' 가드 유지.
- **어투 직접수정**(`39029ad`): 썸네일이 '믿지 마라' 반말 드리프트 → **존댓말 명령 강제**('~마세요/~보세요')·반말 명령 금지. `THUMBNAIL_MAKER_SYSTEM`(생성) + `AB_STYLE_SYSTEM`·`TITLE_STYLE_SYSTEM`(재학습→banned 학습). 공통 적용.
- **`fixture-record-after-validate`**(`e28d3e3`): ★재학습 결정적 실패 근본①. `callLLM.ts`가 스키마 검증 *전*에 `saveFixture` → claude-p 불량출력이 픽스처로 박제 → record가 그걸 리플레이해 영구 실패(claude-p 2회 재시도도 무력). → saveFixture를 `parseAndValidate` 성공 후로 이동(유효분만 캐시). 오염 픽스처는 수동 삭제로 임시해소했었음.
- **`style-extract-fold-stray`**(`bcdfe8a`): ★재학습 결정적 실패 근본②. claude-p가 `banned/confidence/tentative_notes/skeletons`를 schema가 요구하는 `patterns` 안이 아니라 **최상위에 일관 출력**(additionalProperties 위반). → 스키마가 top-level도 허용 + `foldStrayPatternFields`로 patterns 안으로 접음(다운스트림 nested 불변). 제목 재학습이 라이브 2회 모두 이 구조로 실패한 사건.
- **`thumbnail-correction-learning`**(4 step, `7778c04`+`d8fe754`): **교정 학습 모듈**. 김짠부가 '이상 카피' 입력→AI '생성 카피'와 **차이 분석**(`correction_diff` LLM·표시용)→**합성 A/B**(이상=winner/생성=loser·`learn_mode="correction"`·decisive 1.0·CTR무관, `buildAbStyleInput` single 경로 미러)로 기존 재학습에 **합류**→draft→활성화. 전용 테이블 `thumbnail_corrections`(FK 없음·`learned_at` 멱등, provenance/CHECK 미접촉). UI=/copy-learn 교정 섹션. **마이그레이션 `20260626120024` ✅사용자 적용 완료**(테이블 0건 확인). graceful degrade: 테이블 부재 시 빈목록(`d8fe754`).
- **`correction-capture-in-run`**(2 step, `4dc7b1c`): ★교정 캡처 지점 이동(사용자 의도 반영). 직전 교정모듈이 /copy-learn 수동입력이었으나 → **런 화면 썸네일 단계(ThumbnailStudio) 각 A/B/C 후보 카드에 교정 패널**(생성=그 후보 실제 카피 자동추출, 이상=입력 → saveCorrection+analyzeCorrectionDiff 인라인 표시). /copy-learn 교정 입력폼 제거→읽기전용 검토 목록(diff·learned 상태). 교정 전용 transition(재생성/확정과 분리). 백엔드 무변경.
- **✅ 교정 학습 루프 라이브 검증 완료**: 런에서 교정 3건(연금저축펀드 주제) → `/copy-learn` "재학습 실행" → **썸네일 v4 draft 생성**. v4 patterns가 교정을 정확히 반영: banned에 거부한 생성카피('장기보유 함정'·'오를 때만 2배가 아니에요'·'개념부터 완전정리'=loser), hook_patterns에 이상카피 방향('마이너스 복리의 진실'·'1% 오르면 2% 오르는 투자?'=호기심갭 winner), confidence tentative→high. 교정 3/3 learned_at 스탬프. **fold·픽스처 버그 수정이 효과 봄(재학습 정상 통과).** → 남음=v4 활성화→새 런 반영 확인.
- **교정 누적 구조 확인**: `loadCorrectionResults`가 교정 전부(학습됨+미학습) 매 재학습에 사용(ab_variants 누적과 동일). `learned_at`은 트리거 게이트만(미학습>0 OR ab증가→적격, 학습 후 스탬프=중복 트리거 방지). **교정 삭제 UI 없음**(INSERT만) — 실수 교정도 계속 영향, 필요 시 후속 phase(학습영상 삭제 패턴 재사용).
- **로컬젠 버그수정**(`9cf4ae1`): "다시 생성($0)"이 A/B/C 아닌 A/B만 나오던 버그. 원인=`localCandidates` 가드가 `filled.length===0`일 때만 LLM 폴백 → 스켈레톤 부족·banned 필터로 1~2개만 나오면 부분세트 그대로 저장(v4 banned 늘며 스켈레톤 4중 2 탈락). 수정=`< 3 → LLM 폴백`(썸네일·제목 둘 다, schema가 3개 요구). test 511. **후속 여지: 재학습이 banned 피하는 스켈레톤 ≥3개 내도록 프롬프트 보강하면 $0 로컬 유지**(현재는 못 채우면 LLM 폴백=dev $0·운영 비용).
- **▶ 다음(라이브 검증)**: ①**v4 활성화→새 썸네일 런**으로 교정 반영(호기심갭·질문형)·존댓말·우승작 few-shot 효과 종합 확인 ②"다시 생성($0)" 3개 정상 확인 ③방법 B(예시 30+개 copy-learn 입력→재학습→활성화) ④(후속 검토) 교정 삭제 UI·스켈레톤 ≥3 보강. (학습/생성 claude-p $0.)

## ▶▶▶ 최우선 — 썸네일 메인문구 개선 (✅방법 A 코드완료·main push / B·라이브검증 남음)
**목표: 썸네일 메인문구 후킹을 "조회수 잘나온 레퍼런스 + 김짠부 스타일 결합"으로 강화.** (사용자가 가장 중요시.)

### ✅ 방법 A 완료 (2026-06-26, phase `thumbnail-winning-refs` → main `7bb9915` push됨)
하네스 2 step·각 1라운드 PASS·AC(typecheck0·test450·build0). **근본원인 해소**: 생성기가 김짠부 실제 우승 썸네일을 0개 보던 문제를 `ab_variants`(thumbnail·is_winner) 성과순 top 8 few-shot 주입으로 해결.
- step0 `winning-refs-core`: `src/agents/thumbnail_maker/winningRefs.ts` 신규 — 순수 `rankWinningThumbnails`(score=점유율ctr_pct × 영상CTR × vconf, null인자×1, 동률 views내림차순) + `loadWinningThumbnailRefs`(ab_variants+perf d1·overall+contents 조인, 우승작0건→`[]`). `abVerdict.ts` `viewsConfidence` export만(재구현금지·단일출처). `tests/winningRefs.test.ts` 9케이스.
- step1 `winning-refs-wiring`: `prepare.ts` `reference_winning_thumbnails?` 조건부 주입(style_profile 패턴 미러·length>0일 때만) + `styleProfile.ts` `appendWinningThumbnailRefs`(refs 없으면 system 바이트불변) + SYSTEM "실제 고성과 썸네일 — 이 스타일로 재창작(베끼지 마라·anti-dup 유지)". 합성순서 learned→style→winning.
- **하위호환 계약 검증**: 오프라인엔 우승데이터 없음 → 새 필드 부재 → promptHash 불변 → 기존 픽스처·eval 전부 보존(핵심 안전망). stray fixture 4개 원복(untracked), 하네스 git add -A에 섞인 `.claude/scheduled_tasks.lock` gitignore+추적해제.

### ▶ A의 남은 것 = 라이브 검증 (효과는 데이터 있어야 보임)
**A는 배선만** — 효과는 `ab_variants`에 우승 썸네일이 있어야 보인다(=방법 B와 합류점). dev 재기동(`./node_modules/.bin/next dev -p 3000`+inngest·`npm run preflight`) → 새 썸네일 런 → 메인문구가 우승작 닮게 강해지는지 확인. (claude-p $0. 우승작 채워지면 promptHash 변경→픽스처 record 재생성 정상.)

### (참고·원안) 근본 진단·방법 설계
**근본 진단(왜 약한가)**: `thumbnail_maker/prepare.ts:34`가 `reference_thumbnail_copies`를 `corpus_components`(type='thumbnail_copy', is_final)에서 읽는데 **라이브 0건** → 생성기가 **김짠부 실제 썸네일을 하나도 안 봄.** 추상 패턴 v2(tentative·N=7 손실압축) + 외부 고조회 *제목*(yt) + 말투만 봄. 정작 우승 썸네일 24개("월 200 재테크 로드맵 / 이 순서를 모르면 3년을 버립니다", "100만 원 이상 있다면 필수 시청" 등 점유율·CTR·조회수 포함)는 **`ab_variants`(copy-learn 입력)에 있으나 학습 때만 쓰고 생성엔 미노출.** → 베낄 구체 예시 없어 추상 규칙만으로 추론 → 약하고 안 김짠부다움. **추상 규칙 << few-shot 실제 예시.**

**방법 A (가장 큰 레버·즉효, phase로 구현)**: `reference_thumbnail_copies`를 (빈) corpus_components 대신 **`ab_variants` 우승 썸네일에서 성과순 랭킹해 상위 6~8개**를 few-shot으로 주입.
- 랭킹 = 점유율 × CTR × **조회수 신뢰도(vconf, `ctrWeightedScore`/`viewsConfidence` 재사용)** — = "조회수 잘나온 레퍼런스".
- `thumbnail_maker/prepare.ts` reference 쿼리를 ab_variants(component_type=thumbnail, is_winner) + performance_metrics(ctr·views) 조인·랭킹으로 교체(또는 신규 헬퍼). 실제 메인·박스 문구를 텍스트로.
- `thumbnail_maker/schema.ts` SYSTEM에 "아래는 김짠부 실제 고성과 썸네일 — 이 스타일로 써라(베끼지 말고 재창작·기존 anti-dup 가드 유지)" 지시 추가.
- 주의: reference가 채워지면 promptHash 변경 → 픽스처 record 재생성($0, eval은 출력형태만). 비면 기존 동작.

**방법 B (보완·사용자 데이터)**: 사용자가 **썸네일 예시 30+개 보유**(A·B 함께 가능 수치). copy-learn에 입력→재학습→활성화 → confidence tentative→high(현 v2가 "N<10이라 tentative"였음, 30이면 임계 넘김) + A의 예시 풀도 30개로 커짐. **단 B 강도는 형태 의존**: 영상별 A/B(변형 2~3+점유율)면 강한 신호, 단일(영상당 1개)이면 single mode라 약함 → 가능하면 A/B 형태로 입력 권장.

**진행 순서(내일)**: ① 방법 A를 하네스 phase로 설계·생성·실행(run.py) → ② 사용자가 30개 copy-learn 입력→재학습(B)→활성화 → ③ 새 런으로 썸네일 메인이 김짠부답게(단정·목표선언·고성과 예시 닮게) 나오는지 확인. (학습/생성 claude-p $0.)
**참고 파일**: `src/agents/thumbnail_maker/prepare.ts`(reference 쿼리)·`schema.ts`(SYSTEM·이미 박스12/메인20 반영됨)·`src/performance/abVerdict.ts`(`ctrWeightedScore`/`viewsConfidence` 랭킹 재사용)·`src/performance/abLearnSource.ts`(ab_variants+performance 조인 패턴)·`src/agents/shared/styleProfile.ts`(loadActiveThumbnailStyle).
**dev 재기동(내일)**: `./node_modules/.bin/next dev -p 3000` + `npx inngest-cli dev -u http://localhost:3000/api/inngest`, `npm run preflight`. (오늘 띄운 서버는 세션 종료로 내려갈 수 있음.)

## ▶ 다음 작업 (NEXT — 2026-06-25 저녁 세션종료 시점)
- **▶▶ 실사용 검증 (진행 중·사용자가 가장 중요시)**: dev `http://localhost:3000`에서 계속.
  - **(A) `/copy-learn` 학습 루프 닫기 — 가장 임박**: ① 지금 **제목 v1 초안만 있고 미활성** → 검토 후 "최신 초안 활성화"(제목) 눌러야 hook_maker에 반영. 썸네일도 v2 초안 활성화 시 적용. ② 영상별 실데이터(썸네일 메인2·박스2 / 제목 체크박스 A/B/C or 단일 / **CTR 24h** / 점유율) 입력→저장→**재학습**(진행표시 뜸·끝나면 자동갱신·동기 await)→**상세 보기**로 초안 검토→**활성화**(썸네일·제목 각각) → **새 런**으로 문구가 김짠부 기준에 가까워지는지 확인. 학습 LLM=claude-p($0).
  - **(B) 5단계 흐름 품질·UX**: 주제→제목→썸네일→구성→리서치→대본(6단계 스테퍼)·이유 입력 다시생성 직접 써보며 보완. 보고서 `docs/progress-report.html` 단계별 `verify%`/`status` 갱신.
  - **(잔여·소) untracked replay fixtures 3개** 처리 결정: `fixtures/parity/style_extractor/*.json`(2, 재학습 검증 중 record)·`fixtures/parity/topic_scout/*.json`(1) — 그냥 둠(무해·로컬 $0) or `git clean`. (커밋엔 미포함.)
  - dev 재기동: `./node_modules/.bin/next dev -p 3000` + inngest, `npm run preflight`. 브랜치 전환·다수 변경 후 dev 500나면 `.next` 지우고 재시작.
- **Phase E — 배포 게이트 잔여(전부 사용자 액션)**: ①**OpenAI/구글 키 rotate**(채팅 노출분 미폐기·최우선) ②owner 비번 변경 ③브라우저 최종검증(`DEV_OWNER_BYPASS=0`) ④Vercel 운영 env(`LLM_BACKEND=api`·`LLM_FIXTURES=off`·캡·바이패스 미설정) ⑤Inngest 프로덕션. (**브랜치 정리·DB 마이그레이션 적용 ✅ 완료**.)
- **(병렬·사람게이트) Phase C 실연결**: 채널 OAuth → `.env` `YT_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` → `PERFORMANCE_SOURCE=youtube`+`PERFORMANCE_FIXTURES=record` 1회 → 이후 replay($0). **코드 변경 없이 켜짐.**
- **(병렬·사람게이트) Phase D 실전환**: 김짠부가 한 단계 "이제 됐다" + 신호데이터(채택률·eval) 축적 → `AX_STAGES=<stage>`로 그 단계 AX 전환(롤백 가능).
- **(병렬·사람게이트) A/B 학습 루프 가동**: ①C 효과 적용=claude-p로 `learn-ab-style` 재실행→draft→`activate-style` ②B 효과=새 Test&Compare→`ab-results.json`→`ingest-ab`→`style/relearn.requested` 트리거→draft 검수→activate. (코드는 ✅, 이후 사람 승인 루프.)
- **▶ (추후 진행·사용자 방향) 썸네일 이미지(visual) 추가**: 현재 학습은 **카피(문구)만** — visual 차원(인물·색·레이아웃·장치)은 입력 공란이라 학습 불가(2026-06-25 재학습 tentative_notes에 명시). 사용자 계획=나중에 **실제 썸네일 이미지를 추가하는 방향**으로 시작. 선결: 김짠부 과거 썸네일 데이터(`contents.thumbnail_url` 수집/라벨) + 이미지 입력 경로(업로드/URL). 설계 후보=캔버스→HTML/CSS 템플릿(인물 슬롯+카피 자동배치) / 이미지생성(한글·인물일관성 약점→후순위). 상세 설계메모=아래 "썸네일 재개점 설계 메모".
- **(deferred·코드) 하네스 top-index 자동등록**: 새 phase가 `phases/index.json`에 미등록(watch는 mtime기반이라 무방, 저우선).

## 📜 세션 로그 (2026-06-26 밤2) — 썸네일 문구 품질(박스·메인) + 삭제 2차버그 + 제목 점검
**실사용 검증 중 썸네일 문구 품질 직접 수정(소규모·하네스 아님)·각각 push. typecheck/441 그린.**
- **deleteRun 2차 삭제버그 수정**(`78f9b9d`): 회고 있는 편 삭제 시 retrospectives 캐스케이드→insights.source_retrospective_id SET NULL→A3 CHECK(insights_retro_consistent) 충돌. deleteRun이 삭제 전 `cleanupRetrospectives`(검증된 detach 정책) 호출로 해소. 이제 deleteRun이 pts+insights 두 CHECK 모두 선제 방어.
- **썸네일 박스 품질**(`f4d98b6`): 박스가 "곱버스/이유3/왕초보"처럼 잘리던 원인=schema `thumbnail_boxes` maxLength=6 + SYSTEM "6자·쪼개라"가 김짠부 실제 우승 박스(7~9자 라벨구)보다 빡셈. → maxLength **6→12** + SYSTEM 박스 가이드를 "온전한 라벨구(방법·대상·시점·혜택·추천·총정리)·쪼개기 금지"로 + eval.test 계약 ≤6→≤12. **사용자 확인=박스 좋아짐.**
- **썸네일 메인 강화**(`ca46dcd`): 메인이 약한 원인 2개=①maxLength=14가 우승 메인(15~22자 단정선언)보다 빡세 절단 ②base 톤 중립이라 묘사·교육조로 흐름. → maxLength **14→20** + SYSTEM "단정·명령·목표선언으로 세게(묘사·교육조·의문나열 금지)·emphasis_words/main_copy_notes 준수" + eval.test ≤14→≤20. **사용자=메인 아직 약함·안 김짠부다움 → 위 '내일 최우선 방법 A·B'로 이어짐(근본=레퍼런스 0건).**
- **제목(hook_maker) 점검**: title은 maxLength 없음(`{minLength:1}`만) → 절단 제약버그 없음. 학습 스타일은 active일 때 appendTitleStyle로 주입됨(현 title v1 active). **사용자=제목 OK.** 제목 품질 레버는 제약 아니라 A/B 제목 데이터(현 single mode·tentative).

## 📜 세션 로그 (2026-06-26) — `copy-local-gen`(하이브리드 $0 생성) + `deleteRun` 삭제버그 수정 (main ff-머지)
**① 편 삭제 버그 수정(`78f9b9d`, push 완료)**: `/copy-learn` 재학습 후 편 삭제 시 `삭제 실패: profile_training_sources ... pts_has_source` 에러. 원인=contents 삭제→ab_variants/performance_metrics 캐스케이드 삭제→pts.ab_variant_id `ON DELETE SET NULL`→유일출처였으면 num_nonnulls=0→`pts_has_source`(출처≥1) CHECK 위반→삭제 트랜잭션 롤백. 수정=`deleteRun`이 삭제 전 `detachOrphanTrainingSources`로 유일출처 pts만 선삭제(다중출처는 DB SET NULL 보존). cleanupRetrospectives detach 패턴과 동일 클래스. 읽기검증=차단 콘텐츠 2개·유일출처 pts 8건 정확히 정리 대상. ⚠️**잠재 2차 버그(미수정)**: 회고 있는 콘텐츠 삭제 시 retrospectives 캐스케이드→insights.source_retrospective_id SET NULL→A3 CHECK(`insights_retro_consistent`) 같은 클래스로 깨짐. 현재 테스트 콘텐츠엔 회고 없어 미발현. 같은 detach로 막을 수 있음(원하면 후속).
**② `copy-local-gen` phase(하네스 4 step·전부 PASS, main tip `8938e74`, vitest 369→441·typecheck/build 0)**: 사용자 질문에서 출발 — "재학습만 API, 생성/재생성은 학습된 것으로 $0 가능?". 검토 결론=patterns는 채점규칙(rubric)이지 생성기가 아님 → 학습시 '스켈레톤'을 같이 컴파일 + 로컬 생성기 추가하면 가능. 하이브리드로 구현:
- **step0 `skeleton-engine`**(`566c6ec`): 순수 `fillTitle/ThumbnailSkeletons`(슬롯 `{number}/{target}/{keyword}/{topic}` 치환·banned 필터·offset 변주·빈슬롯 누출 차단). `src/agents/shared/localCopyGen.ts`. 테스트.
- **step1 `learn-emit-skeletons`**(`38ed586`): 재학습 LLM 출력에 `skeletons` 옵셔널 추가(추가 호출 0·기존 재학습 콜 편승)→안전수령·슬롯 화이트리스트→`patterns.skeletons` 저장. 하위호환(없으면 키 생략).
- **step2 `local-gen-wiring`**(`ba0d74e`): `ProposalStageSpec.localCandidates` 옵셔널 훅 + `runProposalStage`(stageContract.ts) 로컬 단락 — 활성 스켈레톤+런 주제로 후보 생성 시 **callLLM 스킵($0)**, null/`mode=llm`이면 기존 경로 바이트 동일. `COPY_GEN_MODE`(기본 hybrid). 제목·썸네일만(topic/structure/research/script 불변). `buildLocalGenContext`로 주제→슬롯 추출.
- **step3 `local-gen-ui`**(`da1e02d`): `다시 생성($0)` vs `LLM 새로 써줘`(forceLlm) 분기 + 출처 배지. TRUS 3색.
- **실효과는 실데이터 후**: 가중 로직처럼 배선만 — `/copy-learn` 재학습→스켈레톤 생성→활성화→새 런에서 로컬 $0 생성 + 문구 품질(정형화) 확인 필요. 트레이드오프=돈 아니라 다양성, LLM 폴백으로 완화.
- **→ 남음**: ①push(현재 로컬 main만) ②feat-copy-local-gen·feat-copy-views-weight 브랜치 삭제 ③실데이터 라이브 검증 ④(후속) deleteRun 2차 버그(회고-insights A3) 수정.

## 📜 세션 로그 (2026-06-25 밤) — `copy-views-weight` phase: 24h 조회수 신뢰도 가중 (하네스, main ff-머지)
**문제(사용자·과거 Claude 둘 다 지적): `/copy-learn` 학습 점수=A/B결정력×CTR크기 가 reach(규모)를 몰라, 24h 조회수 적은 영상의 우연한 고CTR이 검증된 히트만큼 스타일을 끌어당김("조회수 높아지면 썸네일 평가 불명확"). → 24h 조회수를 '신뢰도 가중'으로 추가. 하네스(Max·Joy·Esther) 3 step, 각 1라운드 PASS, AC(typecheck/test/build) 전부 exit 0. vitest 350→369(+19, 약화·삭제 없이 추가). `feat-copy-views-weight`→main ff(tip `a995cf4`). 마이그레이션 0(`performance_metrics.views` 기존 컬럼 재사용).**
- **step0 `views-score-core`**(`5fd57cc`): `ctrWeightedScore`에 순수 헬퍼 `viewsConfidence = floor+(1−floor)·log1p(min(views,ref))/log1p(ref)` ∈[floor,1] 곱. **상대 기준**=코퍼스 reference(절대 cap 아님). views/ref 없거나 ref≤0/NaN/음수 → **vconf=1.0=기존 바이트 동일**(하위호환). views=0→floor, inconclusive는 vconf 무관 0. `config.ab.viewsConfFloor`(`AB_VIEWS_CONF_FLOOR` 기본 0.5)+`.env.example`. 테스트 9(하위호환·경계·단조). **순수 유지**=reference는 호출자가 주입.
- **step1 `views-data-wiring`**(`336c479`): `CopyAbInput.views24h`→`mapCtr24hToMetricRow`가 performance_metrics d1 overall 행에 `views` 멱등 저장→`loadAbResultsFromDb`가 views select·`video_views24h` 채움(ab·single 둘 다)→`buildAbStyleInput` 진입부에서 `viewsReference=코퍼스 max(views)` **1회** 산출→`ctrWeightedScore` 2곳 주입. `copyLearnView.CopyLearnVideo.views24h`(프리필). 하위호환 회귀 가드(views 없으면 weight 불변)·promptHash 무영향(forward 픽스처 보존). 테스트 5.
- **step2 `views-input-ui`**(`47a31e6`): `/copy-learn` 폼 영상별 **24h 조회수 입력칸**(ctr24h 패턴 미러·TRUS 3색·정수)+접힌 헤더에 `toLocaleString()` 천단위 노출. 파싱 순수모듈 분리(`src/components/copyViewsParse.ts`: 빈칸·음수·비숫자→null, "0"→0 — vitest alias·서버액션 의존 회피). 새 게이지 없음(상대 기준이라 단일 절대표시 오해 방지). 테스트 6.
- **실효과는 실데이터 후**: 가중 로직만 변경 — 실제 학습 변화는 `/copy-learn`에서 24h 조회수 포함 실데이터 입력→재학습→활성화→새 런으로 확인(기존 copy-learn 검증 루프 동일).
- **✅ 라이브 검증(2026-06-25 밤)**: 실데이터 10영상(thumbnail A/B + title single) 입력·재학습. 임시 진단스크립트로 DB 확인 — views 10영상 전부 저장(21,550~275,969)·`loadAbResultsFromDb`가 `viewsReference(max)=275,969` 산출·weight에 vconf 반영(tentative_notes가 weight 1.61/1.57/~0.95 직접 인용). **재학습 결과 confidence="tentative"는 조회수 버그가 아니라 LLM의 소표본 판정**(notes: "N<10·단일채널·losers 동일카피·equivalent_signals 비어"). 현 10영상이 전부 2만~28만뷰라 vconf 0.90~1.0 좁은 구간(차등 약함=정상) — 저조회 우연 고CTR이 섞일 때 vconf가 크게 벌어지는 게 설계 목적. **조회수↔visual은 별개**: 학습은 카피만, visual(이미지)은 입력 공란이라 미학습(위 추후 진행 항목).
- **→ 남음**: ①origin push(현재 로컬 main만) ②feat-copy-views-weight 브랜치 삭제(보존됨) ③rules-proposals 5건+rules.md 신선도(15일) 정리 ④실데이터 라이브 검증.

## 📜 세션 로그 (2026-06-25 저녁) — 실사용 검증 중 `/copy-learn` UI 3건 수정 (main 푸시)
**실사용 검증 시작. `/copy-learn`에서 발견한 UX 이슈를 직접 수정(하네스 아님·소규모)·각각 커밋·푸시. typecheck/350 그린 유지.**
- **winner 라디오 제거**(`52bbc80`): 점유율(%)만 있으면 winner는 서버가 `judgeComponent`로 재계산하므로 입력이 중복·미배선(저장에 미전송)이었음 → 라디오 삭제, **점유율 최고 변형을 자동 강조(★ 최고 점유율)**.
- **재학습 진행표시·자동 새로고침**(`aa6e5f1`): 원인=`requestCopyRelearn`이 Inngest 이벤트만 쏘고 즉시 반환→pending이 학습 전 풀려 진행표시 없음→중복클릭. **수정=액션을 `styleRelearnSweep` 동기 await로** → pending이 학습 끝까지 유지(스피너+"진행중"), 완료 시 `router.refresh` 자동갱신, no-op(새 데이터 없음) 메시지 구분. `// ponytail` 주석=운영 LLM 길어 타임아웃 시 Inngest 비동기+폴링으로 회귀.
- **스타일 초안 패턴 상세 펼치기**(`aa6e5f1`): draft 카드에 "상세 보기" 토글 + `patterns`(jsonb) 재귀 렌더러(copy/banned/visual/confidence/tentative_notes 한글 라벨). 활성화 전 초안 내용 검토 가능. `copyLearnView`가 patterns 원본도 실어 보냄.
- **라이브 재학습 확인**: 재학습 동기 실행이 실제로 돌아 썸네일 v2·제목 v1 draft 생성됨(제목 첫 학습). 단 **아직 미활성**.


**유저테스트로 발견한 이슈를 하네스(Max·Joy·Esther)로 4 phase 처리. 각 1라운드 PASS, AC(typecheck/test/build) 그린. vitest 304→350. 선형 스택→main ff-merge·feat 4개 정리·push.**
- **`usertest-fixes-1`** ✅(3 step): ① 썸네일 제안 에러=`stage_proposals_stage_check`에 'thumbnail' 누락(마이그레이션 23 DROP/ADD, **사용자 적용 완료**) ② 제목 '다시 생성'에 **이유 입력**(공용 RegenerateButton 주제·제목·구성, reason 미전달 시 promptHash 불변) ③ 스테퍼 **5→6단계**(주제→제목→썸네일→구성→리서치→대본, STATE_MAP 전수 재인덱싱).
- **`title-external-refs`** ✅(1 step): 훅이(제목)가 선택주제로 **고조회 유튜브 제목**을 레퍼런스로(촉이 `gatherExternalSignals` 재사용)·조회수순 top5·낚시 모방 금지 김짠부 말투 재창작. 게이트 `TITLE_REFERENCES=youtube`(.env 설정됨)·레퍼런스 비면 미주입(픽스처 보존).
- **`thumbnail-quality-fixes`** ✅(3 step): ① 제목 확정폼에서 썸네일 5필드 제거 ② 박스 ≤6자·메인 ≤14자 schema maxLength ③ thumbnail_maker 레퍼런스 출처 **`type='title'`→`type='thumbnail_copy'`(실제 썸네일문구 24개)** 버그수정 + 고조회 외부레퍼런스 배선 + active 스타일/banned 프롬프트 강화 ④ 썸네일 다시생성 **이유 입력**(전체 공용·개별 카드별).
- **`copy-learning-admin`** ✅(3 step, `/copy-learn`): owner 전용 **문구 학습 관리자**. 영상별 썸네일·제목(체크박스 A/B/C↔단일)·**CTR(24h)** 입력→DB(ab_variants·performance_metrics d1) 멱등저장→**재학습**(styleRelearnSweep을 **JSON→DB 소스 전환**·component 분기·`ctrWeightedScore`[CTR×A/B, 제목단일=영상간 CTR상관]·낚시방지 A/B인자 유지)→draft→**활성화**(component별, 사람게이트). 제목 스타일 신규: `loadActiveTitleStyle`/`appendTitleStyle`+hook_maker 조건부 주입(활성 없으면 불변). verdictWeight를 abVerdict로 이전(순환import 해소). **CTR 진단(라이브 DB)**: thumbnail_copy active v1 존재하나 N=5 A/B 승자만 학습·24개 실썸네일 미사용이던 것 → 이제 /copy-learn으로 CTR 기반 재학습 가능.


- **`regenerate-distinct`** ✅: '다시 생성'이 이전과 바이트 동일하던 버그. 원인=force 재생성이 prompt 변주를 안 해 promptHash 충돌→픽스처 캐시 동일출력. `runProposalStage` run-in-place에서만 `buildRegenerateAugmentedSystem`(이전후보+회차nonce) 주입→forward 픽스처 보존.
- **모델 전 역할 Opus** ✅: `roles.ts` 전 defaultModel=opus. 티어→실모델 별칭(claude-p `--model opus`/api `claude-opus-4-8`, 날짜핀 없음)이라 업그레이드 자동추적. ⚠️ 운영 api 시 ~5x 비용.
- **재생성 새로고침 수정** ✅: opus로 단계생성 ~185s인데 RegenerateButton 폴링이 60s에 끊겨 새 후보 도착 전 멈춤. 고정 cutoff 제거→**proposalId 변경으로 완료 감지**(안전상한 5분). page.tsx가 proposalId 전달.
- **`title-thumbnail-split`**(4 step) ✅: title_thumb(제목전용으로 의미변경·rename 안함)+새 `thumbnail` 스테이지. 새 상태 thumbnails_proposed/selected·전이·마이그레이션 SQL(**적용 완료** — CHECK+전이표 둘 다 라이브 확인). 훅이=제목3개 / 새 `thumbnail_maker`(opus, 선택제목+A/B스타일로 썸네일3개). 전체/개별(1칸교체·나머지보존·무전이 in-place) 다시생성. UI=ThumbnailStudio(A/B/C 3카드·개별/전체 다시생성·3개확정)+`confirmThumbnails` 게이트(AI0). vitest 304. ※중간 사용량 한도로 step3 1회 재실행(step2 그린 reset 후).
- **진행 보고서** `docs/progress-report.html`: 실사용 검증 중심(단계=구축50+검증50). 단계별 `verify%`/`status` 갱신→캡처 공유. 현재 전체 50%(구축완료·검증 미시작).

### ✅ 브랜치 정리 완료 (2026-06-24 저녁)
로컬·원격 모두 **`main` 하나로 일원화**. 작업이 전부 tip 한 줄에 선형(머지커밋 0)으로 쌓여 있어 `main`을 충돌 없이 ff-merge → 80커밋 전부 main에 포함. 나머지 15개 로컬 + 3개 원격 feat 브랜치는 `git branch -d`/`push --delete`로 안전 제거(전부 main에 보존·reflog 복구 가능). `main`=`origin/main`=`fe64a78` 동기화. 리포=`github.com/ddungpal/test_project`. **새 작업은 main에서 분기**(또는 하네스 phase가 `feat-<phase>` 자동 생성 — 끝나면 다시 main에 ff·정리).

> 아래는 이력(완료된 설계 메모) — 현재 상태/다음은 `docs/roadmap-next.md`(Phase A·B·C·D ✅코드 / C·D 실가동·E 남음)가 단일 출처.

## 📜 세션 로그 (2026-06-24 오후) — 라이브 유저테스트 + 하네스 phase 3개 (전부 로컬, 미푸시)
**유저테스트 중 발견한 이슈를 하네스(`python3 scripts/execute.py <phase>`, claude-p $0)로 phase화해 처리. 각 phase 2~3 step, Max·Joy 팀 루프 1라운드 PASS, AC(tc/test/build) 그린. vitest 206→237.**

- **`dev-pipeline-port-guard`** ✅(`feat-dev-pipeline-port-guard`): 위 '라이브 dev 운영 메모'의 포트 침묵-fallback 클래스 방지. `src/dev/preflight.ts`(순수 `diagnoseDevPipeline`: inngest-down/app-not-serving/url-mismatch) + `scripts/dev-preflight.ts`(`npm run preflight`) + `package.json` dev/inngest:dev 포트 고정 + `APP_URL` env. **라이브 url-mismatch 탐지는 비활성**(`inngestRegisteredUrls: []` — Inngest dev API 경로 불확실, 포트고정이 실질 커버). 후속 여지: Inngest dev API 연동.
- **`hook-thumbnail-revamp`** ✅(`feat-hook-thumbnail-revamp`): 훅이 썸네일 개선. ①출력 `thumbnail_copy:string` → **`thumbnail_main[2]`+`thumbnail_boxes[2]`**(메인문구2+작은박스2, 김짠부 실제 구조) + 파생 `thumbnail_copy` back-compat(회고가 읽음) ②`referenceGuard.maxReferenceSimilarity`(scriptGuards.containment 재사용)로 레퍼런스 베낌 `ref_similarity` 주석 → UI 경고배지(anti-dup) ③ThumbnailCanvas 구조 렌더(레거시 문자열 폴백)·EditFields 개별입력 ④`runProposalStage` 단계도 자동 새로고침(`RequestStageButton`이 생성 중 `LiveRefresh`). eval 신규형만 보게 + 골든픽스처 1개 손작성(레거시 9개 재녹화 회피·오프라인 유지).
- **`stage-regenerate`** ✅(`feat-stage-regenerate`): 제안 단계 **'다시 생성'**(후보 불만족·로직 업데이트 반영). `decideStageEntry` 순수판정 + `runProposalStage` `force` → **상태 전이 없이**(proposedState 유지·DB 전이 트리거 migration 회피) 새 제안 행 INSERT(최신-우선 읽기로 자동 노출). `RegenerateButton`(confirm + 생성중 LiveRefresh 60s 상한), proposal 분기에만 노출(선택 후 미노출=다운스트림 무효화 방지). topic/titles/structure만(research/script는 다른 셀). **DB 전이 그래프는 트리거(migration 08)가 강제 → 역전이는 migration 필요·오프라인 불가라 회피한 게 핵심 판단.**

**하네스 운영 학습**: `git add -A` 커밋이라 record-mode stray fixture(슬라이스·UI 테스트가 남긴 hook_maker/topic_scout json)가 각 step 커밋에 섞임(무해, eval은 신규형만 봄). phase 만들 때 **스키마 변경이 eval.test·기존 픽스처와 얽히면** "eval을 신규형만 보게 + 골든 손작성"으로 오프라인 유지가 정석.

## 📜 세션 로그 (2026-06-24 저녁) — A/B 썸네일 학습 한계 보완 하네스 phase 3개 (전부 로컬, 미푸시)
**김짠부 A/B/C 테스트(9영상→5학습) '학습됨' 검증(style_profiles v1 active) + 한계 6개 도출 → 보완 phase 3개를 하네스(claude-p $0)로 C→A→B 순서 실행. 전부 Max·Joy(+Esther) 팀 PASS, AC(tc/test/build) 그린. vitest 245→255→262. 설계 근거=`~/.claude/plans/flickering-discovering-tide.md`.**

- **`ab-style-confidence`** ✅(C, `feat-ab-style-confidence`): 학습 신뢰도 보강. ①`verdictWeight(verdict, lift)` — lift 미세조정 `base×(1+clamp(lift,0,15)/60)`, 상한 +25%, lift 없으면 기존 1.0/0.5/0 하위호환. ②`buildEquivalentSignals`로 inconclusive를 버리지 않고 '등가신호'로 보존(과적합 완화) + 교차빈도(high/tentative) 프롬프트 지시. ③schema `confidence?`·`tentative_notes?` 옵셔널(required 제외·빈배열 규칙). **재학습 실행=사람게이트**(순수함수만 구현·테스트, draft→activate는 사람이 claude-p로).
- **`ab-style-conformance`** ✅(A, `feat-ab-style-conformance`): 학습에 '이빨'. step0(백엔드) 순수 `evaluateStyleConformance(text, patterns)`→`{banned_hits, winning_score}`(banned 따옴표예시 substring + 자릿수토큰 매칭 / emphasis_words 부합률) → 훅이 `toCandidates`가 active patterns로 각 후보 주석 `style_conformance`(**ref_similarity 옆·promptHash 무관·픽스처 0변경**). step1(UI·Esther) `CandidateBody` title_thumb에 `⚠ A/B 패배 패턴` 칩(`STYLE_CONFORMANCE_BANNED_FLAG` 기준)+`A/B 부합 NN%` 캡션(0이면 생략). **표시 전용·자동거부 없음**(김짠부 '선택만' 철학). banned_hits=휴리스틱(winning_score가 더 신뢰)·주석 명시.
- **`ab-style-relearn-loop`** ✅(B, `feat-ab-style-relearn-loop`): 지속 재학습 루프. 회고 sweep 멱등 패턴 복제 — 순수 `eligibleForStyleRelearn`(표본 minDelta 증가시만 true) + `styleRelearnSweep`(현재 thumbnail `ab_variants` 행수 vs 최신 style_profile provenance 행수 비교, 학습시 `ab_variant_id` 채워 다음 sweep 동률→스킵, 0표본 no-op, provenance 실패시 draft 롤백) + Inngest `styleRelearnCron`(수동 `style/relearn.requested` + 주1회 cron, retrospectiveCron 미러). **draft까지만·activate=사람게이트**(소표본 자동덮어쓰기=과적합 차단). `learnAbStylePatterns`로 학습 본체 얇게 분리(기존 main/테스트 불변).

**남은 A/B 학습 운영**: ①(C 효과 보려면) 사람이 claude-p로 `learn-ab-style` 재실행→draft→`activate-style`. ②(B 효과) 새 Test&Compare→`ab-results.json` 추가→`ingest-ab`→`style/relearn.requested` 트리거→draft 검수→activate. ③지표 라벨(watch_share_pct를 ctr 슬롯에 저장)·provenance(B에서 ab_variant_id 링크로 일부 해소) 잔여. 코드 보완 끝, 이후는 표본 확대(D)+사람 승인 루프.

## ▶▶ (이력) 썸네일 재개점 설계 메모 — Phase A·B로 구현·활성화 완료됨
**사용자 지적**: ①생성 썸네일이 김짠부 실제 스타일과 안 닮음(현 캔버스=초안) ②A/B/C 성과로 어떤 썸네일이 좋았는지 학습하는 경로가 없음.
**코드 현황(검토 완료)**: 훅이(`hook_maker/prepare.ts`)는 과거 '제목'만 레퍼런스(썸네일 디자인 레퍼런스 없음)·출력은 layout텍스트+copy뿐. ThumbnailCanvas=검정+노랑+카피 '초안'(실사진 없음). A/B 인프라(`ab_variants`[thumbnail]·`abVerdict.judgeComponent`·회고 `buildAbSummaries`)는 **존재**하나, **`style_profiles`(thumbnail_copy·patterns jsonb)+`profile_training_sources`는 테이블만 있고 앱코드 미사용(미구현)** + **썸네일 A/B CTR 입력 경로 없음**(YouTube Analytics는 변형별 CTR 미제공→Studio "테스트 및 비교"=수동). **공통 빠진 조각=style_profiles가 비어있음**(= 김짠부 썸네일 스타일의 집).
**합의 설계**:
- **문제1(스타일)**: ①스타일 추출(김짠부 실제 썸네일 패턴→`style_profiles(thumbnail_copy)` 1회 추출, tone_extractor처럼)+훅이 prepare가 주입(제목만→썸네일까지). 선결: 김짠부 과거 썸네일 데이터(`contents.thumbnail_url` 컬럼 있음→YouTube 수집/라벨). ②캔버스→**HTML/CSS 템플릿**(인물 슬롯+카피 자동배치, 이미지생성모델은 한글·인물일관성 약점→후순위).
- **문제2(A/B 학습 루프)**: 빠진 조각 딱 2개 — ①**썸네일 A/B 입력 UI/스크립트**(ingest.ts·ab_variants 이미 받음) ②**style_profiles 가중 학습 writer**(decisive/marginal A/B→이긴 패턴 weight=ctr/Σctr로 patterns 갱신+profile_training_sources 출처링크, tech.md §13.2). 판정·회고·환류 골격은 존재. 사람 승인 게이트(과적합 방지).
**추천 단계**: 0)데이터 확보(썸네일 URL 수집+A/B CTR 수동입력 UI) → 1)style_profile 추출+훅이 주입(스타일 즉시개선) → 2)캔버스 템플릿화 → 3)A/B→style_profiles 가중학습(루프 닫기).
**정할 것**: ①시각방식(템플릿 추천/이미지생성/초안유지) ②A/B 출처(수동입력 시작 OK?) ③시작범위(1단계부터/3단계까지). (구현은 max·joy·esther 팀 병렬 가능: esther=템플릿/캔버스, max=학습 배선)

## 📜 세션 로그 (2026-06-23) — 전부 푸쉬됨(feat/phase3-dashboard)
- `77f41f9` 골든 A/B(OpenAI 백엔드+하니스) · `05d29fc` 셜록셀 재구성+overview.html · `477e555` 짠펜 opus 채택
- `21ed2f3` 구글 로그인(OAuth)+이메일 제거 · `26c676b`/`ff01568` 유저테스트 체크리스트(편집형·0·1 고정)
- `ef76e72` 촉이 수준별 주제(V1·토글) · `9c4a31c`/`f8f6c5e` 3-에이전트 팀 하네스(Max·Joy·Esther)
- 라이브 검증: 구글 로그인 성공 / 촉이 'ETF 배당' 4수준(입문·초급·중급·고급) 정확 생성 / 셜록셀 새 순서 관통
- 사용자 액션 완료: 구글 OAuth(Google Console+Supabase provider 활성·google:true) · DEV_OWNER_BYPASS=0 · 로컬 서버 2개 기동(검증됨). credentials/google-oauth.md(gitignore)에 OAuth 자격 보관.

## ✅ 완료 — 셜록 셀 재구성 + 전체흐름 시각화 (2026-06-23) — 미커밋
**사용자 지적(셈이의 grounding gap)에 따라 셜록 셀 DAG 변경 + 초등학생용 전체흐름 HTML 제작.**
- **셜록 셀 재배치**(`researchCell.ts`): 기존 `scope→[팩트검증가 ‖ 셈이 ‖ 유이]→리콘실→반론`(셋 병렬) → **`scope→팩트검증가(claim별 병렬)→리콘실(확정 사실)→[셈이 ‖ 유이]→반론`**. 셈이·유이가 '계획상 claim'이 아니라 **'검증된 사실(factContext: claim·verification_status·quote_excerpt)'**을 받아 grounding(grounding gap 해소). 셈이·유이끼리는 여전히 병렬. 캡 처리=`throwIfCapRejected` 헬퍼로 두 병렬 블록 각각.
- **에이전트 입력 변경**: `numbers/step.ts`(claims→facts: ResearchFactContext[]·verified 수치만 사실, 미검증은 가정/생략)·`analogist/step.ts`(facts 추가·검증사실과 어긋나는 비유 금지). 시스템 프롬프트도 갱신.
- **라이브 검증**(run-topic-slice claude-p $0): 새 순서로 전체 관통(셜록→검색tavily→정리→셈이/유이→반론→짠펜 10단락·표절0.38·lineage6·approved). 미래값(2026 금리)이라 fact 전부 could_not_verify→셈이가 가정처리(새 로직 작동). 테스트데이터 cleanup.
- **시각화** `docs/overview.html`(미커밋): 초등학생용. 크루 11(반장·촉이·훅이·구다리·셜록·팩트검증가·셈이·유이·반론·⚙️정리규칙[AI아님]·짠펜·회고) + 5단계 컨베이어 + **순서도(순차 vs 병렬 범례·셜록셀 5단계: 셜록→팩트검증가→정리→셈이∥유이→반론)** + 안전지킴이 + 학습루프. TRUS색.
- **함정/주의**: 셈이·유이 입력 변경→promptHash 변경→기존 `fixtures/parity/{numbers,analogist}` 무효(record 모드 라이브서 새로 기록됨, eval은 output만 읽어 무관). tsc0·vitest130·build0.
- **→ 남음**: 커밋(코드+overview.html 미커밋). 골든 A/B 사용자 블라인드 선택.

## ✅ 완료 — 골든 A/B: 짠펜 말투 비교 (2026-06-23, Opus 4.8 vs GPT-5.5) — ✅커밋 77f41f9
**남은 엔지니어링이던 골든 A/B 완성. OpenAI 백엔드 신규 + 동일 입력 짠펜 대본 블라인드 비교(사람 판정·"김짠부는 선택만").**
- **OpenAI 백엔드**(`src/llm/backends/openai.ts`): SDK 없이 raw fetch(chat/completions)·json_object 모드+스키마 프롬프트 주입+ajv 사후검증(claude-p와 동형 전략, strict structured outputs는 minItems 미지원이라 회피). `types.ts`(LlmBackend+="openai")·`config.ts`(수용)·`pricing.ts`(backend별 단가 라우팅, GPT 단가=`OPENAI_IN/OUT_PER_M` env·보수적 기본 10/30)·`callLLM.ts`(pickDriver+pricing에 driver.name 전달). `.env`(OPENAI_MODEL=gpt-5.5)·`.env.example` OPENAI_*.
- **하니스**(`scripts/golden-ab.ts` prepare/run/cleanup): 동일 짠펜 입력(tone/outline/facts/assets)을 Opus(claude-p $0)·GPT-5.5(openai 유료·하드캡 $3 `GOLDEN_AB_CAP_USD`)에 먹여 대본 생성→블라인드 HTML(`corpus/golden-ab/ab.html`: 모델·비용·지연 가림·중립지표[단락수·자수·코퍼스포함도]만·reveal에 정답). fixtures=off로 promptHash 충돌 회피·A/B 라벨 무작위·매핑은 results.json 보존.
- **입력 동결**: 재사용 런 1(파킹통장) + 파이프라인 신규 2(안전자산 분산·청년 포트폴리오, claude-p $0·주제 idx 다르게). 함정: 낙관적 전이가 네트워크 재시도로 0행 보고(상태는 실제 전이됨)→prepare가 실제 상태 재확인으로 견고화.
- **실행 결과**(3편): GPT 실비 합계 **$0.40**(캡 $3). 표절 포함도 전부 0.42~0.52(<0.6). 길이/단락: Opus 7~20단락, GPT 8~10단락.
- **✅ 판정(2026-06-23): Opus 4.8 승 → 짠펜(scribe) 운영 기본 모델 sonnet→opus 반영(`roles.ts`)**. 운영 그대로 Anthropic api(openai 백엔드 운영 불필요·비교용 코드만 유지). 편당 비용 ~$0.39→~$0.74 추정(여전히 캡·목표 한참 아래, `docs/operations.md` 갱신).
- **테스트**: `tests/openaiBackend.test.ts`(config 수용·backend별 단가, 6건). tsc0·vitest130·build0.
- **→ 남음**: prepared 테스트 런 정리=`golden-ab.ts cleanup`(원할 때). scribe→opus 변경분 커밋.

## ▶▶ 다음 세션 재개점 — 이제 '배포 게이트'(사용자 작업) 차례
**엔지니어링 측 할 일은 끝. 아래는 사용자가 직접 해야 하는 것(배포까지).**

### ▶ NEXT (바로 할 일 — 배포까지 최단경로)
1. **owner 비밀번호 변경** — 검증용 임시 `Tmp-8d17aefb-verify` → 본인 것으로(Supabase 대시보드 → Authentication → Users → reset). 안 하면 로그인 불가.
2. **브라우저 최종 검증** — `DEV_OWNER_BYPASS=0`로 `/login` → 로그인 → 대시보드 조작 → 로그아웃 직접 확인. (로컬 dev: `./node_modules/.bin/next dev -p 3001`)
3. **PR #1 리뷰·머지** — https://github.com/ddungpal/produce-script/pull/1 (feat/phase3-dashboard → main, 27+커밋).
4. **Vercel 배포** — 운영 env 세팅(`docs/operations.md` 참조: `LLM_BACKEND=api`·`LLM_FIXTURES=off`·키·캡·`PERFORMANCE_SOURCE=youtube`). **`DEV_OWNER_BYPASS` 절대 미설정.** Inngest 프로덕션 연결.

### 📋 BACKLOG (배포 후/병행)
- **YouTube Analytics OAuth** 채널 인증 → `YT_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`(성과 자동 수집 실연결). 안 하면 성과 수집은 수동 입력(`scripts/ingest-performance.ts`)로.
- **OpenAI 키 rotate** — 채팅 노출분 폐기(codex가 사용 중).
- ✅ **(선택 엔지니어링) 골든 A/B** — 완료(위 섹션). Opus 4.8 vs GPT-5.5 짠펜 블라인드 비교 실행. 사용자 선택만 남음.
- (선택) 운영 비용 모니터링·eval 확장 등.

### ✅ 적용 완료 / 검증됨 (참고)
- migration 17~21 전부 적용. audit_log·Realtime 라이브 검증 통과. 실인증 라이브 검증(로그인·게이트·리다이렉트). 편당 비용 실측 $0.39.

---

## ✅ 완료 — 감사 뷰어 + Realtime 검증 (2026-06-23, `b9c3a37`)
- **Realtime 라이브 검증**: migration 21 적용 확인 — 필터없는 production_runs 구독으로 UPDATE 3건 수신(LiveRefresh는 필터없음 → 운영 세션서 작동). 첫 시도 실패는 필터옵션 이슈일 뿐.
- **감사 로그 뷰어 `/audit`**(`b9c3a37`): audit_log를 볼 곳 추가 → 기능 end-to-end(기록9액션→저장→뷰어). `auditView.getAuditLog`(actor display_name 코드조인·한국어 액션라벨)·owner 게이트·detail 사람친화 렌더·layout '감사' 네비. 라이브검증(라벨·조인·detail) 통과.
- **→ 남은 엔지니어링**: 골든 A/B(OpenAI 백엔드 필요·실비·모델ID 불확실 → 사용자 스코핑). 그 외는 배포 게이트(사용자).

## ✅ 완료 — 실시간 구독 (2026-06-23, `7fd5791`)
- **audit_log 라이브 검증**: migration 20 적용 확인 — service-role insert·인덱스 조회·정리 정상. 감사 로그 실제 기록됨.
- **실시간 구독**(migration 21 `realtime_runs`): production_runs를 supabase_realtime publication에 추가(멱등 DO). `LiveRefresh` 컴포넌트=Realtime 구독+느린 폴링 8s 폴백(하이브리드) → dev 바이패스/publication 미적용 시 폴링 degrade(ship-safe). StageStepper AutoRefresh→LiveRefresh 교체(작업 중만). AutoRefresh 제거. ⏳**migration 21 SQL 적용 시 Realtime 활성**.
- **→ 남음(사용자)**: migration 21 SQL · (기존)owner비번·YT OAuth·OpenAI키rotate·브라우저검증·Vercel배포. 선택 하드닝: 골든 A/B(OpenAI 백엔드 필요·별도 트랙).

## ✅ 완료 — 마감 4건 (2026-06-23)
- **D 서브진행바**(`a9843f0`): 셜록 4스텝(검증범위→병렬→교차정리→반론)·짠펜 2스텝(대본→표절) setProgress, 완료 시 null.
- **audit_log**(`7d771b5`, migration 20): 사람 게이트 9액션(run_started·stage_selected·research/script_approved·script_rework·run_aborted·run_deleted·insight_status·insight_edited) 영속 기록. `auditLog` best-effort(테이블 미적용 시 무시). 읽기 owner·쓰기 service-role. ⏳SQL 적용 필요.
- **eval 엄밀화**(`d21caa6`): `tests/eval.test.ts` 골든셋 회귀 — 커버리지·비자명성·발굴 융합(web:/yt:)·시청자대면 MOCK 누출(fact_verifier reasoning은 제외). 형태 변이 견고(레거시 fixture 건너뜀·골든셋 개수 강제). vitest 112→124.
- **머지 PR #1**: feat/phase3-dashboard→main(27커밋·157파일). 함정: main 27커밋 뒤짐. 머지 후 migration 17~20 SQL 적용 필요.
- **→ 남음(사용자)**: migration 17~20 SQL · owner 비번 · YT OAuth · OpenAI키 rotate · 브라우저 검증 · Vercel 배포. (선택 하드닝: 실시간구독·골든 A/B)

## ✅ 완료 — 운영 전환 검증 (2026-06-22) — claude-p→API
**API 백엔드는 이미 완성돼 있어 '검증+실측'. 실비 ~$0.5 소요(승인). `docs/operations.md` go-live 체크리스트 작성.**
- **① API 스모크**(haiku 1콜·$0.001): provider=api·forced tool_use 스키마 검증·비용계산 정상.
- **③ 하드캡 검증**($0): 낮은 캡 → 예약 단계 `HardCapExceededError`(추정 > 캡) → **API 호출 0·과금 0**. 캡이 호출 전 차단.
- **② 편당 비용 실측 = $0.39**(api·full pipeline 촉이→짠펜·검색 mock): scribe $0.088·structurer $0.063·fact_verifier×4 $0.065·topic $0.045·numbers $0.034·hook $0.034·critic $0.029·sherlock $0.026·analogist(haiku) $0.007. **하드캡 $10의 3.9%·소프트캡 $7의 5.6%**. fixture 추정($0.09)보다 ~4배(라이브 프롬프트가 더 무거움)나 목표 한참 아래.
- **🐛 critic parity 수정**(운영 전환이 드러냄): `counter_evidence`·`missing`이 required인데 모델이 빈배열일 때 통째 누락 → forced tool_use도 required 100% 보장X → api 무재시도서 편 전체 실패. **required에서 제외 + step `?? []` 기본값**(빈 배열 가능 필드는 required 금지=신규 에이전트 원칙). tsc0/vitest112.
- **세션 실비**: 스모크 $0.001 + 실패런(critic 전) $0.13 + 풀런 $0.39 ≈ **$0.52**(추정 $0.11 초과 — 실비>추정 + critic 실패로 부분런). 전부 정리됨.
- **→ go-live 남음(`docs/operations.md`)**: 운영 env(LLM_BACKEND=api·fixtures off·키·캡) · 사용자 액션(owner 비번·YT OAuth·OpenAI키 rotate·브라우저 검증·Vercel) · 후순위(실시간구독·audit_log·eval·골든 A/B).

## ✅ 완료 — Phase 5 진짜 인증 (2026-06-22, ✅푸쉬 `cadf310`) — 배포 블로커 해소
**Supabase Auth 세션 기반 실인증 와이어링. 바이패스(`DEV_OWNER_BYPASS`)는 게이트된 채 '선택적 개발 편의'로 유지(NODE_ENV!=='production'+플래그, 프로덕션 절대 작동 안 함).**
- **미들웨어** `src/middleware.ts`: Supabase SSR 세션 갱신(getUser→토큰 refresh·쿠키 동기화). edge. matcher로 정적·inngest·client-error 제외.
- **인증 헬퍼** `auth.ts`: `resolveOwnerId`(세션→profiles.role='owner', 미인증 null) 기반으로 `requireOwner`(throw·액션용)·`requireOwnerPage`(redirect /login·페이지용)·`getOwnerId`(null 허용) 분리. 바이패스 경로 유지.
- **로그인/아웃** `session.ts`(use server): `signIn`(signInWithPassword·이메일 열거공격 차단 단일 에러)·`signOut`. `/login/page.tsx` + `LoginForm.tsx`(useActionState) + `SignOutButton.tsx`(헤더, 실세션만 노출·바이패스 시 숨김).
- **게이트 교체**: page·runs/[id]·insights를 `requireOwnerPage`로(미인증→/login 리다이렉트, 에러 대신).
- **검증**: tsc0·vitest112·build 그린(/login·Middleware 등록). **라이브**: signInWithPassword 세션발급+owner역할 통과·틀린비번 거부 / 미로그인 `/`→307 /login·`/insights`→/login·`/login` 200(폼). 임시 owner 비번 설정(검증용)→**사용자가 본인 비번 설정 필요**(Supabase 대시보드 또는 admin updateUserById).
- **→ Phase 5 잔여**: 운영 전환(claude-p→API·골든 A/B·비용 실측) · 실시간 구독(현 수동 새로고침→Supabase Realtime) · audit_log · eval 엄밀화. 그 후 배포(Vercel). 유저 최종 검증(브라우저 로그인 플로우) 예정.

## 🔨 진행중 — ① 운영 자동화 (2026-06-22) — Sub-B: 성과 수집 자동화(미커밋)
**manual.json → YouTube Analytics API 자동 수집. 어댑터+수집 Cron+fixture를 완성(개발 $0), 실 OAuth 연결만 추후. A/B는 API 미제공 → overall 지표만(A/B는 수동 유지).**
- **YT Analytics 어댑터** `src/performance/youtubeAnalytics.ts`: reports.query(views·impressionsClickThroughRate→ctr·averageViewPercentage→avgViewPct) + record/replay fixture(search 패턴) + `mockYtBackend`(결정적·테스트 주입) + `getYoutubeAccessToken`(refresh token 교환). **`pickYtBackend`=PERFORMANCE_SOURCE=youtube일 때만 실수집, 그 외 null=자동수집 비활성**(개발 수동입력 보존·cron no-op).
- **수집 오케스트레이션** `src/performance/collect.ts`: `dueWindows`(순수: 경과일 ≥ 윈도우일수 & 미적재)·`windowDateRange`(순수) + `collectPerformance`(발행 영상[vid+upload_date, **안정정렬 upload_date·id**]→due 윈도우 수집→ingest, backend null이면 no-op, limit 가드).
- **수집 Cron** `src/inngest/functions/performanceCron.ts`: cron(매일 06:30 KST, 회고 sweep 07:00 직전) + `performance/collect.requested`. 수집되면 `performance/collected` 발행 → 회고 sweep 깨움(루프 연결). client 이벤트·레지스트리·`.env.example`(PERFORMANCE_SOURCE/FIXTURES·YT_OAUTH_*).
- **검증**: tsc0·**vitest 112**(103→+9)·라이브(mock 백엔드 주입): 8콘텐츠 due 윈도우 수집→ingest, **2회차 0 fetch(완전 멱등)**, 안정정렬로 limit 결정적 → cleanup. **함정**: contents 쿼리 ORDER BY 없으면 limit 하 매번 다른 부분집합(불안정)→안정정렬 필수. A/B 변형 CTR은 Analytics API 미노출→overall만.
- **→ ① 운영 자동화 종료(루프 자동화: 성과 수집 Cron→회고 sweep→인사이트 draft→사람 승인→환류).** 실 OAuth 연결은 사용자 채널 인증 시. 다음 = Phase 5(진짜인증·운영전환) / D(서브진행바).

## 🔨 진행중 — ① 운영 자동화 (2026-06-22) — Sub-A: 회고 자동 트리거(미커밋)
**수동 루프 → 스스로 도는 루프. 성과가 적재됐는데 회고가 없는 콘텐츠를 sweep해 자동 회고. OAuth 불필요·claude-p $0.**
- **멱등 sweep** `runRetrospective.ts`: `eligibleForRetrospective`(순수: 성과 있고 회고 없는 콘텐츠만·bounded) + `retrospectiveSweep`(performance_metrics overall ∖ retrospectives → 각 회고 실행). **콘텐츠당 1회 정책**(회고 생기면 다음 sweep 제외 → retry·중복이벤트 안전). codex P1(비멱등) 해소.
- **Inngest 함수** `retrospectiveCron.ts`: 트리거 3개 = cron(매일 07:00 KST 누락보정) + `performance/collected`(성과 수집 직후) + `retro/sweep.requested`(수동). concurrency 1·retries 1·onFailure 캡처. client.ts 이벤트 2개 추가. functions/index 등록.
- **검증**: tsc0·**vitest 103**(98→+5)·라이브: 성과 적재 → sweep 1회차 대상1·회고 실행(인사이트3) → 2회차 대상0(멱등) → cleanup. `scripts/run-retro-sweep.ts`(--limit).
- **→ 다음 Sub-B(성과 수집 자동화)**: manual.json → **YouTube Analytics API 어댑터**(OAuth 필요) + 수집 Cron(영상 d1/d7/d14/d30 윈도우 도달 시 수집 → `performance/collected` 발행). **OAuth는 사용자 채널 인증 1회 필요** — 어댑터+fixture 먼저, 실연결은 추후. 그 후 Phase 5(진짜인증·운영전환).

## ✅ 교차검토 패스 (2026-06-22, ✅푸쉬 `2a103a3`) — Claude×2관점 + GPT-5.5 codex 병렬
**Phase 4 전체(슬라이스1~4)를 Claude 다중관점(정확성·데이터무결성 / 보안·거버넌스·결정성) + GPT-5.5 codex 병렬 정적검토. 거버넌스 C(댓글 원문 비전송)·인증(requireOwner)·XSS·픽스처 결정성 양쪽 PASS. 합의 결함 수정:**
- **[P0]** `cleanupRetrospectives` × `ON DELETE SET NULL`(migration17) × A3 CHECK(migration18) 충돌 — draft만 지우고 retrospective 삭제 시 살아남는 승격 insight FK가 SET NULL→source_type='retrospective'와 충돌 throw. → 승격분 먼저 detach(FK null + source_type='human_authored') 후 부모 삭제. **라이브 검증**(승인 insight 달린 retrospective cleanup → throw 없이 detach 보존).
- **[P1]** 회고 저장 원자성(insights 실패 시 retrospective 보상삭제) · 중복 입력(같은 window·variant)→upsert 크래시 파싱단계 거부 · 환류 정렬 비결정성(loadApprovedInsights created_at·id tie-break) · evidence 'insight:' 접두사 노트 정합.
- **[P2]** 인사이트 상태전이 낙관적 잠금(.eq status=from) · valid_until YYYY-MM-DD 검증 · pickContentVerdict 비교자 antisymmetric · summarizeChoicePayload 가드.
- **보류(기록)**: 댓글 query 정렬 추가는 기존 topic_scout 픽스처 깨짐 위험(commentSignals 동점순서 변동)→미변경(잠복·현재 표본<5000) · ingest cleanup 범위/재적재 stale ab_variants는 단일 writer 가정下 후순위.
- **검증**: tsc0·**vitest 98**(96→+2)·build 그린. codex는 P0 0건(cleanup을 P1로)·Claude는 P0로 — 양쪽 합의 수정.

## 🎉 완료 — C Phase 4 학습 루프 닫힘 (2026-06-22) — 슬라이스 4: 환류(미커밋)
**승인된 인사이트를 차기 런 prepare에 주입 → 학습 루프 완전히 닫힘(성과→회고→인사이트→승인→다음 제작 반영). 촉이·훅이·구다리 3단계 환류.**
- **공유 헬퍼** `src/agents/shared/approvedInsights.ts`: `loadApprovedInsights(supa, categories, {asOf})`=status='approved'만(슬라이스3 승인 게이트)·valid_until 필터·신뢰도순 + `filterValidInsights`·`appendLearnedInsights`(순수: system에 학습규칙 섹션 주입, evidence_ids에 insight:id 링크 지시). 테스트 6.
- **★ 픽스처 보존 설계**: 승인 인사이트가 **있을 때만** input.learned_insights/system을 변경(없으면 기존 promptHash 동일) → **기존 parity 픽스처 14건 전부 보존**(vitest 96 그린).
- **촉이**(topic_scout): `learned_insights?` 조건부 추가 + system 주입(category 'topic', asOf=run.as_of_date). **훅이**(hook_maker): 'title'·'thumbnail'. **구다리**(structurer): 기존 인라인 insight 쿼리(reviewed+approved)를 공유 헬퍼(**approved만**)로 표준화, structure_insights 필드 형태 유지.
- **검증**: tsc0·**vitest 96**(90→+6)·next build 그린. **라이브 환류**: 승인-유효/승인-만료/초안/타카테고리 insight 삽입 → loadApprovedInsights('topic')가 **승인+유효 1건만** 반환(만료·초안·타카테고리 제외)·id 'insight:' 형식 → cleanup. 픽스처 보존 = parity 통과로 입증.
- **함정**: input에 빈 배열이라도 항상 넣으면 promptHash 변동→기존 픽스처 깨짐 → 조건부 주입 필수. `.in("category")`는 enum union 타입 필요(InsightCategory[]).
- **→ Phase 4 학습 루프 종료.** 다음 = **Phase 5(진짜 인증=바이패스 제거·운영 전환=claude-p→API·실시간 구독·audit_log·eval)** 또는 **D(셜록·짠펜 서브진행바)** 또는 회고/환류 운영 자동화(YouTube Analytics 성과 수집·회고 Cron).

## 🔨 진행중 — C Phase 4 학습 루프 (2026-06-22) — 슬라이스 3: 인사이트 승인 UI 완료(미커밋)
**회고가 만든 학습노트(insights draft)를 김짠부가 검토→승인/폐기하는 대시보드. 승인된 것만 차기 런 환류(슬라이스 4). '선택+수정' 패턴.**
- **상태 전이 가드(순수)** `src/domain/insightStatus.ts`: draft→reviewed/approved/deprecated, reviewed↔draft·→approved/deprecated, approved→deprecated/reviewed, deprecated→draft(되살리기). `canTransitionInsightStatus`·`nextInsightStatuses` + INSIGHT_STATUS_LABEL·INSIGHT_CATEGORY_LABEL(8종 한국어). 테스트 6.
- **읽기 헬퍼** `src/lib/dashboard/insightsView.ts`(server-only): `getInsightsBoard`=상태별 그룹 + source content 라벨 코드조인 + draftCount.
- **서버 액션** `src/app/actions/insights.ts`(requireOwner): `setInsightStatus`(서버가 canTransition 가드·허용 안된 전이 거부)·`updateInsight`(title/body/confidence/valid_until 수정, 빈값 거부).
- **UI**: `src/app/insights/page.tsx`(force-dynamic·requireOwner·상태별 섹션 draft 먼저) + `src/components/InsightCard.tsx`(클라: 전이 버튼 nextInsightStatuses 기반·승인=노랑 강조·인라인 수정·router.refresh) + layout.tsx 네비 "인사이트" 링크.
- **검증**: tsc0·**vitest 90**(84→+6)·next build 그린(`/insights` 1.99kB). **라이브**: 테스트 insight 3건(source_type=null로 A3 무해)→보드 그룹핑 정확(draft 2·approved 1)·전이 가드(draft→approved✓·approved→draft✗)·승인 후 재그룹(approved 1→2)→cleanup 0. ⚠️UI 브라우저 클릭검증은 미수행(server-only 장벽으로 헤드리스 액션호출 불가) — 구성계층(read·전이·build) 각각 검증.
- **→ 다음 슬라이스 4(환류·루프 닫힘)**: approved insights를 각 에이전트 `prepare` context에 주입(촉이부터 — category='topic'·valid_until>now·status='approved' 필터). 그 후 Phase 5(진짜인증·운영전환).

## 🔨 진행중 — C Phase 4 학습 루프 (2026-06-22) — 슬라이스 2: 회고 에이전트 완료(미커밋)
**발행 후 성과+선택+시청자반응을 인과로 복기→인사이트 draft 제안하는 '회고' 에이전트. 학습 루프의 심장(회고→인사이트 승격) 절반 구축. 라이브 실LLM 검증($0).**
- **역할** `roles.ts retrospectivist`(name "회고", opus·tools[], 편당1회·저빈도·고가치). 파이프라인 단계 아님(production_run 무관·발행 후 독립 실행).
- **스키마** `src/agents/retrospectivist/schema.ts`: RETROSPECTIVE_SCHEMA(good_points·improvements·lessons + insights[category(8종)·title·body·confidence0~1·evidence]) + SYSTEM(성과←선택 인과·근거없는 일반화 금지·A/B decisive면 conf↑·한영상 과적합 금지·'제안'이지 강요 아님).
- **prepare** `prepare.ts`(결정적 §8.1·거버넌스 C): performance_metrics(overall 윈도우) + ab_variants→`buildAbSummaries`(judgeComponent 재사용=margin/decisiveness 단일출처) + 최신 run proposal→selection 코드조인(`summarizeChoicePayload`) + **발행후 댓글 집계**(content_id 한정[migration17 백필]·aggregateCommentSignals·원문 비전송). has_performance=성과없으면 회고 스킵.
- **실행** `runRetrospective.ts`: prepare→callLLM 1회(CostGuard 자체구성·runId='retro:{cid}'·claude-p $0)→**retrospectives 1행 + insights draft N개**(status='draft'·source_type='retrospective'·provenance FK, **migration18 A3 CHECK 충족**, evidence는 body에 합침). 승격은 사람몫(슬라이스3). `cleanupRetrospectives`(draft만 삭제·승격분 보존).
- **CLI** `scripts/run-retrospective.ts`(--content/--video·--cleanup). 단위테스트 `tests/retrospective.test.ts`(buildAbSummaries·summarizeChoicePayload·스키마, 8건).
- **검증**: tsc0·**vitest 84**(76→+8)·build 그린. **라이브 실LLM 회고**(영상 5f8EtDUXgoQ ISA, claude-p record $0): 성과(A/B질문형 decisive·CTR 우상향·retention 하락) + 실댓글 1000개·질문397·키워드(만기일·9999년) 인과분석 → 인사이트 3draft(thumbnail conf0.75·structure0.5·research0.4 "한영상이라 약하게"=과적합경계 작동). DB: retrospectives1+insights3draft·provenance/A3 일치 검증 → 회고·성과·임시파일·녹화fixture 전부 cleanup(실데이터 무오염).
- **함정**: 회고 fixture는 임시 성과데이터 의존→커밋 안 함(삭제). 녹화 경로=`fixtures/parity/{roleId}/`.
- **→ 다음 슬라이스**: ③ 인사이트 승인 UI(draft→reviewed→approved→deprecated, 대시보드) → ④ 환류(approved insights→각 prepare context, 촉이부터). 그 후 Phase 5.

## 🔨 진행중 — C Phase 4 학습 루프 (2026-06-22) — 슬라이스 1: 성과 수집 완료(✅푸쉬 `1a4693b`)
**학습 루프(제안→선택→회고→인사이트승격→환류) 중 비어있던 '성과 수집' 토대 구축. 코드 전용·LLM 0회(거버넌스 C). 개발=사람이 직접 채우는 입력 파일 / 운영=YouTube Analytics 어댑터로 교체(writer 동일).**
- **입력 계약** `src/performance/types.ts`: PerformanceEntry(content_id|youtube_video_id + metrics[d1/d7/d14/d30 views·ctr·avg_view_pct] + ab[title/thumbnail·A/B/C·ctr_pct·impressions]). `parsePerformanceFile`=명확한 에러 모음 반환(throw X).
- **A/B 판정** `src/performance/abVerdict.ts`(순수·테스트15): `judgeComponent`=CTR 내림차순 rank·is_winner + 차순위 대비 **상대 리프트** margin → decisive(≥10%)/marginal(≥3%)/inconclusive. `pickContentVerdict`=결정된 것 중 margin 최대(동률 썸네일 우선). `config.ab`(env AB_DECISIVE_MARGIN/AB_MARGINAL_MARGIN).
- **적재 writer** `src/performance/ingest.ts`: `performance_metrics`(윈도우별·ab_variant='overall') + `ab_variants`(변형별 판정) **멱등 upsert**(unique 제약 기존). **`contents.ab_*` = ab_variants에서 파생되는 캐시**(단일 출처 → ERD 후보A 드리프트 차단). `cleanupPerformance`=역연산(스모크/복구). content_id 해석(youtube_video_id 매칭).
- **수동 입력 + CLI**: `src/performance/manualSource.ts`(fixtures/performance/manual.json 로드·검증), `scripts/ingest-performance.ts`(`--list` 영상목록·`--cleanup` 역연산), `fixtures/performance/manual.example.json` 템플릿. manual.json=gitignore(개인데이터), .env.example AB 섹션.
- **검증**: tsc0·**vitest 76**(61→+15)·next build 그린. **라이브 스모크**(영상 5f8EtDUXgoQ): 2회 적재 멱등(3·2행 불변), B rank1 winner(6.8)·A rank2(5.1), contents.ab_*=margin 0.333·decisive·decided **정확** → cleanup으로 0행·pending 복귀(실데이터 무오염). 라이브 contents 18건(업로드 8·제작 10) 확인.
- **함정**: tsx -e는 top-level await 불가(IIFE)·exactOptionalPropertyTypes(optional에 undefined 명시 대입 금지→조건부 할당)·noUncheckedIndexedAccess(배열 인덱스 ?. 필요).
- **→ 다음 슬라이스**: ② 회고 에이전트(성과+선택[stage_selections]+발행후 댓글신호 → retrospectives 1행 + 인사이트 draft) → ③ 인사이트 승인 UI(draft→approved) → ④ 환류(approved insights → 각 prepare context). 그 후 Phase 5(진짜인증·운영전환).

## ✅ 완료 — B 발굴 신선도 (2026-06-22) — 검색 캐시 TTL + 매일 발굴 Cron
**검색 결과가 영구 동결되던 문제(트렌드 쿼리가 옛 fixture로 박제) + 발굴이 수동 런에만 의존하던 문제를 해소. ✅커밋 `cf34d66`(미푸쉬), migration 19 적용·라이브 검증 완료(발굴 34후보·2회 멱등성·last_seen 33건 갱신).**
- **① 검색 캐시 TTL**: fixture **mtime 기준** TTL(포맷 변경 0·기존 호환). `config.search`(default 1일 + volatility static30일/slow7일/fast1h, 전부 env). `SearchQuery.volatility`(해시 미포함 — 만료판정만). **`record` 모드에서만 stale→라이브 재호출**, `replay`(개발 $0)는 stale이어도 반환 → **개발 $0 계약 유지·운영(record)=진짜 TTL 캐시**. 촉이 트렌드 쿼리=`fast`(1h)→매일 cron 항상 갱신, 키워드=`slow`. (`src/search/{types,search}.ts` `ttlSecondsFor`, `config.ts`, `externalSignals.ts`, `prepare.ts`)
- **② 매일 발굴 Cron**: **코드 전용(LLM 0회·~$0·governance C)**. 댓글 광역집계+외부신호(웹트렌드·YT경쟁)→`topic_candidates` **멱등 upsert**(dedup_key·last_seen_at, status 미포함=승격/반려 보존). 촉이(LLM)가 다음 런서 풀 읽어 승격(§8.1 유지). Inngest 함수 트리거 2개=cron(매일 06:00 KST)+`discovery/refresh.requested`(수동·UI버튼용). (`src/agents/topic_scout/{discovery,commentSignals}.ts`, `src/inngest/functions/discoveryCron.ts`+레지스트리+client 이벤트)
- **공유 리팩터**: 댓글 키워드 집계를 `commentSignals.aggregateCommentSignals`로 추출(prepare·discovery 공유, stripJosa re-export로 테스트 호환).
- **migration 19 `discovery_freshness`**: topic_candidates += `dedup_key`(일반 unique — Postgres NULL distinct로 과거행 다중허용, partial 안 씀=supabase onConflict 호환)·`last_seen_at`. ⏳**SQL 에디터 수동 적용 + database.types 갱신(완료)**.
- **검증**: tsc0·**vitest 61**(55→+6: TTL매핑·댓글집계)·next build 그린. 라이브 통합=`scripts/run-discovery.ts`(2회 실행 멱등성·last_seen 갱신 검증, `--cleanup`). .env.example SEARCH 섹션 추가.
- **함정/주의**: `record` 모드는 이제 stale fixture를 재호출(과금) — 개발 $0는 `replay` 사용. partial unique index는 supabase upsert onConflict와 안 맞음(일반 unique+NULL distinct로 해결).
- **→ 다음**: migration 19 적용 → (선택)라이브 발굴 검증 → 커밋·푸쉬. 그 후 **C Phase 4 회고&발굴** / **D 셜록·짠펜 서브진행바**.

## ✅ 완료 — ERD 하드닝 (2026-06-20, migration 18) — GPT-5.5 codex 교차검토

## ✅ 완료 — ERD 하드닝 (2026-06-20, migration 18) — GPT-5.5 codex 교차검토
**Claude + GPT-5.5(codex) 병렬 재검토 → 합의 P1~P2를 migration 18 `hardening`으로 적용·커밋·푸쉬 `37d8182`.** codex 발견 전부 실스키마와 교차검증(할루시네이션 0).
- **A1+A2**: `link_content_by_video_id()` before-insert 트리거(transcripts·comments_raw) = content_id를 youtube_video_id에서 권위있게 파생(누락방지+불일치차단). `transcripts.content_id` **NOT NULL**. **ingest 앱주입 제거**(트리거가 단일소스).
- **A3**: `insights` CHECK — retrospective FK ⇔ `source_type='retrospective'`.
- **B1** ⭐: `content_links` **RLS 정책 추가**(migration 14가 enable만·정책0 = 진짜인증 시 전면차단 잠복버그). contents 패턴.
- **B2**: `script_segments.ord` check(≥0) + unique(run_id, ord). **B3**: active 단일성 tone_profile·style_profiles partial unique.
- **라이브 검증**: 위반 insert 4건 전부 거부(A3=23514·B2=23514·A1=23502[트리거+NOTNULL]·B3=23505). tsc0/vitest55/build 그린.
- **보류(백로그)**: B4 lineage 복합FK(무거움)·B5 pts on delete restrict·B6 수치도메인 CHECK·후보A(A/B 3곳분산→Phase4 A/B회수와)·후보B(검색출처 이원화→의도된 층위분리). codex 원문 `/tmp/erd-review-ascii/OUT.md`.
- **→ ERD 구조·무결성 개선 사이클 종료.** 다음은 B(발굴신선도)/C(Phase4·5)/D 기능진척.

## ✅ 완료 — ERD 개선 사이클 1바퀴 (2026-06-20)
**다이어그램(ERD) 렌즈로 ①문제→②해결→③검증 1사이클 완주. FK 그래프 고립 5개 중 4개 연결, 1개(룩업)는 의도 단독 유지.**
- **migration 17 `connect_orphans` 적용 완료**(SQL에디터 수동) + 커밋·푸쉬 `78050ee`.
  - `script_imports` **드롭**(코드 0회·링크키 0, corpus_editions가 역할 대체=죽은 테이블)
  - `transcripts` `content_id` FK(`on delete restrict` — L1불변트리거와 cascade/setnull 충돌 회피, 백필 위해 트리거 일시해제)
  - `comments_raw` `content_id` FK(`on delete set null` — 촉이 전역 댓글풀 보존, 트리거 없어 직접 백필)
  - `insights` provenance FK 2건(`source_retrospective_id`·`source_content_id` — 학습루프 "회고→인사이트 승격" 역추적)
- **라이브 검증**: 자막 8/8·댓글 4092/4092 content_id 백필 / `script_imports`=404 PGRST205(드롭확정) / insights 컬럼 존재. **tsc0·vitest55·next build 그린. ERD 30T·33FK → 29T·37FK.**
- **동반코드**: `database.types.ts`(수기)·`scripts/ingest-youtube.ts`(vid→content_id 주입, 신규행 재고립 방지)·`scripts/generate-erd.mjs`. 신규 **diff 다이어그램** `scripts/generate-erd-diff.mjs`→`erd-database-diff.html`(AS-IS/TO-BE).
- **함정**: supabase-js `head:true` count는 드롭된 테이블에 에러 대신 null 반환(오판 주의)→실 select로 404 확인. ASCII /tmp엔 node_modules 없음→검증스크립트는 프로젝트 내부 임시파일로.

### ▶ 다음 (ERD 구조개선은 거의 소진 — 둘 다 보류 권장)
- **후보 A** A/B 성과 3곳 분산(`contents.ab_*` 캐시 + `ab_variants` + `performance_metrics`, 진실출처 모호·드리프트) → **코드 미사용 = Phase 4 A/B 회수 구현과 함께 정리**.
- **후보 B** 검색출처 이원화(촉이 `stage_proposals.sources` jsonb 인라인 vs 셜록 `source_documents` FK 정규화) → **층위 다른 의도적 분리 가능성↑, 강제 정규화 = 과설계**.
- (2026-06-20 GPT-5.5 codex 병렬 재검토 진행 중 — 결과 반영 예정.)
- → 그 다음은 **B 발굴 신선도(검색캐시 TTL·매일발굴 Cron)** / **C Phase 4·5** / **D 셜록·짠펜 서브진행바** 로.

### (과거) 입력 리포트 5종 — `structure-audit/target/result.html` · `erd-pipeline.html` · `erd-database.html`(생성기 `generate-erd.mjs`). PDF는 ERD 가로폭에 깨짐→링크. 공유 URL 보류.

## (과거·대부분 ✅완료) Phase 3 검토
**(1) 병렬 code-review ✅ 완료 → 수정 ✅ 완료. 남은 것: (2) 라이브 E2E.**
1. ✅ **병렬 code-review 완료(2026-06-19)** — Claude 3관점(보안·정확성·XSS) + GPT-5.5 codex(/tmp ASCII) 교차검토. 즉시 위협 0(admin=server-only 봉인·전 액션 requireOwner). **교차검증 7건 수정 완료**(tsc0/55테스트/build 그린, 미커밋):
   - **읽기 페이지 인증 게이트**(codex P0/Claude P2): `page.tsx`·`runs/[id]/page.tsx` 상단 `await requireOwner()` — 진짜 인증 전환 시 비로그인 admin 읽기 노출 차단(현재 바이패스 통과).
   - **FactCard URL 스킴 화이트리스트**(Claude P0/codex P1): `safeHref` http/https만 링크, 그 외 텍스트 폴백 + rel noopener. javascript: XSS 차단.
   - **selectedBy 감사필드 위조 차단**(codex P1): topicRun 3곳 `selectedBy: ownerId` 강제(클라 입력 무시).
   - **.env.example `DEV_OWNER_BYPASS=0`**(양쪽 P1) + **auth.ts `import "server-only"`**.
   - **jsonb payload 캐스팅 방어**(3리뷰 합의): CandidateBody·ProposalSelector EditFields — `outline`/필드 옵셔널 가드·빈 폴백·컨트롤드 입력 `?? ""`.
   - **soft-cap 재개 단계 서버 판정**(codex P1): **migration 13 `paused_stage` 컬럼 ✅ 적용완료(2026-06-19, SQL에디터 수동)** — pause 시 단계 보존, `resolveResumeStage`(보존값>research_facts 폴백)로 서버가 판정. `resumeRunAction` stage 인자 제거, RunControls 단일 "재개" 버튼.
   - **리서치 UX 정합성**: `research_ready`에서 fact 미리보기(RESEARCH_LOADED에 추가), `research_review`에서 rv=null(로딩)과 검수0건 구분.
2-0. ✅ **에러 영속 캡처 층 추가(2026-06-19, 실사용 디버깅용)** — 4표면 공통 싱크 `logs/errors.jsonl`(gitignore): `src/lib/observability/captureError.ts`(node 동적import·throw안함) + `src/instrumentation.ts` `onRequestError`(서버/RSC/액션) + Inngest `onFailure` 5함수(`src/inngest/onFailure.ts`, inngest에 `(failure)` 등록 확인) + `error.tsx`·`global-error.tsx`→`/api/client-error`(클라 렌더). 비용캡 등 정상흐름은 미캡처. 스모크 검증 완료.
2. **실제 테스트 검토(라이브 E2E)** ← **다음**: `pnpm inngest:dev` + `pnpm dev`로 한 편 실주행 — 새편시작→촉이주제선택→훅이/구다리→셜록 트리아지(에스컬레이션 승인/반려)→짠펜 검수→approved. 화면 실동작·새로고침 흐름·비용/lineage 표시·kill switch/재개 확인. (개발 $0: claude-p+fixtures. **주의**: `.env`의 `DEV_OWNER_BYPASS=1` 유지해야 로그인 없이 동작.)
3. 커밋(7건 수정) → E2E에서 추가 P0/P1 나오면 수정 → 재검증 → PR 머지(또는 main 반영).

> `docs/tech.md` v0.3 — 실 DDL·enum·TTL·에이전트 I/O·반장 상태머신·인젝션·트리아지·말투·ingest·학습 코퍼스 규칙 + **DB 검토 반영(정적/동적 3분류·config_registry·lineage/provenance FK 조인 정규화·누락 FK·unique·contents 단일척추·L1 불변성)**. 남은 미확정은 tech.md §15.
> DB 검토: 내 검토 + Codex 병렬검토 합의 — 배열 lineage·섬·고정값 혼재를 v0.3에서 정규화로 해결.

---

## ▶ 다음에 바로 진행할 작업 (NEXT)
_직전 완료(2026-06-18): **Phase 1 전체 완료**(DB·TS타입·ingest corpus8/자막8/댓글4092/owner시드·contents척추) + 런타임 계약 명문화 + next 15.5.19 보안패치. 모두 푸쉬(…→ec4defb)._

### ▶▶ Phase 2 진행 — 에이전트 + 반장 파이프라인
**합의 확정(2026-06-18): (i) 말투→촉이 순서 / (ii) Inngest는 촉이 슬라이스에서 골격째 함께.**

1. ✅ **말투 추출(tone_profile) 완료** — corpus 8편 스크립트 → `tone_extractor`(role 추가, opus) → `callLLM` 1회 → 8 components(vocab·sentence_length·rhythm·hooks·phrases·banned·persona·easy_explain). **DB 저장: `tone_profile v1`(status=draft) + `profile_training_sources` 8편(provenance)**. 코드: `src/agents/tone_extractor/schema.ts`(스키마+추출프롬프트) + `scripts/extract-tone.ts`(dry-run/--commit, fixture record로 재실행 $0). 산출 검수파일: `corpus/tone/`. 코퍼스 인용 근거로 채워짐(짠하!/찐짠이들/도시락=ETF 등). `tsc0/14테스트`.
   - **남은 사람 게이트**: draft → **active 승격**(짠펜이 쓰려면 필요. 짠펜 미구현이라 비차단).
2. ✅ **촉이(topic_scout) 수직 슬라이스 + Inngest 골격 완료(2026-06-18)** — `created→[촉이]→topic_proposed→[선택]→topic_selected` 전구간 $0(claude-p) 관통 검증.
   - **재사용 spine(`src/pipeline/`)**: `stageContract.runProposalStage`(§8.1 골격: DB읽기→prep→callLLM≤1→proposed저장→전이→cost_ledger flush, 멱등 메모이즈) · `gate.selectProposal`(사람게이트=상태전환만) · `runState`(전이가드+낙관잠금) · `stages`(단계 디스크립터). **훅이·구다리는 이 spine 복붙 + prepare/schema만 작성.**
   - **촉이(`src/agents/topic_scout/`)**: schema+system+prepare+stage. prepare가 **댓글 원문 비전송**(governance C) — 코드로 키워드 빈도 집계(조사 스트립·like 가중·질문카운트)만 LLM에 전달. 실측: 파킹통장117·ISA118 등으로 5개 주제 제안, 전부 evidence_ids 보유.
   - **Inngest(`src/inngest/`)**: client(이벤트버스) + `functions/topicStage`(step.run 1회 durable, 검증스크립트와 동일 runProposalStage 호출) + `app/api/inngest/route.ts`(serve). 설치=inngest@3.54.2(pnpm; TS peer 때문에 npm 불가). **next.config extensionAlias(.js→.ts)** 추가(webpack이 src .js import resolve).
   - **Server Action(`app/actions/topicRun.ts`)**: startTopicRun(content+run생성→이벤트발행)·selectTopic. ⚠️owner 인증 TODO.
   - 검증: `scripts/run-topic-slice.ts`(npm: `slice:topic`). `tsc0/14테스트/next build` 그린. 라이브 실행=`pnpm inngest:dev`+`pnpm dev`.
   - **남은 것**: UI 페이지(버튼)=Phase 3 대시보드. owner 인증 와이어링.
3. ✅ **훅이·구다리 팬아웃 완료(2026-06-18)** — spine 복붙으로 2단계 추가. 슬라이스가 이제 `created→[촉이]→topic_selected→[훅이]→titles_selected→[구다리]→structure_selected` 3단계 전구간 $0 관통.
   - **훅이(`src/agents/hook_maker/`, title_thumb)**: prep=선택주제+tone_profile+과거제목(corpus title) 레퍼런스+TRUS 썸네일 제약. 출력=제목3안+썸네일 layout/copy. 실측: 김짠부 말투 제목("찐짠이들·짠부가 직접·500만원 직접계산")+tone:v1/ref 근거.
   - **구다리(`src/agents/structurer/`, structure)**: prep=선택주제·제목+structure insights+tone.easy_explain. 출력=구성2안(서로 다른 approach)+섹션(section/goal/why, 이해흐름: 순서·불안완화·오개념선제). 실측: "숫자체감먼저" vs "오개념타파먼저".
   - **공통 헬퍼 `src/pipeline/context.ts`**: getSelectedStagePayload(이전 단계 선택값, 수정본 우선)·getToneProfile(active>draft). Inngest 함수 3종 + `_shared.executeProposalStage` + 이벤트 3종 + Server Action(request/select ×3). tsc0/14테스트/next build 그린.
4. ✅ **셜록 셀 완료(2026-06-18)** — fan-out/join 골격 + 검색 어댑터 + 7무결성가드 + 트리아지 게이트. 슬라이스가 `…→structure_selected→[셜록]→research_ready→[검수]→research_approved`까지 관통.
   - **검색 어댑터(`src/search/`)**: `search()` = mock(결정적·$0) / **tavily(실검색, 키 작동 확인)** 스위치 + fixture(tavily 응답 리플레이 $0). callLLM과 동형. 한국공식도메인 includeDomains(§9-⑥). Perplexity는 비움(선택).
   - **셜록 5에이전트(`src/agents/{sherlock_lead,fact_verifier,numbers,analogist,critic}/`)**: scope(claims/concepts 분해) · 팩트검증가(검색+인용실재 판정) · 셈이(숫자+코드검산) · 유이(비유+왜곡검증) · 반론(빠진관점·반대근거).
   - **`src/pipeline/researchCell.runResearchCell`**: scope→[팩트검증가(claim별 search) ‖ 셈이 ‖ 유이] **Promise.all 병렬**→**코드 리콘실(7가드 강제**: isVerifiedValid 강등·mock/인용부재→could_not_verify·독립출처카운트·math 검산)→**§11 트리아지**(금융·미검증·stale→escalated)→반론→research_facts+explanation_assets 저장→research_ready.
   - **트리아지 게이트(`researchGate.ts`)**: ready→review→approved, 에스컬레이션 fact만 사람 검수(human_approved). Inngest research 함수 + 이벤트 + Server Action(request/review/approve).
   - 실측(tavily): fact 4(전부 금융→검수, **거짓 verified 0건**=가드 정상), asset 10, 반론이 변동금리·종합과세 누락 포착. tsc0/14테스트/next build 그린.
5. ✅ **짠펜 완료(2026-06-19)** — **전체 파이프라인 관통**: `…research_approved→[짠펜]→script_ready→[검수]→approved`. 한 편이 주제→완성 대본까지 완주.
   - tone_profile v1 **active 승격**(`scripts/activate-tone.ts`). 짠펜이 사용.
   - **`src/agents/scribe/`** + **`src/pipeline/scriptCell.runScriptStage`**: outline+승인facts(human_approved OR 자동verified)+explanation_assets+tone → script_segments. **lineage 저장**(script_segment_facts·_explanation_assets, used_in_script 마킹). **가드**: freshness 사전게이트(stale→scripting→researching rework), **표절**(`scriptGuards.containment` 문자5-gram 포함도, 임계 0.6), 말투/쉬운설명은 프롬프트+asset 링크로. delete-before-insert 멱등+전이 마지막.
   - `scriptGate`(ready→review→approved | rework) + Inngest scriptStage(concurrency 1/run) + Server Action 4종. 실측: 8 segment, 김짠부 말투("짠하!/찐짠이들/오키?/주차 비유"), 표절 0.42, lineage 연결. tsc0/46테스트/next build.
6. ✅ **반장 마감 완료(2026-06-19) → Phase 2 닫힘** — 비용 2단캡·max_rework·kill switch 파이프라인 연동.
   - **per-run 비용캡**: `CostGuard.seed(runId, run.cost_usd)`로 캡을 편 전체 누계 기준화. `runGuards.runStageGuarded`가 모든 단계 실행을 감싸 SoftCapPause→`paused_soft_cap`(사람 확인) / HardCap→`aborted`. researchCell fan-out .catch는 캡 에러 재전파(강등 안 함).
   - **max_rework=2**: `bumpRework`(durable 카운터) — scriptCell stale rework + scriptGate 수정요청에 연결, 초과 시 abort.
   - **kill switch**: `abortRun`(어느 상태든→aborted, 사유 기록) + Server Action `abortRunAction`/`resumeRunAction`(softAck 재개).
   - ✅ **migration 12 적용 완료(2026-06-19)**(`rework_count`·`abort_reason` 컬럼) — SQL 에디터 수동적용 완료.
   - tsc0/50테스트(CostGuard.seed per-run 캡)/next build. **전체 파이프라인 created→approved 여전히 그린**.

**▶ Phase 3 대시보드 진행 중** (Server Action·게이트·가드 모두 코드로 존재 → UI만).
- ✅ **3.1 셸 + 런 목록 + 새 편 시작 완료(2026-06-19)** — 결정 a(개발용 owner 바이패스)·3.1부터 시작.
  - **인증(결정 a)**: `auth.ts`에 `DEV_OWNER_BYPASS=1`(+NODE_ENV!=production 이중가드) → `requireOwner()`가 시드 owner id 반환. 로그인 UI 없이 대시보드 액션 허용. `isDevBypass()`로 배너 노출. ⚠️배포 전 진짜 인증 필요(Phase 5). `.env`/`.env.example`에 플래그.
  - **읽기**: `src/lib/dashboard/queries.ts`(server-only, admin 클라이언트) `listRuns()` — production_runs + contents 별도조회 코드조인(database.types Relationships 비어 임베드 타입추론 안 됨). `labels.ts`=STATE_LABEL(18상태 한국어)+runTone.
  - **UI**: `layout.tsx` TRUS 헤더 네비 + `page.tsx`(force-dynamic) 런 목록(상태뱃지·비용·재작업·중단사유)·빈상태 + `components/NewRunButton.tsx`(client, startTopicRun+router.refresh, 주제 선택입력).
  - tsc0/55테스트/next build 그린. `/`=ƒ Dynamic. 라이브=`pnpm inngest:dev`+`pnpm dev`.
- ✅ **3.2 런 상세: 제안→선택 완료(2026-06-19)** — `/runs/[id]`에서 topic·title·structure 제안→선택 루프.
  - **읽기**: `runDetail.ts` `getRunDetail()`(run+content+단계별 최신 proposal·selection). `proposalTypes.ts`(payload 타입+PROPOSAL_STAGES+STAGE_TITLE 공용).
  - **컴포넌트**: `ProposalSelector`(client, 후보 라디오선택+수정필드(단계별)+한줄이유→select 액션, editedPayload는 원안과 다를때만 전송=§8.4 델타) · `CandidateBody`(순수, 서버요약+클라 공용) · `ThumbnailCanvas`(순수, 썸네일 3안 TRUS 캔버스 초안) · `RequestStageButton`(다음단계 request) · `RefreshButton`(durable 비동기→수동 새로고침).
  - **페이지**: 상태별 단계 렌더(선택됨 요약/활성 선택기/시작 버튼/대기), paused·aborted 배너, 리서치 진입버튼(structure_selected→requestResearch). 목록 RunRow→상세 링크.
  - tsc0/55테스트/next build 그린(`/runs/[id]`=ƒ Dynamic).
- ✅ **3.3 리서치 트리아지 승인 완료(2026-06-19)** — 위험기반 검수(§11, 전건 X).
  - **읽기**: `researchView.ts` `getResearchView()`(research_facts 전체+escalated 분리+autoPassedCount, explanation_assets). `labels.ts`에 VERIFICATION/SOURCE_TIER/FRESHNESS 한국어 맵.
  - **컴포넌트**: `FactCard`(순수, 무결성 뱃지: 검증상태·금융·tier·freshness·독립출처·인용확인·검수대상·승인/반려·인용excerpt·출처링크) · `ResearchReview`(client, 에스컬레이션 fact만 승인/반려 토글 기본승인→approveResearchAction{approveFactIds,rejectFactIds}) · `EnterReviewButton`(research_ready→openResearchReview) · RequestStageButton에 script 추가.
  - **페이지 ResearchSection**: structure_selected→리서치시작 / researching→대기 / research_ready→검수시작 / research_review→트리아지(escalated 0건이면 ApproveAllInline)+전체fact·asset패널 / 승인후→읽기패널. **ScriptSection**: research_approved→대본작성시작(requestScript) / scripting·script_*→대기(3.4) / approved→완료.
  - tsc0/55테스트/next build 그린(`/runs/[id]` 4.37kB).
- ✅ **3.4 짠펜 검수 + lineage + 비용 뷰 완료(2026-06-19) → Phase 3 닫힘 🎉** — 대시보드로 주제→완성대본 전 과정 조작 가능.
  - **읽기**: `scriptView.ts` `getScriptView()`(script_segments + segment별 fact/asset **lineage** 조인) + `getCostView()`(cost_ledger 카테고리별 합계+총액+엔트리). `labels`에 COST_CATEGORY 맵.
  - **컴포넌트**: `EnterScriptReviewButton`(script_ready→openScriptReview) · `ScriptReview`(client, 최종승인/수정요청(confirm)→approve/requestScriptRework) · `SegmentList`(순수, 단락+lineage 칩: fact claim·숫자/비유 asset) · `CostPanel`(순수, 총액·카테고리·엔트리, SOFT$7/HARD$10 맥락) · `RunControls`(client, **kill switch** 중단 + **paused_soft_cap 재개**(리서치/스크립트 선택)).
  - **페이지**: ScriptSection(research_approved→대본시작 / scripting→대기 / script_ready→검수진입+세그먼트 / script_review→승인·수정요청+세그먼트 / approved→완성+세그먼트) · CostSection(엔트리 있으면 항상) · 헤더 RunControls(aborted 배너 별도).
  - tsc0/55테스트/next build 그린(`/runs/[id]` 5.22kB).
  - **▶ 다음**: Phase 4(회고&발굴) — 또는 운영 라이브 E2E(inngest:dev+dev로 한 편 실주행)·진짜 Supabase 인증 와이어링(바이패스 제거)·실시간 구독(현재 수동 새로고침).

**Phase 2 기반(이미 있음):** callLLM(claude-p $0/api)·roles.ts(role_id·tool화이트)·enums.ts(상태머신)·비용2단캡·ajv스키마·fixtures리플레이·Phase1 데이터(corpus·자막·댓글·contents척추).
**가로지르는 강제:** 7무결성가드·최신성엔진·인젝션방어·검색API(Tavily+한국공식+Perplexity, 셜록단계서 키 필요).
**비용:** 개발 $0(claude-p+fixtures). 운영 전환은 Phase 2 말 골든 A/B.

---
_(이하 과거 진행 기록)_

**Phase 0 코어 = ✅ 완료(미커밋)**: Next.js15+Tailwind v4 + TRUS 토큰 · `callLLM()` 어댑터(claude-p/api) · 비용 2단 캡+**preflight 예약**(병렬 누수 차단) · fixtures 리플레이($0) · ajv 스키마 강제 · enum+전이가드+verified규칙 · role_id 레지스트리+tool 화이트리스트 · 댓글 HMAC · parity 스파이크(12 테스트). `tsc 0 / vitest 12 / next build` 그린.

**▶ 다음**:
- ✅ Phase 0 완료: 부트스트랩(ebd755d) + 코드리뷰 P1×8 수정(1b82b4d) + **parity:live 실증·claude-p 격리 수정(a499148)**
- ✅ parity 확인: claude-p(격리·구독무료) ↔ Anthropic API 스키마 통과·키 동형. claude-p는 cwd=tmp+`--system-prompt`+`--setting-sources ""`로 격리 호출(CLAUDE.md·훅 오염 차단)
- ⚠️ 노출된 OpenAI 키 rotate 권장. .env에 ANTHROPIC_API_KEY 설정됨(커밋 안 됨)

**Phase 1 DB = 마이그레이션 SQL 11개 작성 + 이중검토 완료(미적용)**: `supabase/migrations/` 01~11 + README. §17 DB강제분 전부 반영. GPT-5.5 codex 검토 → P0×2(app_role 순서·자가승격 차단) + P1×8(verified NULL-safe·전이 INSERT가드·L1 insert-only·불변FK충돌·HMAC NOT NULL·pts CHECK·owner쓰기) 수정 커밋 074a71e.

**Supabase 적용·검증 완료(2026-06-18)**: SQL 에디터로 `_apply_all.sql` 적용(예약어 `window→metric_window` 1건 수정 후 성공). `scripts/db-verify.ts`로 service-role 검증 — config 9·핵심테이블·전이38 OK. 프로젝트 ref `hcuwptjaywkchtwhqymj`. SUPABASE_DB_URL 없이 SQL에디터 수동적용 방식 채택.

- ✅ (a) DB→TS 타입 완료(`src/lib/supabase/database.types.ts` 28테이블, admin/server/browser 연결, tsc0/14테스트)

**✅ ingest 레이어 완료 (Phase 1, 2026-06-18)**:
- ✅ (b) **구글독스 8편 파싱**(`scripts/ingest-corpus.ts`, 순수 코드·$0) → corpus_editions 8 + corpus_components 48 + **contents 척추 8행(source=imported, youtube_video_id)**. NFC·base64이미지·변형 처리.
- ✅ (c) **YouTube ingest**(`scripts/ingest-youtube.ts`): 자막 8편(youtube-transcript) + 댓글 4092개(Data API v3). **youtube_video_id로 척추 매칭**(스크립트↔자막↔댓글). 거버넌스: author 미보관·HMAC.
- ✅ (d) **owner 시드**(`scripts/seed-owner.ts`): dddungpal@gmail.com → role=owner(service-role 승격). owner 1명.
- **▶ 다음 = Phase 2** (셜록 셀·짠펜·촉이·훅이·구다리 에이전트 + 반장 Inngest 파이프라인 — §8 런타임 계약 적용).
- ⚠️ **노출 OpenAI 키 rotate 권장** (platform.openai.com)
- Phase 1: Supabase 마이그레이션(§17: FK순서/DEFERRABLE·RLS정책·verified CHECK·hot FK 인덱스) · ingest · 콜드스타트 시드
> ⚠️ 구현 시 tech.md §17 준수. P0 2건 문서수정 완료, P1 8건 중 **코드 강제분(비용 preflight·state enum/전이가드·verified규칙·HMAC·인젝션 델리미터·role tool 화이트리스트)은 Phase 0에서 선반영**, DB 강제분(FK순서·RLS·CHECK·인덱스)은 Phase 1 마이그레이션에서.

### ✅ C 확정 추가 (2026-06-18 · 런타임 계약 명문화)
사용자와 구조 토론 → `tech.md §8(8.1~8.4)·§18` + `ARCHITECTURE.md`에 명문화(코드는 Phase 2~3).
- **흐름**: 요청 → 백엔드 결정적 로직 → DB저장 → 이벤트 트리거 → AI 1회(준비된 데이터 위) → 결과 DB저장(proposed) → 사용자 컨펌 → DB update(selected). **AI는 데이터 수집기로 안 씀**, 단계당 1회.
- **단계 계약(§8.1)**: 모든 에이전트 단계 동일 골격(DB읽기→prep→callLLM≤1→DB저장→전이→게이트). **저장 후 표시**(컨펌 전 proposed 저장 → 컨펌=상태전환만 → API 1회 보장).
- **트리거(§8.2)**: 버튼=단계경계/사람게이트에만. 버튼→ServerAction→DB→이벤트. 멱등성·버튼상태=DB파생.
- **durable·재연결$0(§8.3)**: AI는 서버 durable 파이프라인, 클라이언트 연결과 분리. 읽기=$0·게이트대기=waitForEvent=$0·끝난단계=메모이제이션. **생성↔전달 분리**(auto-research-agent deliver.ts 패턴).
- **학습 입도(§8.4)**: 처음(proposed)↔최종(selected) 델타 + selection_reason × 성과 가중. 중간 수정은 진단용(proposal_revisions, append-only) — **학습 미투입**.
- **채널(§18)**: 채널=얇은 어댑터(동일 이벤트버스+DB state). **Slack=인터랙티브 1순위**(Block Kit·서명검증·owner전용·dedup) / **카톡=알림 전용**(메모 API "나에게 보내기"·무료, `auto-research-agent/src/lib/{kakao,deliver}.ts` 토큰관리·생성전달분리 재사용).

### ✅ B 확정 추가 (2026-06-18 · 문서 초안)
- **principles.md v0.1**: 북극성·제1원칙(선택vs이유)·3층·학습루프(코퍼스≠골든셋)·**혼동방지 원칙 격상**(사실/생성/추정 경계·말투≠내용·최신성·7가드)·비용/개발·크루·TRUS.
- **governance.md v0.2**: 댓글 **작성자 미보관(본문만)** · 원본 무기한+삭제요청 파기+**저장량 알림** · 외부전송 **C안**(댓글 원문 LLM 비전송 — 집계·키워드 신호만) · 자격증명 프롬프트 금지 · API 경로만.

### ✅ A 확정 추가 (2026-06-17 · §15 닫힘)
- **구글독스**: 단일 롤링 문서(탭 기능, **1탭=1편**)·**8편 완성·전부 정보형**. 새 편은 **수동 export import**(자동 Drive API 동기화는 Phase 5 연기). 문서ID `1N7Cd3jeOLOVg0M1CtdXZwY4vOcwbbue1p1BHITjXSsI`.
- **골든 v1(동결 스냅샷, ≠코퍼스)**: 정보형 롱폼 **8편 전체** — ISA(3.22)·대출vs투자(4.6)·파킹통장(4.14)·사회초년생5단계(4.21)·채권ETF(4.29)·나스닥(5.26, 제목 ingest시 확정)·ETF Q&A(6.5)·ISA 3년만기(6.9). 코퍼스는 계속 축적, 골든은 버전업(v2…). N=8이라 hold-out 회귀탐지는 9편째부터.
- **비용캡**: 2단 — SOFT **$7**(사람 확인) / HARD **$10**(중단). max_rework=**2**.
- **편당 비용 추정(미측정)**: 목표 ~$5–9 / 상한 ~$18–25. Phase 0 원장이 첫 운영 편 실측.
- **운영 모델**: Opus vs GPT-5.5 등은 **Phase 2에서 골든 v1로 말투·비용 A/B** 후 결정(`callLLM()` 단계별 혼합 가능).
- **기본값 승인**: 트리아지 독립출처 **≥2** · A/B margin **10%/3%** · 검색 API **Tavily+한국공식도메인 직접 fetch+Perplexity**.

---

## ✅ 확정된 결정 (요약)
1. **모델 전략**: RAG로 시작 → 김짠부가 "됐다" 하면 **단계별 AX 전환**(정성적). AX 우선순위 = **말투내재화 > 선제제안 > 자율성**.
2. **결과물**: 웹 대시보드(Next.js+Vercel) + **TRUS Create 디자인**. 2단계 썸네일은 디자인 스펙 기반 **HTML 캔버스 실물 3안**.
3. **크루(하이브리드)**: **반장**(총괄PD) / **촉이**(주제) / **훅이**(썸네일·제목) / **구다리**(구성) / **셜록**(리서치) / **짠펜**(스크립트).
4. **비용 모델(C안)**: 개발=`claude -p`(구독·정액·공짜 무한반복) / 운영=API(편당 ~$20). `callLLM()` 어댑터로 스위치.
5. **파이프라인**: Vercel + **Inngest(durable)**. 개발은 fixtures 리플레이로 과금 0.
6. **데이터**: 전용 Supabase DB 신설 + 옆 프로젝트/구글독스/유튜브에서 **필요분만 ingest 동기화**.
7. **팩트체크**: 출처명시 + 교차검증 + 사람 최종확인.
8. **YouTube**: 김짠부=운영자 → Data API + Studio Analytics 풀 접근 (OAuth 연결 필요).
9. **학습자료**: 구글독스 과거 스크립트(말투) / "왜 골랐나" 주관식 인터뷰(선택패턴) / 촬영대본=스크립트 / 자막=유튜브 링크.

## 🗂 데이터 구조 (3층 · v2)
- **L1 raw**: script_imports, transcripts, comments_raw, topic_interviews, research_sources, reference_media
- **L2 structured**: contents, production_runs(+prompt_version·model·context_snapshot·latency_ms·as_of_date), stage_proposals, stage_selections(+selection_reason), research_facts(+source_tier·verification_status[+could_not_verify]·conflicting·human_approved·is_financial · **최신성: as_of_date·source_published_at·data_reference_period·volatility[static/slow/fast]·freshness·recheck_after** · **무결성: primary_source_url·independent_origin_count·quote_excerpt·citation_verified·misleading_check·escalated_to_human**), performance_metrics(+A/B CTR), **explanation_assets(NEW: kind·numeric_example·analogy·source·verified·math_verified·distortion_checked·used_in_script·landed_score)**, **topic_candidates(NEW)**, comments_structured, entities/events/relations/evidence
- **L3 knowledge**: insights(+analogy 카테고리), retrospectives, tone_profile(+components: 어휘·문장길이·리듬·후킹·표현·금칙어·페르소나·쉬운설명톤), selection_patterns, agent_graduation, cost_ledger, **eval_runs(NEW: +이해도)**, **data_gaps(NEW)**
- **핵심 패턴**: 제안 N개+이유 → 선택+수정 기록 → 회고 성과연결 → 인사이트 승격

## 🔍 셜록 리서치 셀 + 최신성 엔진
- **셜록 = 리서치 팀장**: 스코핑 → 병렬 fan-out → 리콘실(조인).
  - 병렬: **팩트검증가**(교차검증·출처) · **셈이**(숫자: 수치·계산+산술/단위/시점 검증, 코드 검산) · **유이**(비유: 일상비유+왜곡검증).
  - 조인: 정합성 교차검사(비유⟷사실 모순 X, 숫자 검증통과) → 충돌은 해당 전문가만 rework. *팬아웃→조인*(완전 병렬 아님).
  - **D. 반론·완전성 패스**: 빠진 것·반대근거·회의론 → 반대증거 검색(확증편향 차단·사고확장).
- **리서치 무결성 7대 가드(airtight)**: ①출처 독립성(원출처 추적·independent_origin_count) ②인용 실재 검증(fetch+quote_excerpt+citation_verified, 없으면 폐기) ③반론 패스 ④우아한 실패(could_not_verify·날조금지→짠펜 차단) ⑤통계 오용 검증(셈이: 명목/실질·세전후·평균함정·체리피킹·복리) ⑥1차 출처 우선+한국 현행(국세청·금융위·한은·통계청·법령) ⑦위험기반 사람검수 트리아지(금융·수치·충돌·미검증·stale만 에스컬레이션).
- **최신성 엔진 (오늘=2026-06-17)**: as_of 스탬프 · volatility(static/slow/fast)→TTL(금리·시세=fast 매번 재확인, 개념=static) · **모델 컷오프(2026-01) 이후·시변 정보는 라이브 검색 강제** · 짠펜 freshness 게이트(TTL 초과 차단→재확인) · TTL 인지 캐싱.

## ★ 콘텐츠 북극성 (반드시)
합격 기준 = **"처음 듣는 사람도 편안하게 듣다 보니 이해됐다."**
- **셜록(리서치 의무)**: 핵심 개념마다 ≥1 **숫자 예시** + ≥1 **쉬운 비유**(예: "ETF=토핑 여러 개 한 판 피자") 발굴·검증·출처 → `explanation_assets`.
- **짠펜(쉬운 설명 가드)**: 낯선/추상 개념은 숫자예시·비유를 **먼저** 제시 후 설명. 미충족 시 생성 차단 → 반장이 셜록 재호출.
- **eval 이해도**: explainer 커버리지 + 댓글 "쉽게 이해됐다/어렵다" 신호 → 통한 비유는 `insights.analogy`로 승격.

## 🧩 설계 보강 (검토 반영 v2)
1. **팩트엔진(셜록)**: claim 분해→교차검증→신뢰등급→claim별 사람승인. 🟡 금융정보 강검증+시점표기.
2. **학습검증(eval)**: 골든셋 회귀·말투충실도·제안품질 → "학습 건강도" 패널.
3. **말투 메커니즘**: 구성요소 분해→코퍼스 추출→유사도 few-shot→말투 가드.
4. **댓글→주제**: 댓글 마이닝→topic_candidates 자동승격→촉이.
5. **데이터격차 제안**: data_gaps 진단→수집 제안 큐.
6. **속도**: 촉이 배치 사전계산·셜록 병렬·스트리밍·SLA(latency).
7. **A/B 회수 + 비선형 rework**: 실측 CTR→훅이 환류 / 반장 단계 재호출.
- 🟢 재현성(버전·스냅샷)·콜드스타트 시드·선택이유 한 줄 캡처.

## 📚 학습 코퍼스 규칙 (구글독스 기반 · 확정)
- **출처**: 김짠부 롤링 구글독스(편 누적) → 편 구분자로 분리 → `corpus_editions`/`corpus_components`.
- **상태**: 🟢완료=학습대상 / 🔴작업필요·⚫작성중=제외.
- **컨셉**: **정보형만** 학습. VLOG형·hybrid(정보+VLOG) 통째 제외. 인스타 무물·썰(숏폼) 제외. **롱폼 1차**.
- **branded**: 협찬은 **직교 플래그** — 정보형이면 학습.
- **컴포넌트 분리 학습**: 제목·썸네일문구·더보기 → `style_profiles`(훅이), 스크립트 → `tone_profile`(짠펜). 각자 독립 코퍼스.
- **A/B 학습(지연·가중)**: 썸네일/제목 3안 → 업로드 ~d7 후 % 회수 → `weight·margin·decisiveness` 가중. inconclusive(격차<3%/노출부족)면 학습 보류. (Codex F4 해소)
- **골든셋**: 🟢 info 롱폼에서 말투+이해도+A/B 성과 기준 10~15편 (선정 대기).
- 상세 스펙: `docs/tech.md` §3.5·§13.1·§13.2.

## 🛡 Codex 교차검토 반영 (v3 — P1+P2 전부, 단계 태그)
- **보안·신뢰·거버넌스**: 프롬프트 인젝션 방어[MVP] · 데이터 lineage(script_segments)[MVP] · 파서 전략+아카이브(source_documents)[MVP→하드닝] · 검색 fallback[MVP] · 개인정보/동의/보관 거버넌스[MVP] · 감사·백업(audit_log)[하드닝]
- **비용·실행**: claude -p 레이트리밋 한계 명시 · dev/prod parity 운영모델 최종검증 · $20=상한가드(전체비용 원장) · 무거운 작업 전용 워커[하드닝]
- **AX·학습**: AX 정의 못박기·학습 파이프라인·롤백[하드닝] · eval 엄밀화(라벨·평가자·합의도)[축소MVP→하드닝] · 말투 표절/과적합 가드[MVP]
- **데이터모델**: MVP 최소셋(지식그래프·eval_runs·selection_patterns 연기, lineage 먼저) · enum/판정 루브릭 · stable role_id · context_snapshot hash저장 · quote 저작권
- **리서치 금융**: research_facts +effective_date·applies_to·grace_period·bill_status(E1) · 원출처 추적[하드닝] · 검색 API 확정(범용+한국공식도메인+Perplexity)
- **발굴·지표·품질**: topic_candidates +트렌드·경쟁채널·경제캘린더 · attribution 한계표기 · 댓글 약신호 보정 · 이해도=순서·맥락·불안완화·오개념제거·속도까지
- **자산**: 썸네일 canvas는 초안(실사진 합성 별도) · YouTube 토큰 암호화·quota
- **최대 리스크(두 모델 합의)**: 틀린/낡은 금융 claim을 그럴듯하게 포장 배포 → lineage+금융최신성+우아한실패가 방어선. (면책·투자조언 경계 등 컴플라이언스는 시스템 밖 운영자 책임)

## 📋 남은 작업 (BACKLOG v3)
- [ ] **Phase 0** 부트스트랩·문서5종(+governance)·callLLM+parity검증·전체비용/지연 원장·enum 루브릭·role_id ← **다음**
- [ ] **Phase 1** MVP 최소 테이블 + lineage(script_segments)·source_documents + ingest(토큰암호화·PII거버넌스) + 콜드스타트 시드
- [ ] **Phase 2** 셜록 셀(팩트검증가·셈이·유이→조인+반론+최신성+금융심화+무결성7가드+**인젝션 방어**+검색 fallback+**검색API 확정**) → 짠펜(+표절가드+이해도 확장) → 촉이·훅이(썸네일=초안)·구다리, 반장 rework 가드(재시도·비용상한·중단)
- [x] **Phase 3** 대시보드: 제안→선택+한줄이유, 썸네일 3안, **위험기반 claim 트리아지 승인**(전건 X), lineage·비용 뷰 ✅(2026-06-19, 4슬라이스)
- [ ] **Phase 4** 회고&발굴: 성과+댓글(Cron)→마이닝→topic_candidates(+트렌드·경쟁·경제캘린더)→회고→인사이트→차기주제, A/B 약신호·attribution 한계표기
- [ ] **Phase 5** 하드닝: 지식그래프·audit_log·원출처추적·전용워커·파서확장 / eval 엄밀화 / AX 정의·학습·롤백 / 수동 졸업

## ❓ 열린 항목 (결정 필요, 비차단)
- ~~구글독스 전달 방식~~ → **확정**(수동 export, 단일 문서 8편)
- ~~셜록용 검색 API~~ → **확정**(Tavily+한국공식+Perplexity, 커버리지 실측 Phase 2)
- 채택률/AX 졸업 게이트 수치 — **데이터 축적 후 튜닝**(정성 트리거 우선)
- A/B 최소 노출수 임계 — **d7 데이터 후 튜닝**
- 운영 모델(Opus vs GPT-5.5) — **Phase 2 골든 v1 A/B로 결정**
