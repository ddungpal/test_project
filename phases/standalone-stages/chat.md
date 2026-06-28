
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
