
=== Step 0: answer-shuffle-and-difficulty ===

[리드] 자, 쏙이 문항 정답이 자꾸 2번에 몰리는 문제 손보자. 결정적 셔플 헬퍼 하나 만들고 normalizeArc에 물리는 게 핵심이야. 맥스, 이거 좀 맡아줄래?

[Max] 응 맡을게. 스펙이랑 schema.ts, playback.ts 다 읽었어. shuffle.ts 순수헬퍼부터 만들고 normalizeArc 저장 직전에 한 곳만 물릴게. Math.random 안 쓰고 문항 내용 해시로 시드 박아서 결정적으로.

[Max] shuffle.ts 만들었어. djb2 해시로 시드 뽑고 mulberry32 PRNG로 Fisher-Yates 순열. answerIdx는 값 검색 말고 위치 추적으로 재매핑했어. normalizeArc push 직전 한 곳에만 물렸고, SYSTEM엔 오답 그럴듯하게 짜라는 항목 하나만 덧붙였어.

[Max] 기존 onboardingArc.test에 answerIdx가 그대로 1이길 기대하던 assert가 하나 있었어. 셔플 들어가면 위치가 바뀌니까 정답 내용 보존으로 정정했어. inferLevel/extractGold 쪽은 arc를 직접 만들어서 normalizeArc 안 거치니까 셔플 영향 없어.

[Max] AC 셋 다 통과했어. typecheck0, test 1216→1229(신규 13개), build0. 순환import 걱정했는데 값/타입 분리라 문제없었어. 위치 분산 테스트는 결정적이라 실제 실행값 [2,1,2,3,1]로 고정해뒀어. 다 2번이던 정답이 이제 코드상 못 몰려. 놓친 거 있으면 말해줘.

[리드] 깔끔하네. 나도 AC 돌려봤어 — typecheck0/test1229/build0, 떠돌이 파일도 없어. 조이, 독립 검수 좀 부탁해.

[Joy] 오 맥스 손 진짜 빠르다ㅋㅋ 나 git diff 열자마자 다 끝나있네. 바로 검수 들어갈게!
[Joy] 셔플부터 봤는데 Math.random이랑 Date.now grep 0개 확인. 시드가 djb2(prompt+choices)라 순수·결정적이고 mulberry32도 자체구현이라 의존성 0이야. 깔끔 굿굿
[Joy] 정답 보존 로직도 값 검색 아니고 위치 추적(origIdx===answerIdx)으로 하네. 동일 문자열 오답 있어도 안 헷갈려. choices<2 방어에 빈배열까지 커버, 입력도 새 객체로 안 건드림. 완벽해
[Joy] 배선은 normalizeArc 한 곳만. moreStep도 normalizeArc 거쳐서 추가문항 자동적용되고, 재생/제출/recap은 저장된 인덱스 쓰니까 이중셔플 없음. 프롬프트는 ④-2 딱 한 줄 추가만 하고 기존 문장 안 건드렸고 term(Step1)도 안 섞였어
[Joy] onboardingArc.test 정정도 봤는데 이거 약화 아니야! answerIdx==1/2 상수 비교를 choices[answerIdx]==='b'/'c' 내용보존으로 바꾼 거라 오히려 의미있는 불변식으로 강화됐어. 테스트 지워서 통과시킨 거 절대 아님
[Joy] AC 셋 다 직접 돌렸어. typecheck0, test 1229 전부통과, build0. git status도 명세 파일만 있고 떠돌이 fixtures 없음. 통과야 축하해 맥스 에스더 🎉

[리드] 좋아, Step 0 1라운드 PASS로 마감. index.json completed 갱신했어. 이제 정답이 코드상 한 번호에 못 몰려. 수고했어 팀 👏
