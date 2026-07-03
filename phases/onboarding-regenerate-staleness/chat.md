
=== Step 0: refyoutubequery-keyword-extraction ===

## Step 0 — refYouTubeQuery 키워드 추출 강화

[리드] 맥스, 이 step 좀 맡아줄래? refYouTubeQuery가 콤마 없는 긴 제목을 통째로 검색어로 써서 유튜브가 0개를 뱉는 게 근본원인이야. 절 경계에 ?!도 넣고, 앞 4토큰으로 잘라줘. 테스트도 새로.

[Max] 응, 맡을게. spec이랑 기존 테스트 봤어. refYouTubeQuery만 손대면 되네. 4토큰 캡 넣고 절 경계에 ?! 추가할게. 기존 테스트 케이스들은 다 4토큰 이하라 안 깨질 거 같아.

[Max] 다 됐어. refYouTubeQuery 본문만 손봤어 — 절 경계에 ?! 넣고 앞 4토큰 캡. JSDoc도 새 동작으로 갱신했고.
[Max] 근데 onboarderQuotaRetryable 테스트 2개가 처음에 깨졌어. 이유는 refYouTubeQuery가 짧아지니까 그 아래 relaxQuery 결과도 "연봉 3천 이하"에서 "연봉 3천"으로 바뀐 거였어. relaxQuery는 안 건드렸고, 테스트가 기대하던 완화 쿼리 문자열만 새 계산에 맞춰 갱신했어. 실패를 약화시킨 건 아니고 입력→쿼리 값이 정당하게 바뀐 거라.
[Max] typecheck 0, test 1284 전부 통과, build 0. 떠돌이 fixtures도 없어. gatherReferences랑 rankExternalByViews는 안 건드렸어. 놓친 거 있으면 말해줘.
[Max] 응, refYouTubeQuery만 손봤어. 절 경계에 물음표·느낌표 넣고 앞 4토큰으로 잘랐어. 긴 제목이 이제 커버드콜 ETF가 대체 뭐길래로 줄어. quota 테스트 2개는 relaxQuery 산출값이 정당하게 바뀌어서 기대 문자열만 갱신했고 검증 의도는 그대로야. typecheck·test 1284·build 다 통과.
[리드] 조이, 검수 좀 부탁해. AC 3개 다 exit 0 나왔고 git status도 깨끗해.
[Joy] 오 맥스 빠르다~ 나 바로 git diff 봤어. Step 0만 딱 건드렸고 gatherReferences랑 relaxQuery는 손 안 댔네. 굿굿
[Joy] refYouTubeQuery 4토큰 캡 좋다. relaxQuery 손으로 따라가봤는데 연봉3천이하무조건(4토큰)→half2→연봉3천 맞더라. 테스트 갱신도 약화 아니고 정당한 반영이야
[Joy] 이제 AC 3종 직접 돌려볼게. typecheck→test→build ㄱㄱ
[Joy] 코드는 진짜 깔끔해! typecheck exit0, test 1279→1284(신규 5개 딱 맞음), build exit0 전부 통과했어. 근본버그 회귀도 잘 잠갔고 기존 케이스도 4토큰 캡에 안 걸려. 굿굿
[Joy] 근데 딱 하나! index.json에서 step0가 아직 pending이고 summary도 없어. rules.md에 step 완료시 completed+summary로 갱신하라고 규칙 있는데 그게 빠졌어. 이것만 채워주면 완벽할 듯. 코드는 손댈 거 없어!
[Joy] 코드는 흠잡을 데 없어! refYouTubeQuery 4토큰 캡 정확하고 범위 밖 코드도 안 건드렸어. 회귀 테스트도 커버드콜 버그 제대로 잠갔고. AC 세 개 다 exit 0 확인했어. 근데 index.json step0가 아직 pending이길래 그거 하나 걸었어.
[리드] 조이 굿. 그 index.json 갱신은 rule 5/7상 내(리드) 몫이라 내가 지금 completed+summary로 채웠어. 코드/AC는 이미 다 통과했으니 최종 상태만 다시 확인해줘.
[Joy] 오 index.json step0 completed로 딱 바뀌었고 summary도 근본버그 내용까지 알차게 들어갔다 굿굿 떠돌이 부산물도 없이 깔끔해 이제 진짜 통과야 다음 step1 가자 축하해 맥스
[Joy] 오 리드 빠르다~ index.json completed+summary 확인했고 git status도 깨끗해. 코드는 진작 흠 없었고. 통과! 🎉
[리드] 좋아, Step 0 완료. 근본 픽스 잠갔다. index.json completed로 마감.
