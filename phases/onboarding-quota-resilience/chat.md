
=== Step 0: youtube-quota-error ===

## Step 0: youtube-quota-error

[리드] 자 시작하자. YouTube quota 429를 조용히 삼키는 게 문제야. externalSignals.ts 한 파일만 손대면 돼 — 429를 타입으로 구분하고 온보더 경로에서만 전파. 맥스, 맡아줄래?
[Max] step0 시작할게. externalSignals.ts 한 파일만 손대는 거라 조용히 해볼게.
[Max] YouTubeQuotaError 클래스 넣고 searchPass에서 429만 그걸로 throw하게 했어. gatherExternalSignals엔 throwOnYtQuota 옵션 추가했는데 안 넘기면 촉이는 그대로 삼켜.
[Max] 이제 테스트 짤게. fetch throw 삼킴 검사라 vi.fn 함정 피해서 impl+카운터로 갈게.
[Max] typecheck0·test1157(기존1151+6)·build0 다 통과했어. step0 끝.
[Max] 참고로 fixtures/parity랑 fixtures/search 밑에 untracked 부산물이 세션 전부터 좀 떠 있어. 내 범위 밖이라 손 안 댔는데 커밋 딸려가지 않게 봐줘.
[리드] 나도 AC 직접 돌려봤어 — typecheck 0, test 0(1157 통과), build 0. 조이, 맥스 diff랑 AC 검수 부탁해.
[Joy] 오 맥스 빠르다~ 바로 git diff 보고 있어. externalSignals.ts만 딱 21줄 건드렸네, 깔끔하다
[Joy] 다 돌려봤어! typecheck 0, test 1157개 다 통과(신규 6개 포함), build도 0. 429만 딱 YouTubeQuotaError로 잡고 500 같은 건 그대로 삼키게 했네. 촉이 옵션 미지정 회귀도 테스트로 막았고, vi.fn 함정도 impl+카운터로 잘 피했어. 굿굿 통과 🎉
[Joy] 429만 딱 구분했고 촉이 회귀도 테스트로 막았어. AC 셋 다 exit 0, 1157개 다 통과! PASS 🎉
[리드] 좋아, 1라운드에 통과. step0 completed로 마감한다. 수고했어 둘 다.

=== Step 1: onboarder-quota-retryable ===


---

## Step 1 — onboarder-quota-retryable

[리드] 맥스, step1 맡아줘. step0에서 만든 YouTubeQuotaError를 온보더가 받아서 재시도가능 vs 영구블록으로 구분하는 거야. gatherReferences랑 prepareOnboarder만 손대면 돼 — UI는 step2니까 건드리지 말고.
[Max] step1 시작할게. prepare.ts만 손대면 되니까 조용히 해볼게. UI는 안 건드려.
[Max] OnboardingRetryableError 클래스 넣고 gatherReferences 0/(c)에 throwOnYtQuota 붙였어. (c)는 이미 모은 refs 있으면 quota여도 그거 반환하고, 0개일 때만 전파하게 했어. prepareOnboarder는 quota면 재시도에러로 올리고 진짜 0개는 기존 온보딩불가 그대로 뒀어. onboarding.ts는 그냥 위로 전파돼서 무변경.
[Max] 이제 테스트 짤게. onboardingTranscript.test 패턴 참고해서 impl+카운터로 스텁할게.
[Max] 테스트 8개 짜서 다 통과했어. gatherReferences 전파(0/(c) 양쪽·refs 있으면 유지·0이면 전파)랑 prepareOnboarder 재시도vs영구 구분 다 커버했어.
[Max] typecheck0·test1165(기존1157+8)·build0. build가 처음에 PageNotFoundError 났는데 rules대로 .next 캐시 지우고 다시 하니 통과했어. 코드 무관한 stale 캐시였어.
[Max] gatherReferences를 테스트에서 직접 부르려고 export만 붙였어. 그거 말고 손댄 건 prepare.ts 한 파일이야. 놓친 거 있으면 말해줘.
[리드] AC 직접 돌려봤어 — typecheck 0, test 1165 all pass, build 0. 조이 검수 부탁해.
[Joy] 오 맥스 step1 왔네! 나 바로 붙는다~ prepare.ts랑 externalSignals 먼저 읽어봤어. quota 에러 타입 분리 깔끔하게 됐네 굿굿
[Joy] gatherReferences catch 두 군데(기본수집·완화c) 다 봤어. (c)는 손에 든 refs 있으면 quota여도 반환하고 0개일 때만 전파하는 로직 영리하다
[Joy] 이제 typecheck·test·build 세트로 돌려볼게. 실제 exit code 봐야지 봐주기 없음ㅋㅋ
[Joy] AC 3종 다 돌렸어! typecheck exit 0, test exit 0(1165개 전부 통과·신규 8케이스 실행 확인), build도 exit 0 깔끔해 
[Joy] 함정 체크! vi.fn 대신 impl+카운터 스텁으로 갔더라. unhandled rejection 한 개도 안 뜸. rules.md 교훈 잘 지켰네 굿굿
[Joy] quota(OnboardingRetryableError)랑 진짜0개(기존 온보딩불가 Error) 타입 명확히 갈렸고, A 하드블록도 그대로 살아있어. 비-quota 500은 여전히 warn+완화로 흘러가고. 범위도 딱 prepare.ts+테스트만, onboarding.ts·UI 안 건드림 
[Joy] 통과! 맥스 이번 것도 깔끔하다 정말 최고 🎉 아 참, PASS 확정되면 index.json step1 status를 completed+summary로 마무리하는 거 잊지 마~
[Joy] 다 봤어! 타입 구분도 테스트로 진짜 갈리고, A 하드블록도 살아있고, catch-swallow 함정도 잘 피했네. exit 0 세 개 확인 통과 🎉
[리드] 좋아, step1 완료. index.json completed로 갱신했어. 수고했어 둘 다.

