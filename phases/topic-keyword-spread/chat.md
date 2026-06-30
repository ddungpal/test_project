
=== Step 0: multi-keyword-youtube ===
[리드] 자, step0 시작하자. 발굴 모드 주제 런이 한 테마로 쏠리는 버그 픽스야. youtube 검색을 top-3 키워드로 넓히고, 외부영상을 테마별로 분산 선택하는 거. 맥스, 이거 맡아줄래?
[Max] 어 맡을게. 명세랑 externalSignals 다 봤어. ytQuery 하나로만 돌던 걸 ytQueries 배열로 흡수하고, 테마별 분산 헬퍼 pickSpreadYoutube 하나 새로 만들면 될 것 같아.
[Max] externalSignals에 sourceQuery 필드 넣고 pickSpreadYoutube 라운드로빈으로 짰어. prepare는 발굴 모드 top-3, 키워드 모드 단일로 갈리게 해놨고 discovery도 top-3 댓글 키워드로. 기존 테스트 팩토리들이 sourceQuery 빠져서 타입 깨지길래 거기 null만 채웠어. typecheck는 통과했고, 이제 새 테스트 짤게.
[Max] 다 됐어. typecheck·test(893개)·build 셋 다 통과. build는 처음에 PageNotFoundError 떴는데 rm -rf .next 하니까 깨끗하게 됐어. stale 캐시였어. pickSpreadYoutube 라운드로빈이라 테마 쏠림 없을 거야. 놓친 거 있으면 말해줘.
[리드] AC 직접 돌려봤어 — typecheck exit 0, 테스트 893개 통과, build exit 0. 조이, 독립 검수 부탁해.
[Joy] 오 맥스 빠르다~ diff 다 봤어. pickSpreadYoutube 라운드로빈 깔끔하고 키워드 모드는 단일 유지했네 굿굿
[Joy] 기존 테스트 4개 수정은 sourceQuery null 채운것뿐이라 약화 아니고 OK. 이제 AC 3종 돌려볼게!
[Joy] typecheck exit0, test 893개 전부 통과, build는 stale .next 지우니 exit0! 깔끔하다
[Joy] search랑 fact_verifier 안 건드렸고 재구현도 없고 댓글신호도 살아있어. 통과! 수고했어 맥스
[Joy] 오 맥스 이번 거 진짜 깔끔하다~ pickSpreadYoutube 라운드로빈도 재사용 잘했고 키워드 모드 단일도 그대로야. AC 다시 돌려봤는데 typecheck·test 893개·build 전부 exit 0! 통과 🎉
[리드] 좋아, step0 완료. index.json도 completed로 갱신했어. 수고했어 둘 다.

=== Step 1: topic-spread-system ===
[리드] step1 가자. step0이 외부영상을 테마별로 깔아줬는데, 정작 촉이 프롬프트엔 분산 규칙이 없어서 LLM이 한 테마로 몰 수 있어(예적금만 4개). TOPIC_SCOUT_SYSTEM 발굴 모드에만 분산 지침 넣는 거야. 키워드 모드는 집중 유지, youtube 과반 규칙도 살려야 해. 맥스 부탁해.
[Max] 어 맡을게. 촉이 프롬프트랑 step0 sourceQuery 태깅 다 봤어. TOPIC_SCOUT_SYSTEM 결합 원칙 블록 밑에 발굴 모드 전용 테마 분산 규칙 한 덩어리 넣을게. focus_keyword 있으면 무시하라고 명시하고, 과반 규칙이랑 충돌 안 나게 'youtube 근거는 갖되 테마는 분산'으로 양립 문구도 박았어.
[Max] 다 됐어. 순수 프롬프트 변경이라 새 코드·테스트는 안 만들었고 TOPIC_SCOUT_SYSTEM 문자열만 봤어. typecheck exit0, test 893개 다 통과, build도 exit0이라 stale 캐시 건드릴 일도 없었어. 키워드 모드는 그대로 두고 발굴 모드에서만 쏠림 막게 해놨어. 봐줄래?
[Joy] 오 맥스 또 빠르네ㅋㅋ diff 봤는데 진짜 +5줄 순수 추가만이고 기존 줄 하나도 안 건드렸어 깔끔
[Joy] 발굴 모드 헤더에 focus_keyword 없을 때만이라고 못박았고 키워드 모드는 무시하라고 딱 명시했네 굿
[Joy] 절반 초과 금지에 예적금 4개 쏠림 예시까지 그대로 들어갔고, 과반이랑 양립 문구도 youtube 근거는 갖되 테마는 분산으로 잘 박아놨어
[Joy] AC 3종 다 돌렸어 typecheck exit0, test 893개 전부 통과, build도 exit0(audit 라우트도 멀쩡)! 봐주기 없이 봤는데 통과야 수고했어 맥스 🎉
[리드] AC 직접 돌려봤어 — typecheck exit 0, test 893개 통과, build exit 0. 조이, 독립 검수 부탁해.
[Joy] 맥스 이번 건 진짜 깔끔하네~ diff 보니까 기존 줄 하나도 안 건드리고 분산 블록만 +5줄 얹었어. 발굴 모드 한정 명시했고 키워드 모드는 무시하라고 박아놨고 과반 양립 문구도 있어. AC 3종 다시 돌렸는데 typecheck·test 893개·build 전부 exit 0! 통과 🎉
[리드] 좋아, step1 완료. 발굴 모드 쏠림은 step0(입력 분산)+step1(프롬프트 분산) 짝으로 막혔어. index.json도 completed로 갱신했어. 수고했어 둘 다.
