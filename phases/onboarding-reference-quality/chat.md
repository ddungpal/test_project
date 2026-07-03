
=== Step 0: views-ranking-query-refine-wider-pool ===

[리드] 자, 온보딩 근거 영상이 조회수 700짜리로 뽑히는 그 문제. 원인은 참조 선발이 배수(조회수÷구독자) 랭킹을 재사용해서야. 근거 영상엔 정반대 목표지. 셋 고친다 — ①절대 조회수 랭킹 ②쿼리 키워드 정제 ③풀 10→20. 배수 랭킹은 발굴/hook엔 옳으니 건드리지 말고 온보더 참조 경로만.
[리드] 맥스, 이거 맡아줄래? 순수 백엔드라 에스더는 안 부를게.

[Max] 응, 맡을게. spec이랑 코드 다 읽었어. rankExternalByViews부터 테스트 짜고 구현할게. 배수 랭커는 안 건드릴 거야.

[Max] 셋 다 넣었어. rankExternalByViews(조회수 desc·null 후순위·구독자 tiebreak·id 안정), refYouTubeQuery(대괄호/괄호 제거·첫 구분자 앞·후행부호 정리·2자미만 폴백), perPass 10→20. gatherReferences 체인은 조회수 랭킹으로 갈아끼우고 옛 (a) FLOOR_SUBS 단계는 지웠어. prepare.ts에서 안 쓰게 된 rankExternalByMultiplier·FLOOR_SUBS import는 죽은 채 안 남게 제거했고.
[Max] 기존 onboarderMultiRef 테스트는 subscriberCount가 같아서 배수순==조회수순이라 기대값은 그대로였는데, 문구랑 (a)/(b) 언급이 stale이라 조회수 기준으로 정정했어. 734/1370 실측 케이스도 하나 추가. typecheck 0, 대상 테스트 33개 통과. 이제 전체 돌려볼게.

[Max] 다 끝났어. typecheck 0, test 1273 통과, build 0. git status도 명세 파일만 있고 떠돌이 fixtures 안 섞였어. index.json step0도 completed로 갱신했고. 놓친 거 있으면 조이가 봐줘.
[Joy] 오 맥스 왔다~ step0 검수 시작할게! 먼저 spec이랑 git diff 쫙 봤어. rankExternalByViews 신규랑 refYouTubeQuery, perPass 20까지 다 보이네 굿굿
[Joy] 새 테스트 2개도 열어봤는데 정렬 케이스 촘촘하다ㅎㅎ 이제 원본 코드에서 rankExternalByMultiplier랑 FLOOR_SUBS 안 건드렸는지 볼게
[Joy] 확인했어! rankExternalByMultiplier는 손 안 댔고 hook_maker FLOOR_SUBS도 그대로 살아있어. pickSpreadYoutube(발굴 분산)도 여전히 배수 쓰고 있고. 발굴/hook 경로 무영향 굿 👍
[Joy] prepare.ts에서 죽은 import도 없어(rankExternalByMultiplier·FLOOR_SUBS 깔끔히 뗌). 이제 typecheck/test/build 직접 돌려볼게!
[Joy] AC 셋 다 초록불이야! typecheck 0, test 1273 통과(새 테스트 20개 포함), build 0. 새 테스트 2개도 따로 돌려서 순수함수 동작 진짜 검증하는 거 확인했어
[Joy] onboarderMultiRef 정정도 눈속임 아니야~ 정정된 케이스들 subscriberCount가 다 같아서 배수순==조회수순이라 기대값 그대로고, 문구만 조회수 기준으로 바뀐 거 맞아. 734/82k 새 케이스는 오히려 바뀐 동작을 대놓고 검증하네 굿
[Joy] index.json도 completed에 summary 꽉 채워졌고 떠돌이 fixture도 없어. 발굴/hook 경로 무영향, url dedup 보존, 옛 (a) FLOOR_SUBS 단계 삭제까지 다 맞아. 통과! 🎉 맥스 이번 거 진짜 깔끔했다
[리드] 나도 AC 직접 돌려서 확인했어 — typecheck 0, test 1273 통과, build 0. 조이 PASS랑 일치. step0 완료 처리한다. 근거 영상이 이제 배수 아니라 절대 조회수로 뽑히니 실제 검색 품질은 라이브에서 확인하면 되겠다. 다들 수고했어.
