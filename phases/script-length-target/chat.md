# script-length-target — Step 0: scribe-length-directive

[리드] 자 오늘 할 일은 짠펜 대본이 너무 짧은 문제야. 목표 분량 지시를 별도 상수로 넣고 full 모드에만 배선, 토큰 캡도 올린다. 순수 백엔드라 맥스한테 바로 맡긴다.
[Max] 짠펜 길이 지시 작업 시작했어. schema랑 step, 기존 회귀 테스트 패턴 다 읽었어.
[Max] full 모드에만 길이 지시 붙이고 단일 세그먼트 모드는 안 건드리는 스코핑이 핵심이라, 거기 신경 써서 짤게.
[Max] schema에 SCRIBE_LENGTH_DIRECTIVE 상수 추가했고, step.ts full 모드에만 항상 붙게 배선했어. 토큰도 8192에서 16384로 올렸어.
[Max] 회귀 테스트 새로 만들었고, 길이 지시 붙으면서 바이트동일 걸던 기존 짠펜 테스트 두 개(persona wiring·segment mode)도 현실에 맞게 단언만 고쳤어. 실패 삭제한 건 없어.
[Max] 이제 typecheck·test·build 돌려볼게.
[Max] 다 됐어. typecheck 0, test 1402개 전부 통과(신규 5개), build도 깨끗해.
[Max] full 모드엔 길이 지시 붙고 단일 세그먼트는 안 붙는 스코핑도 테스트로 잠갔어. 놓친 거 있으면 말해줘.
[리드] 맥스 고마워. AC 나도 다 돌려봤어 — typecheck 0, 1402 통과, build 0. 떠돌이 fixtures도 없고 깔끔해. 조이야 검수 부탁해.
[Joy] 오 맥스 빠르다~ 나 바로 diff 정독하고 typecheck/test/build 돌려볼게!
[Joy] schema.ts 순수 추가만이네. SCRIBE_SYSTEM 본문이랑 SCHEMA 안 건드렸어. 굿굿
[Joy] step.ts도 깔끔. full 모드는 SYSTEM+LENGTH 항상 붙고 세그먼트는 SEGMENT_DIRECTIVE만 쓰고 maxTokens 4096 그대로네. 스코핑 딱 지켰다
[Joy] AC 다 돌렸어! typecheck 0, test 0(1402개 통과·신규 scribeLengthTarget 5개 포함), build 0. 초록불이야 🎉
[Joy] 기존 테스트 단언 바꾼 거 확인했는데 약화 아니야. 길이 지시가 full에 항상 붙으니 SYSTEM+LENGTH로 바뀐 게 맞고, not.toContain으로 오히려 단언을 더 조였네
[Joy] 세그먼트 모드는 4096 그대로에 길이 지시 미포함, 스코핑 불변식 딱 지켰어. fixtures 부산물도 안 섞였고. 통과! 맥스 굿굿 👍
[Joy] 다 봤어! schema는 순수 추가만이고 SYSTEM 본문 하나도 안 건드렸어. full 모드에만 길이 지시 붙고 세그먼트 모드는 깨끗해 — 스코핑 완벽. 바꾼 테스트도 약화 아니라 오히려 not.toContain 붙여서 강화됐네. AC 셋 다 exit 0! 통과 🎉
[리드] 좋아 통과. step 0 완료 처리한다. 실제 대본이 길어졌는지는 머지 후 라이브 런에서 눈검증하면 돼.
