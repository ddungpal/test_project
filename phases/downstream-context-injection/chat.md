
=== Step 0: hook-persona ===

[리드] 자, 시작하자. 이번 step은 타겟 페르소나를 훅이(제목 메이커) 프롬프트에 조건부로 넣는 거야. 짠펜·구다리 패턴 그대로 미러하면 돼.
[리드] 맥스, 이 step 맡아줄래? HOOK_MAKER_SYSTEM 본문은 절대 안 늘리는 게 핵심이야 — 지시문은 별도 상수로 빼서 persona 있을 때만 append.
[Max] hook-persona step 시작할게. 짠펜 persona 주입 패턴이랑 구다리 미러 다 읽었어. 훅이 schema/prepare 2개랑 테스트 1개만 손볼 거야.
[Max] 다 했어. schema에 HOOK_PERSONA_DIRECTIVE 상수 새로 넣고, HOOK_MAKER_SYSTEM 본문은 안 건드렸어. prepare는 topic payload에서 persona 뽑아서 있을 때만 input이랑 system에 붙였고. 없으면 예전이랑 바이트 그대로라 픽스처 해시 안 깨져.
[Max] 테스트는 구다리 D/E/F 미러해서 3케이스 만들었어. typecheck·test(1092→1095)·build 다 통과. …persona 없는 런은 진짜 한 글자도 안 바뀌는지 바이트 비교로 못박아놨어.
[리드] 확인했어. typecheck exit 0, test 1095 통과, build exit 0. 조이, 검수 부탁해.
[Joy] step0 hook-persona 검수 시작할게~ git diff부터 훑어본다
[Joy] 오 깔끔하다 schema.ts SYSTEM 본문 40~53줄 그대로고 HOOK_PERSONA_DIRECTIVE만 새 상수로 붙였네 굿굿
[Joy] prepare.ts도 짠펜 step.ts 미러 정확해 persona 있을 때만 input 키+system append, 없으면 바이트 불변
[Joy] 테스트 케이스 B가 진짜 핵심인데 system===HOOK_MAKER_SYSTEM 바이트 잠금이랑 "target_persona" in input false 둘 다 잡네 껍데기 아님 인정
[Joy] 범위도 hook_maker 2파일만이고 package.json 무변경 마이그레이션 없음 완벽
[Joy] AC 3개 다 돌렸어 typecheck0 test0(1095개!) build0 다 초록불이야 통과 🎉
[Joy] 맥스 이번 것도 손 빠르네ㅋㅋ 나 트집 잡을 데가 없어서 서운할 지경이다
[리드] 좋아, step0 PASS. index.json completed로 갱신 완료(JSON 문법도 다시 검증). 1라운드 만에 통과, 수고했어 둘 다.