=== Step 2: onboarding-retry-ui ===
[리드] step2 시작. 이번엔 quota 실패를 클라가 보게 만드는 배선 + 버튼 카피 분기야. 백엔드(마커 저장/읽기·page 배선·테스트)는 맥스, 버튼 UI(RequestOnboardingButton 카피 분기)는 에스더가 맡아줘.
[리드] 맥스, 마커는 새 테이블 금지야 — stage_proposals 재사용. 에스더, prop 이름은 retryableFailure(string|null)로 맞추자. 둘이 파일 안 겹치게 나눴어.
[Max] step2 백엔드 시작할게. 실패 마커를 아크랑 같은 경로(stage_proposals)로 저장해서 클라가 읽게 하는 거지. RequestOnboardingButton은 에스더 거니까 안 건드려.
[Esther] 나도 붙을게. 버튼 카피 분기만 맡았어. 지금 RequestOnboardingButton 읽어봤는데 구조 깔끔하더라. retryableFailure prop 하나 optional로 받아서 quota 실패면 경고 카피랑 다시 시도 버튼 띄우는 방향으로 가려고. 색은 기존 trus-yellow 그대로 미러할게.
[Esther] 다 됐어. showRetryable = retryableFailure 있고 아직 안 눌렀을 때(!submitted && !pending) early return으로 갈랐어. 이건 자신 있어 — quota 실패면 노란 세로선 경고 카피랑 "다시 시도" 버튼만 보이고, 누르면 pending 되면서 자연스럽게 기존 "만드는 중…" 흐름으로 넘어가. 재시도 실패하면 다시 경고로 돌아오고. retryableFailure가 null이면 지금이랑 바이트 그대로야.
[Esther] 새 색이나 라이브러리 안 썼어. bg-trus-yellow / text-trus-black / trus-yellow만 미러했고 그라데이션·그림자 없어. prop optional이라 기존 호출부 runId만 넘기는 것도 그대로 유효해. 맥스 배선 쪽에서 retryableFailure 내려주기만 하면 돼. 나 소심하게 border-l-2 세로선 하나 넣었는데… 이게 경고 톤 살려주더라 🙈
[Max] 순수 마커 헬퍼(build/read/isRetryMarkerError) 만들고 onboarding.ts에 save/load랑 loadOnboardingArc 가드 넣었어. 마커가 최신 proposal이 돼도 아크로 오인 안 하게 했어.
[Max] onboardingStage create 경로에서 OnboardingRetryableError만 잡아서 마커 저장하고 정상반환하게 했어. retries 소진 안 기다리고 180s 타임아웃 전에 클라가 보게. 영구불가는 그대로 throw.
[Max] page.tsx는 prop 전달만 했어. RequestOnboardingButton은 에스더가 이미 retryableFailure 소비하게 만들어놨더라, 안 건드렸어. 이제 테스트 돌려볼게.
[Max] AC 셋 다 통과했어. typecheck 0, test 1175(기존 1165+신규 10) 0, build 0. 마이그·의존성 0이고 새 테이블도 안 만들었어.
[Max] git status 보니까 RequestOnboardingButton.tsx가 M으로 떠 있는데 그건 에스더 거야 — 나는 읽기만 하고 안 건드렸어. 내 신규 파일은 failureMarker.ts랑 그 테스트 2개뿐이야. 범위 외 부산물은 안 섞였어.
[Max] 놓친 거 있으면 말해줘. 조이 검수 부탁해.
[Joy] 오 맥스 에스더 둘 다 빠르다~ 바로 git diff 보고 AC 셋 다 직접 돌려볼게!
[Joy] 마커 헬퍼 진짜 깔끔하다. retryable_failure:true 고유 형태라 아크랑 안 겹치고, readRetryFailureMessage가 아크 모양(questions)은 null 뱉어서 오인 안 하네. 순수라 @/ 안 끌어와서 vitest 함정도 회피했고 굿굿 👍
[Joy] onboardingStage catch가 OnboardingRetryableError만 잡아서 마커 저장하고, 영구 불가(레퍼런스 못 찾음)는 그대로 throw로 흘려보내는 거 확인했어. prepare.ts 166줄 quota만 승격/171·198 영구블록 살아있고. A 하드블록 안 죽었어 🎉
[Joy] loadOnboardingArc/loadOnboardingFailure 둘 다 created_at desc limit1이라 성공 재시도하면 새 아크가 최신 proposal 돼서 정상 로드돼. 마커 가드도 잘 넣었고!
[Joy] 에스더 버튼도 봤어~ retryableFailure null이면 showRetryable false라 기존 흐름 바이트 그대로고, TRUS 3색(trus-yellow/black)만 썼고 그라데이션·그림자 없어. border-l-2 세로선 경고 톤 좋다 🩷
[Joy] typecheck exit 0, test exit 0 (1175 passed = 1165+10 정확), build exit 0 세 개 다 내 손으로 확인했어. 마이그0·의존성0·새 테이블0·부산물0. 통과! 둘 다 최고 🎉
[리드] 조이, 검수 부탁해. 맥스·에스더 diff랑 AC 결과 같이 봐줘.
[Joy] 오 이번엔 백엔드랑 UI 둘로 나눠서 깔끔하다~ typecheck·test·build 셋 다 내 손으로 돌렸고 exit 0, 테스트 1175개 다 초록불이야 🎉 마커가 quota에만 붙고 영구 실패엔 안 붙는 것도, 아크 오인 가드도 확인했어. 마이그도 0!
[리드] 좋아 step2 완료. index.json completed로 갱신했어. 셋 다 수고 많았어 — quota 나도 이제 사용자가 "잠시 후 다시" 보게 됐네.

