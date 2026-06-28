
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
