
=== Step 0: prepare-youtube-rank ===

[리드] 주제 런 화면에 플롭(구독 대비 조회수 낮은 영상)이 레퍼런스로 뜨는 버그. prepare.ts가 youtube를 배수 랭킹 없이 그냥 앞 6개 자르는 게 원인이야. 맥스, 이거 좀 맡아줄래?

[Max] 응, 코드 봤어. 훅이쪽 정렬 로직이랑 똑같이 맞춰서 헬퍼 하나 만들면 되겠네. 바로 해볼게.
[Max] 헬퍼 rankExternalByMultiplier 만들고 prepare.ts youtube slice를 그걸로 교체했어. viewsPerSubscriber 재사용했고 정렬 우선순위는 훅이쪽이랑 똑같이 맞췄어. 배수 null은 안 버리고 뒤로만 보냈고.
[Max] 테스트 9개(플롭 컷·null 후순위·FLOOR_SUBS·입력 비변형 등) 추가했어. typecheck/test(879)/build 다 통과. 놓친 거 있으면 말해줘.
[리드] AC 직접 돌려봤어 — typecheck/test(879)/build 다 exit 0. 조이, 독립 검수 좀 부탁해.
[Joy] 오 맥스 빠르다~ diff 봤어. 헬퍼 깔끔하고 pickTopExternalTitles 정렬이랑 미러됐네! 바로 typecheck/test/build 돌려볼게 🎉
[Joy] 굿굿 typecheck/test/build 셋 다 exit 0! 879 통과(신규 topicRefRank 9개 포함). 입력 비변형·null 보존·플롭 컷 다 확인했어. 통과 🎉
[리드] 좋아, 1라운드 PASS. step 0 completed로 마감한다. 다들 수고했어.
