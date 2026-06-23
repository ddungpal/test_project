
=== Step 0: parallelize-queries ===
[리드] 자 perf 최적화 시작하자. Step 0는 대시보드 뷰 순차쿼리를 Promise.all로 묶는 순수 성능 리팩터야. 결과는 1바이트도 바뀌면 안 돼.
[리드] 맥스, 이거 네가 맡아줘. runDetail.ts 주대상이고 scriptView/researchView/queries.ts까지. 독립쿼리만 묶고 의존체인은 순서 유지.
[Max] 응 맡을게. 파일 네 개 다 읽었어. runDetail이 제일 묶을 데가 많네. run 한 번 받고 → 그룹A 4개 병렬 → 그룹B 3개 병렬, 3웨이브로 가면 깔끔할 것 같아
[Max] runDetail 3웨이브로 묶었고 scriptView도 두 군데 병렬화했어. researchView는 facts/assets가 완전 독립이라 같이 묶었고. queries.ts는 listRuns가 runs→contents 의존체인이라 손 안 댔어. 이제 타입체크 돌려볼게
[Max] 다 끝났어. typecheck/test/build 셋 다 통과. 테스트 154개 그대로 그린이고. best-effort 가드는 Promise.all 안에서 then 두번째 인자로 reject 흡수해서 기존처럼 에러 무시되게 했어. 빈 입력일 땐 쿼리 자체를 스킵하던 가드도 그대로 살렸고. 결과 데이터는 안 건드렸으니 동작 동일할 거야. 혹시 놓친 거 있으면 말해줘
[리드] 맥스 수고했어. 나도 AC 직접 돌려봤는데 typecheck/test(154)/build 전부 exit 0 나왔어.
[리드] 조이, 검수 부탁해. 핵심은 "반환 데이터가 1바이트도 안 바뀌었나" — 묶기만 했는지, 가드·정렬·null 처리 그대로인지 봐줘.
[Joy] 오 맥스 빠르다~ git diff부터 정독했어! runDetail 3웨이브로 잘 쪼갰는지 보는 중이야
[Joy] 로직 다 따라가봤어. 그룹B 전에 latestByStage 계산되는 것도 확인! 이제 typecheck/test/build 돌린다 잠깐만~
[Joy] 통과! typecheck/test/build 다 exit 0 떴고 테스트도 1바이트 안 건드렸어. 동작 불변 확인 굿굿 🎉 맥스 best-effort 가드 .then(ok, fallback)으로 깔끔하게 감싼 거 칭찬해~ index.json step0만 completed로 바꿔주면 완벽!
[Joy] 검수 끝~ git diff 정밀로 봤는데 묶기만 했고 가드·정렬·null 전부 그대로야. AC도 내가 다시 돌렸는데 tc/test(154)/build 다 exit 0! 동작 불변 확정이야 🎉
[리드] 좋아, Joy PASS. Step 0 completed로 마감한다. 맥스 조이 둘 다 수고했어. 커밋은 하네스가 알아서 할 거야.
