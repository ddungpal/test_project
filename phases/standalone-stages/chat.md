
=== Step 0: standalone-deps-core ===
[리드] 자, 단독 실행 의존성 맵부터 만들자. 순수 모듈 하나(src/pipeline/standalone/deps.ts) — DB 없이 "각 단계가 진짜 필요로 하는 시드 입력"만 선언하고, selection payload shaping 헬퍼(topic/title/structure)까지. 맥스 맡아줘.
[Max] 소비 코드부터 다 읽었어. researchCell이랑 scriptCell이 구성을 outline:unknown으로 받고, topic/title은 {title}로 읽더라. structure 후보 payload는 {approach, outline:[{section,goal,why}]} 모양이고. 그 모양 그대로 맞춰서 시드 헬퍼 짤게.
[Max] 의존성 맵은 PIPELINE에서 enters 도출하게 할 거야. 하드코딩하면 나중에 어긋날 테니까. structure랑 research에는 썸네일 안 넣고.
[Max] deps.ts 신규로 만들었어. STANDALONE_DEPS는 PIPELINE에서 enters 도출하고, structure랑 research에 썸네일 안 들어가는 거 테스트로 박아놨어. 헬퍼 셋(topic/title/structure)도 소비 모양 그대로.
[Max] 순수성 테스트 처음에 한 번 헛발질했어. 주석에 "Supabase" 단어 써놨더니 그게 걸리더라고. import 줄만 보게 고쳤어. …내 발등 내가 찍을 뻔.
[Max] typecheck 0, test 598개 다 통과(0). 기존 거 안 깨졌고. 놓친 거 있으면 말해줘.
[리드] 나도 AC 직접 돌려봤어. typecheck exit 0, test exit 0(598개). 조이, 검수 좀 부탁해.
[Joy] 오 맥스 Step 0 깔끔하다~ git diff 보니까 기존 파일 안 건드리고 신규 모듈만 딱 추가했네 굿굿
[Joy] typecheck exit 0, npm test 54파일 598개 전부 통과! standaloneDeps 12개도 다 초록불 떴어
[Joy] STANDALONE_DEPS 표 명세랑 한 줄 한 줄 대조했는데 structure랑 research에 썸네일 안 들어간 거 정확하고 제목 optional도 맞아
[Joy] enters를 PIPELINE에서 도출한 거 센스있다 하드코딩 안 해서 drift 걱정 없음
[Joy] 소비코드도 확인했어 researchCell은 title로 읽고 structurer/stage.ts:15가 approach+outline 만드는거랑 payload 모양 똑같아
[Joy] 순수성도 통과 deps.ts import가 enums랑 stages랑 schema 타입뿐이라 DB/llm 안 물려있어 테스트로도 막아놨네
[Joy] research_facts 행빌더도 안 만들고 SeedKind 분류만 했어 step3 격리 잘 지켰다 통과! 🎉
[리드] 좋아, Step 0 완료. PASS·exit 0 확인하고 index.json 갱신했어. 수고했어 둘 다.

