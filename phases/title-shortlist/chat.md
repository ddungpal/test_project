
=== Step 0: alternates-model ===

## Step 0 — alternates-model
[리드] 자, title-shortlist 첫 step 시작하자. 제목 후보 보관 타입+순수헬퍼+테스트만. 백엔드/UI는 다음 step.
[리드] 맥스, 이거 맡아줄래? proposalTypes에 alternates 1줄 + src/lib/title/alternates.ts 두 함수 + tests/titleAlternates.test.ts. 순수함수만이야.
[Max] 응, step0 시작할게. proposalTypes에 alternates 필드부터 넣고 순수 헬퍼 짤게.
[Max] 필드 넣고 alternates 헬퍼 두 개 짰어. merge랑 promote. 이제 테스트 쓸게.
[Max] 테스트 다 통과했어. typecheck·test(1374)·build 전부 0.
[Max] build가 처음에 깨졌는데 코드 문제 아니고 stale .next 캐시였어. dev/inngest 먼저 끄고 .next 지운 뒤 다시 빌드하니 통과. 서버는 inngest→dev 순으로 다시 띄워놨어(둘 다 200).
[Max] 놓친 거 있으면 말해줘.
[리드] 맥스 고마워. AC 내가 직접 돌려봤어 — typecheck·test(1374)·build 전부 exit 0. 조이, 검수 부탁해.
[Joy] 오케이 맥스 빠르다~ 나 이제 diff부터 훑고 AC 직접 돌려볼게!
[Joy] 코드 딱 스코프대로네. proposalTypes 1줄이랑 alternates.ts 순수함수 두 개, 테스트 16케이스. 굿굿
[Joy] 검수 끝! typecheck 0, test 1374 통과(신규 16개), build도 .next 지우고 clean으로 다시 돌렸는데 exit 0. 다 초록불이야 🎉
[Joy] 불변식도 딱 지켜졌어. 후보 전부 탈락하면 alternates 키 아예 안 넣고 primary랑 deep-equal, 테스트에 in 체크까지 박아놨더라. promptHash 보존 완벽!
[Joy] promotePrimary 맞교환·필드보존·범위밖 무변경 다 커버됐고 순수함수라 부수효과 0. 스코프 밖 파일도 안 건드렸어. 떠돌이 fixtures는 세션 시작 때부터 있던 애들이라 이번 step 산출물 아님.
[Joy] 아 참, build 확인하려고 dev/inngest 잠깐 껐다가 inngest→dev 순서로 다시 띄워놨어. 둘 다 200 정상! 맥스 깔끔했다 👍 VERDICT PASS
[Joy] 통과! typecheck·test 1374·build 전부 exit 0, 불변식(빈후보=primary deep-equal, alternates 키 없음)도 이중가드로 확실해 🎉
[리드] 좋아, step0 완료. 다음 step에서 이 헬퍼를 UI에 물리면 돼. 수고들 했어!