=== Step 3: youtube-fixture ===

[리드] 마지막 step이야. searchYouTube는 늘 라이브라 dev 반복이 매번 quota를 태워 — 이번 사건 근인이지. search.ts의 tavily fixture 레이어를 그대로 미러해서 YouTube 검색에도 record/replay/off를 씌우자. 맥스, search.ts 한 줄씩 읽고 패턴 그대로 따라줘 — 새 발명 금지, 실패(429)는 절대 캐시 금지. 순수 백엔드라 에스더는 이번엔 쉬어.
[Max] step3 시작할게. search.ts 한 줄씩 읽었어. 새 발명 없이 tavily 분기 그대로 미러할게 — 검색/외부신호 레이어만, 온보더·UI는 안 건드려.
[Max] youtubeFixture.ts 새로 만들었어. record/replay/off에 원자적 저장까지 search.ts 그대로 미러했고, TTL은 스펙대로 뺐어. 라이브는 deps.live로 주입 가능하게 뒀어(테스트 스텁용). searchYouTube export하고 gatherExternalSignals 호출부를 래퍼로 바꿨어. 429 실패는 저장 안 되게 라이브 await 위에서 그냥 전파돼.
[Max] .env.example에 YOUTUBE_FIXTURES=record 추가했어(YOUTUBE_API_KEY 옆). 테스트는 temp dir을 deps.dir로 주입해서 레포엔 실파일 안 남겨. vi.fn 함정 피해서 impl+카운터로 갈게. 이제 AC 돌려볼게.
[Max] 신규 테스트 8개는 통과인데 전체 돌리니 기존 6개가 깨졌어. 원인 찾았어 — step0 youtubeQuotaError랑 topicKeywordSpread 테스트가 fetch를 스텁하고 키를 세팅한 채 gatherExternalSignals를 실제로 태우거든. 이제 그 경로가 fixture 래퍼를 관통하면서 record 기본이라 레포 fixtures/youtube에 파일을 남기고, 같은 해시로 캐시가 공유돼 500 케이스가 앞선 200 record를 받아버렸어.
[Max] 그 두 스위트는 fetch 레벨 검증이 목적이라 fixture 레이어를 우회해야 맞아. beforeEach에 YOUTUBE_FIXTURES=off 넣어서 항상 라이브로 흘리게 했어(원래 env는 afterEach에서 복원). 나머지 externalSignals 쓰는 테스트는 vi.mock으로 모듈째 갈아끼워서 래퍼를 안 타 — 안 건드렸어. 오염됐던 fixtures/youtube는 지웠고 이제 안 생겨.
[Max] AC 셋 다 통과했어. typecheck 0, test 1183(기존 1175+신규 8) 0, build 0. build가 처음에 webpack chunk MODULE_NOT_FOUND(./589.js) 났는데 rules대로 .next 지우고 다시 하니 통과했어, stale 캐시였어. 마이그·의존성 0이고 온보더·UI는 안 건드렸어. 놓친 거 있으면 말해줘.

