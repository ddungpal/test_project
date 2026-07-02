
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

=== Step 1: target-first-prompt ===
[리드] 맥스, step1이야. step0에서 targetPersona를 prepare opts까지 배선만 해놨는데, 이번엔 실제로 작동시켜야 해. schema.ts에 appendPersonaDirective 신설(appendLevelDirective 미러), prepare.ts에서 체이닝, stage.ts toCandidates에서 targetPersona 있으면 후보 persona 고정 덮어쓰기. 없으면 바이트 동일 불변식 꼭 지켜줘

[Max] step1 시작할게. 촉이 프롬프트에 고정 persona 지시문 넣고, 후보 target_persona 덮어쓰는 부분 작업할 거야. 테스트 먼저 짜고 red 확인부터.

[Max] 구현 끝. appendPersonaDirective 넣고 prepare 체이닝, toCandidates persona 덮어쓰기까지. 신규 테스트 6개 다 통과했어. 이제 typecheck/전체test/build 돌려서 회귀 없는지 볼게.

[Max] AC 다 통과했어. typecheck 0, 전체 테스트 1108개 0, build도 0. build 처음엔 /insights PageNotFoundError 떴는데 rules에 있던 stale .next 케이스라 rm -rf .next 하니 바로 풀렸어. 코드 무관. persona 안 넘긴 기존 3모드는 프롬프트·payload 바이트 동일이라 promptHash 그대로야. 놓친 거 있으면 말해줘.
[리드] 조이, step1 검수 부탁해. AC는 내가 돌려서 typecheck/test(1108)/build 전부 exit 0 확인했어. Max가 appendPersonaDirective 신설·prepare 체이닝·toCandidates persona 고정 붙였는데, 핵심 불변식(targetPersona 없으면 바이트 동일·promptHash 보존, audience_level/need/title 안 덮어씀) 지켜졌는지 git diff로 봐줘

[Joy] 오 맥스 step1 벌써 끝냈어? 내가 바로 git diff 보고 AC 돌려볼게!
[Joy] 좋아 appendPersonaDirective 봤어. persona 있으면 지시문 붙이고 값 인용, 없거나 빈 문자열이면 그냥 system 그대로 리턴하네. TOPIC_SCOUT_SYSTEM 본문은 손 안 댔고 함수가 조건부로만 붙여서 promptHash 완벽 보존 굿굿
[Joy] stage.ts도 깔끔해. fixedPersona 클로저로 target_persona만 덮어쓰고 title/audience_level/audience_need는 촉이 출력 그대로 두네. 스키마 required도 안 풀었고 NewRunButton도 안 건드렸어
[Joy] 테스트 6개가 바이트 동일 toBe랑 필드 보존까지 딱 못박아놨네. 빈 문자열 케이스까지 챙긴 거 센스 있다
[Joy] AC 다 돌렸어. typecheck exit0, test 1102에서 1108로 딱 6개 늘어서 exit0, build도 exit0! 떠돌이 파일도 없고 index.json도 completed로 갱신됨. 완벽하다 통과 🎉 수고했어 맥스!
[리드] 조이 검수 통과, AC 셋 다 exit 0 확인했어. step1 완료 처리한다. 1라운드 PASS. 이제 고정 타겟이 촉이 프롬프트에 실제로 주입되고 후보 persona도 고정 덮어쓰기 되니까, 마지막 step2에서 UI 탭만 붙이면 파이프라인 관통 끝. 둘 다 수고했어 👍