=== Step 1: standalone-run-flag ===
[리드] 맥스, Step 1 부탁해. production_runs에 is_standalone 컬럼 추가하고 listRuns에서 단독 run 숨기는 거야. 순수 백엔드라 가볍게 가자.
[Max] Step 1 시작. 마이그레이션이랑 listRuns, database.types 다 읽었어. is_standalone은 state랑 직교라서 전이 트리거는 안 건드릴게.
[Max] 마이그레이션 1개 추가하고 database.types에 is_standalone 박았어. listRuns엔 select에 컬럼 넣고 .eq is_standalone false 필터만 걸었어. 상세 조회는 안 건드렸으니까 단독 run도 /runs/[id]로 잘 열릴 거야. 이제 AC 돌려본다.
[Max] typecheck 0, test 598개 다 통과(0), build도 0. 기존 거 안 깨졌어. git status도 깔끔하고 범위 외 파일 없어. 단독 run은 메인 목록에서만 숨고 상세는 그대로 열려. 놓친 거 있으면 말해줘.
[Joy] 오 맥스 빠르다 git diff 봤어 마이그레이션 한 줄짜리에 add column if not exists 멱등에 default false라 기존 행 다 false로 깔리네 깔끔
[Joy] 트리거랑 전이표는 grep해보니 주석에서 안 건드린다고 설명만 했고 실제 alter는 add column 딱 하나라 enforce_run_transition 무영향 통과
[Joy] is_standalone 사용처 전부 훑었어 마이그레이션 queries database.types 셋뿐이고 runDetail.ts는 id로만 조회해서 단독 run도 상세는 열려 listRuns만 필터 걸린 거 확인했어
[Joy] database.types는 Insertable 헬퍼로 Insert 자동 파생이라 Row에 컬럼만 추가하면 끝 step2에서 is_standalone true insert도 문제없어 똑똑하게 했네
[Joy] AC 내가 직접 다 돌렸어 typecheck 0 test 598개 그대로 0 build도 0 테스트 하나도 안 깎았고 마이그레이션 번호 26도 정확해 통과 🎉
[리드] 조이 PASS 확인했고 나도 AC 3개 직접 돌려서 전부 exit 0 봤어. Step 1 완료. 맥스·조이 수고했어 🎉

=== Step 2: standalone-seeder ===

=== Step 2: standalone-seeder ===
[리드] 다음은 시더야. 임시 run 만들어서 목표 단계의 enters까지 transitionRun으로 walk하면서, 사용자가 붙여넣은 입력만 stage_proposals+stage_selections에 LLM 없이 시드하고, 목표 단계 하나만 평소처럼 Inngest로 발사. 제안단계(topic/title/thumbnail/structure)+research까지. script는 명시 throw(step3). 맥스, 맡아줘 — 시드 중 callLLM 0회가 생명이야.
[Max] Step 2 시작. step0 deps랑 topicRun startSeedRun, transitionRun, getSelectedStagePayload, gate selectProposal 다 읽었어. 시드는 selectProposal 안 쓰고 직접 행 insert할 거야 — 그래야 enters까지 walk한 상태에서 stage별 selection을 동시에 박을 수 있어.
[Max] seed.ts(코어)랑 standaloneRun.ts(서버액션) 만들었어. 시드는 RUN_STATES 인접쌍을 created→enters까지 transitionRun으로만 walk하고, selection은 stage_proposals+stage_selections에 직접 박아. candidates[0].idx===0·chosen_idx===0이라 getSelectedStagePayload가 시드값 그대로 읽어.
[Max] 하나 걸린 거 있어. PIPELINE[title_thumb].event가 "run/title.requested"인데 실제 등록 함수는 "run/titles.requested"를 들어(stale drift). 내 범위에서 PIPELINE 고치면 딴 데 영향 위험해서, standaloneRun엔 topicRun이 쓰는 검증된 이벤트명 매핑을 따로 뒀어. 주석에 이유 남겼고 — 별도로 다뤄야 할 거 같아.
[Max] script 타깃은 "step3에서 구현"으로 즉시 throw. facts/assets는 안 건드렸어.
[Max] 테스트는 통합형 in-memory fake Supa로 짰어. research는 structure_selected, title_thumb는 topic_selected, structure는 optional 제목 입출력, 필수누락 throw, script throw, callLLM import 없음까지 8개. typecheck 0, test 606개(신규8) 다 통과. 기존 거 안 깨졌어. 놓친 거 있으면 말해줘.

[Joy] 오 맥스 step2 받았어! seed.ts랑 standaloneRun.ts 둘 다 봤는데 일단 구조 깔끔하다 굿굿
[Joy] callLLM/llm import는 주석에만 있고 진짜 import는 0회 확인. transitionRun만 쓰고 raw update({state}) 하나도 없네 깔끔
[Joy] RUN_STATES created→structure_selected 인접쌍 전부 ALLOWED_TRANSITIONS에 합법 경로인거 일일이 대조함. 통과!
[Joy] STANDALONE_EVENT 매핑도 등록 함수랑 다 맞아. title_thumb stale 이벤트 우회한거 타당하다 (hookStage는 run/titles.requested 듣는거 맞음)
[Joy] 이제 진짜 ground truth 간다~ typecheck랑 test 돌려볼게 ☕

