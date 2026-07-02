
=== Step 0: target-first-plumbing ===

[리드] 자, "타겟 먼저" 모드 첫 삽. 이번 건 순수 배선이야 — targetPersona 문자열을 startTopicRun부터 prepareTopicScout까지 levelSplit 패턴 그대로 흘려보내기만. 프롬프트 주입이나 UI는 다음 step 몫이고. 맥스, 맡아줄래?
[Max] 설계랑 코드 다 봤어. levelSplit 지나는 5곳 그대로 미러할게, 값 있을 때만 실어서.
[Max] 이번 step은 배선만이야. 프롬프트 주입이랑 후보 덮어쓰기는 다음 step 몫이라 안 건드려.
[Max] 5곳 배선 다 했어. 이제 typecheck·test·build 순서로 돌려볼게.
[Max] 셋 다 통과했어. typecheck 0, test 1102개 그대로 0, build 0. 회귀 없어.
[Max] 프롬프트 주입은 안 넣었으니까 targetPersona 없는 기존 런은 바이트 그대로일 거야. 놓친 거 있으면 말해줘.
[리드] 나도 AC 직접 돌려봤어 — typecheck 0, test 1102 통과, build 0. 조이, 독립 검수 부탁해. 특히 levelSplit 미러가 조건부 스프레드로 정확한지, 범위 넘어간 거(프롬프트/UI) 없는지 봐줘.
[Joy] 오 맥스 빠르다~ diff 딱 코드 5파일에 phases 메타만, 깔끔해서 좋다
[Joy] targetPersona 배선 5곳 다 따라가봤어. startTopicRun 인자에서 시작해서 이벤트 data, StageData 타입, topicStageFn, topicStageSpec, prepareTopicScout opts까지 한 번도 안 끊기고 잘 이어졌네 굿굿
[Joy] 조건부 스프레드도 완벽해. levelSplit 패턴 그대로 미러해서 있을 때만 넣고 undefined 명시대입 하나도 없더라. exactOptional 걱정 없음
[Joy] toCandidates 덮어쓰기랑 프롬프트 주입은 손 안 댔네. step1 몫 정확히 남겨둔 거 범위 딱 지켰다 나이스
[Joy] AC 셋 다 돌렸어 typecheck test build 전부 exit 0. 테스트 1102개 그대로 통과, 지워진 테스트도 없고. 배선 step이라 신규 테스트 없는 건 계약상 정상이야
[Joy] fixtures 부산물들은 커밋 범위 밖 untracked라 안 딸려가. 걱정 없음. 통과!
[리드] 좋아, step0 완료 처리한다. 1라운드 PASS. 배선 다 깔렸으니 다음 step1에서 프롬프트 주입이랑 후보 고정 붙이면 돼. 수고했어 둘 다 👍
