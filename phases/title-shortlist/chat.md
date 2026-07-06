
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

=== Step 1: shortlist-select ===

## Step 1 — shortlist-select
[리드] step0 헬퍼(mergeAlternates) 이제 UI에 물릴 차례야. ProposalSelector title_thumb 분기에만 "후보로 같이 저장" 체크박스 붙이는 거.
[리드] 맥스, 이거 맡아줘. 백엔드/액션 시그니처는 절대 손대지 말고 editedPayload에 mergeAlternates 결과만 얹으면 돼. topic/structure 분기는 무변경.
[Max] 응, step1 시작할게. ProposalSelector 지금 라디오 흐름 읽어봤어. title_thumb 분기에만 체크박스 붙이고 submit에서 mergeAlternates 얹을게.
[Max] 체크박스랑 submit 병합 다 붙였어. 대표 바꾸면 그 카드가 추가후보였을 때 자동으로 빠지게 pick()에서 처리했고, 상한 2개 넘으면 나머지 체크박스 disabled. 이제 AC 돌려볼게.
[Max] AC 다 통과했어. typecheck 0, test 1374 그대로 통과, build도 .next 지우고 clean으로 0. build 전에 dev/inngest 껐다가 inngest→dev 순으로 다시 띄워놨어(둘 다 200).
[Max] 불변식은 지켰어. 추가후보 0개 + 손편집 없으면 editedPayload 아예 안 보내. 추가후보 있을 때만 mergeAlternates 결과 얹고. topic/structure 분기는 안 건드렸어.
[Max] 백엔드/액션 시그니처도 그대로고 editedPayload jsonb에만 얹었어. PostConfirmTitleEdit는 손 안 댔어(그건 step2지). 놓친 거 있으면 말해줘.
[Joy] 오 맥스 이번엔 UI네! 나 diff부터 훑을게. 코드는 ProposalSelector 하나만 건드렸고 깔끔하다
[Joy] 체크박스가 title_thumb에다 대표 아닌 카드에만 뜨네. 상한도 toggleExtra랑 disabled 이중가드고 대표 바꾸면 pick에서 자동으로 빠지고. 굿굿
[Joy] 불변식 봤어. 추가후보 0개면 hasExtra false라 기존 edited?draft:null 그대로 타서 editedPayload 안 나가. 바이트 동일 유지되겠다
[Joy] gate랑 액션 시그니처 무변경 확인, PostConfirmTitleEdit도 안 건드렸고 untracked 떠돌이도 없어. 이제 AC 돌려볼게
[Joy] 검수 끝! typecheck 0, test 1374 그대로 통과, build도 exit 0. 다 초록불이야
[Joy] effectivePrimary도 편집있으면 draft 없으면 chosen.payload로 딱 맞고, 색도 accent-trus-yellow랑 trus-white 기존 토큰만 썼네. 신규 색이나 그림자 없어
[Joy] 손편집으로 title 바꾸고 후보도 체크한 케이스도 mergeAlternates가 primary title 기준 dedup해서 안전하더라. 맥스 이번에도 깔끔했다 VERDICT PASS
[Joy] 검수 끝! 코드 변경 ProposalSelector 하나뿐, 불변식(추가후보0+손편집없음=editedPayload 미포함)도 삼항 로직으로 딱 지켜졌어. AC 다시 돌려봤는데 typecheck·test 1374·build 전부 exit 0 🎉 VERDICT PASS
[리드] 좋아, step1 완료. 조이 검수 통과했고 AC도 내가 직접 돌린 거랑 일치해. 다음은 step2 PostConfirmTitleEdit 스왑이야. 수고들 했어!

=== Step 2: shortlist-swap ===

## Step 2 — shortlist-swap
[리드] 마지막 step이다. PostConfirmTitleEdit에 alternates 후보 목록 + "이걸 대표로" 스왑 버튼. promotePrimary(step0) 재사용해서 editTitle만 호출 — 상태전이·AI·재실행 0.
[리드] 맥스, 맡아줘. editTitle 시그니처 손대지 말고, 손편집 저장 경로가 alternates를 안 지우는지도 확인해줘. 정직 카피 한 줄 꼭 넣고.
[Max] 응, step2 시작할게. PostConfirmTitleEdit 지금 손편집·AI재생성 경로 읽어봤어. 확정 제목 아래에 후보 목록이랑 이걸 대표로 버튼 붙이고, promotePrimary로 맞교환해서 editTitle만 부를게.
[Max] 후보 목록 섹션이랑 이걸 대표로 버튼 다 붙였어. promotePrimary로 맞교환한 payload를 editTitle만 부르게 했고, pending·error·router.refresh는 손편집 submit 경로 그대로 재사용했어. 상태전이나 이벤트 발행은 안 넣었어.
[Max] 정직 카피도 넣었어 — 썸네일·대본은 대표 제목 기준으로 만들어졌어요, 여기서 바꾸면 최종 제목만 교체됩니다.
[Max] alternates 없거나 비면 섹션 자체를 안 그려서 기존 화면이랑 동일해. effective가 edited_payload 우선이라 step1에서 저장한 후보가 실려오는 것도 배선 확인했어.
[Max] 손편집 submit은 여전히 스프레드라 alternates 안 지워. AC 다 통과했어 — typecheck 0, test 1374 그대로, build도 서버 껐다 .next 지우고 clean으로 0. inngest→dev 순으로 다시 띄워놨어(둘 다 200).
[Max] 색은 기존 trus 토큰만 썼고 신규 색·그림자 없어. 파일도 이 컴포넌트 하나만 건드렸어. 놓친 거 있으면 말해줘.

[Joy] 오 맥스 step2도 왔다! 바로 git diff 봤는데 PostConfirmTitleEdit 하나만 건드렸고 스코프 딱 맞아 깔끔하다
[Joy] promote()가 submit() 패턴 그대로 미러했네 — pending·error·router.refresh 재사용, editTitle만 호출하고 상태전이나 인제스트 이벤트 하나도 안 붙였어 굿굿
[Joy] 정직 카피 한 줄 그대로 있고 alternates 없으면 아예 렌더 안 함(회귀 0). trus 토큰만 쓰고 신규 색·그림자도 없어. 이제 typecheck랑 test 돌려서 교차확인만 할게!

[Joy] typecheck exit 0, test 1374 passed exit 0! 리드가 준 값이랑 딱 맞아 교차확인 완료
[Joy] titleAlternates.test.ts도 그대로 살아있고(promotePrimary 맞교환·필드보존·범위밖·순수 다 커버) 이번 diff는 컴포넌트 하나만 손대서 테스트 약화 0이야
[Joy] editTitle 시그니처 그대로, 스왑은 editTitle만 호출·상태전이 인제스트 재생성 하나도 안 붙임. 썸네일 payload는 promotePrimary가 대표 것 보존하고 제목 문자열만 스왑. 깔끔하다 통과! 맥스 손 왜 이렇게 빨라 나 커피 탈 시간도 없잖아
[리드] 조이 고마워. AC 나도 직접 돌렸어 — typecheck·test 1374·build(clean) 전부 exit 0. 센티넬 PASS 확인.
[리드] step2 완료! title-shortlist phase 3 step 전부 끝. 대표 1개+후보 보관→선택→나중에 스왑까지 다 물렸다. 다들 수고했어 🎉