[Joy] 결과 나왔다! typecheck exit 0, test 606 passed (598→606 딱 +8 신규) 🎉
[Joy] is_standalone=true insert / content=produced 확인, selection 계약(candidates[0].idx===0, chosen_idx===0)도 getSelectedStagePayload로 진짜 읽히는거 테스트가 증명함
[Joy] script 타깃 throw(step3 격리), required 누락 throw, optional 생략까지 다 커버. 범위 외 파일/fixture도 안 건드렸고
[Joy] 맥스 이번거 진짜 깔끔하다~ 통과! VERDICT PASS 👍
[Joy] 검수 9개 포인트 전부 통과! typecheck exit 0, test 606개(+8 신규) 다 초록불 🎉 시드가 llm 안 물고 transitionRun만 쓰는 것도, script throw도, title_thumb 이벤트 우회도 다 확인했어. PASS!
[리드] 굿. 맥스가 PIPELINE event drift까지 잡아서 우회한 게 좋았다. Step 2 완료 처리할게.

=== Step 3: standalone-script-seed ===
[리드] 맥스, step3 짠펜 단독 시드 차례야. 핵심은 scriptCell 게이트를 절대 안 건드리고, 게이트를 통과하는 행만 시드하는 거. facts는 human_approved=true·verification_status='unverified'로 넣어서 verified-CHECK 우회하고, assets는 number→math_verified, analogy→distortion_checked만 true로. 자세한 건 task로 보낼게. 작업하면서 chat.md에 한 줄씩 남겨줘.
[Max] step3 시작했어. 게이트 코드랑 마이그레이션 먼저 다 읽어봤고, walk 경로가 research_approved까지 합법인지 확인했어.
[Max] throw 빼고 script 시드 구현했어. fact는 human_approved=true로만 통과시키고 verified는 절대 안 건드렸어. 이제 타입체크랑 테스트 돌려본다.
[Max] 타입체크 통과하고 테스트 614개 다 초록불이야. 신규 8개 추가했고 기존 거 안 깨졌어. 게이트는 한 줄도 안 건드렸으니 한번 봐줘.
[리드] 조이, step3 검수 부탁해. AC 직접 재실행했고 typecheck exit 0 / test 614 passed(+8) 확인했어. scriptCell 게이트 안 건드렸는지, fact가 unverified+human_approved=true로 verified-CHECK 우회하는지, 시드 경로 callLLM 0회인지 중점으로 봐줘.

[Joy] 오 맥스 step3 빠르다~ 내가 바로 git diff 봤어. scriptCell.ts diff 완전 비어있다, 게이트 한 줄도 안 건드림 굿굿
[Joy] seed.ts도 봤는데 facts는 unverified+human_approved=true로 정직하게 통과시키네. verified로 거짓검증 안 하고. 이게 핵심인데 잘 잡았다
[Joy] verified-CHECK는 verification_status<>verified면 자동 만족이라 unverified는 안전. recheck_after=null+freshness=fresh라 freshness 게이트도 안 걸리고. 이제 typecheck랑 test 돌려볼게 ☕
[Joy] typecheck exit 0, test 614개 전부 통과(step2 606에서 +8)! 깔끔하다 🎉
[Joy] callLLM import 0(주석만 있음), raw update 0으로 transitionRun만 쓰고, structure도 일반 walk 타고. 무관 fixture도 안 딸려왔어
[Joy] 기존 throw 테스트는 동작 바뀌어서 정당하게 교체됐고, 게이트 필터를 테스트에서 그대로 재현해서 usable 통과까지 검증함. 봐주기 없이 봤는데 통과! 맥스 굿굿 👍
[리드] 조이 PASS, AC exit 0 둘 다 확인했어. money-safety 핵심(verified 금지·unverified+human_approved=true로 정직하게 게이트 통과)까지 정확히 짚어줘서 좋았다. step3 완료 처리할게. 다음은 step4 단독 실행 UI(에스더 차례).
