
=== Step 0: shorts-filter ===

[리드] 자 시작하자. 유튜브 레퍼런스에 숏폼이 섞여 들어오는 문제야. searchYouTube 단일 지점에서 영상 길이로 롱폼만 거르면 돼. 맥스가 맡아줘.

[Max] 알겠어. externalSignals 읽었어. searchYouTube 한 군데서 길이로만 거르면 모든 소비처가 같이 롱폼만 받게 되네. 길이 파싱 순수헬퍼부터 만들고 테스트 먼저 짤게.

[Max] 다 넣었어. parseISODurationSec·isLongform 순수헬퍼 추가하고, VideoStats에 durationSec 얹고, fetchVideoStats part를 statistics,contentDetails로 확장했어. searchYouTube는 통계 보강 직후 map 전에 isLongform으로 필터만 끼웠고 나머진 안 건드렸어. 이제 AC 돌려볼게.

[Max] typecheck 0, 테스트 929개 다 통과(longformFilter 15개 신규), build도 깨끗해. 길이 미상은 null로 통과시켜서 quota 실패 때 풀이 통째로 비는 일은 없게 막아놨어. index.json도 completed로 갱신했어. 놓친 거 있으면 말해줘.

[리드] AC 직접 돌려봤어 — typecheck 0, test 929, build 0 다 통과. 조이, 독립 검수 부탁해.
[Joy] 오 맥스 빠르다~ git diff부터 본다! 길이필터 단일지점에 딱 들어갔네 굿굿
[Joy] typecheck 0, test 929 다 통과(기존 923서 +15), build 0! 셋 다 초록불이야 굿굿
[Joy] 소비처 안 건드렸고 경계값도 SHORTS_MAX_SEC 기준이라 깔끔. 통과! 다만 fixtures 신규파일 하나는 step 범위 외니 커밋 땐 빼는 게 좋겠어

[리드] 좋아, 1라운드 PASS. step0 completed로 마무리한다. 다들 수고했어.