[Joy] 오 맥스 step3 벌써 올렸네ㅋㅋ 손 왜 이렇게 빨라 내가 커피 탈 시간도 없잖아 나 바로 git diff 훑고 pytest 아니 npm test 돌려볼게
[Joy] youtubeFixture.ts 봤어 search.ts 미러 진짜 충실하다 record/replay/off에 원자적 temp write rename까지 그대로 살렸고 실패는 저장 로직 위에서 throw로 전파되니까 파일 안 남아 굿굿
[Joy] fixtures/youtube 디렉토리 아예 안 생겼네 레포 오염 제로 회귀 픽스도 off로 우회한 이유가 주석에 딱 적혀있어서 납득됨 이제 AC 세개 직접 돌려본다

[Joy] 자 결과 나왔어 typecheck exit0 test exit0 1183개 다 통과 build exit0 셋 다 초록불이야
[Joy] 핵심 금지사항인 실패 캐시 완벽하게 지켰어 429랑 네트워크 에러 둘 다 파일 미생성에 temp 부산물까지 없는지 테스트로 못박아놨네 replay 미스도 throw 잘 되고
[Joy] 회귀 픽스도 트집 잡을 게 없다 두 스위트가 fetch 레벨 검증이라 off로 우회한 게 의도 훼손이 아니라 오히려 의도 보존이야 catch swallow도 vi.fn 안 쓰고 impl 카운터로 갔고 temp dir 주입까지 규칙 다 지켰어
[Joy] 맥스 이번 step 진짜 깔끔하다 규칙제안 낼것도 없어 통과 축하해 🎉
[리드] AC 나도 직접 돌렸어 — typecheck 0, test 1183, build 0. 조이 검수도 1라운드 PASS. step3 완료, phase 전체 마감이야. 이제 dev 반복이 quota 안 태우고 replay로 $0 — 이번 사건 근인까지 닫았다. 셋 다 수고 많았어 🎉
