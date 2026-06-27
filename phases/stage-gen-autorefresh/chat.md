
=== Step 0: proposal-gen-working-marker ===
[리드] 자 시작하자. 버그는 제안 단계 생성 중 run.state가 *_selected에 머물러서 isWorking=false → 페이지 자동갱신이 안 도는 거야. 워커가 생성 중 progress 마커를 남기고, stageProgress가 그걸 보고 isWorking=true로 치게 하면 돼. 맥스, 이거 맡아줄래?
[Max] 시작할게. 관련 파일들 다 읽었어. 버그 이해했고 - 제안 생성 중엔 phase가 working이 아니라 isWorking이 false라 라이브갱신이 안 도는 거.
[Max] 테스트부터 짠다. stageProgress 순수함수라 vitest로 깔끔하게 갈 수 있을 것 같아.
[Max] 코드 다 짰어. 워커는 prep 직전에 "제안 생성 중" 마커 set, try/finally로 감싸서 성공이든 에러든 finally에서 마커 지우게 했어. 기존 성공 시 clear는 finally로 합쳤고.
[Max] stageProgress는 progressNote optional 인자 추가하고, 마커가 합법 상태(생성 대상)에 있을 때만 isWorking true. 종료/검수 상태는 stale 마커 있어도 false로 막았어.
[Max] 이제 typecheck/test/build 돌려본다.
[Max] 다 통과했어. typecheck 0, test 586개 다 그린(새로 짠 9개 포함), build도 깨끗해. 기존 테스트 하나도 안 깨졌어.
[Max] 정리하면 - 제안 생성 중엔 마커가 켜져서 라이브갱신 돌고, 끝나면 finally가 마커 지워서 폴링 멈춰. 종료/검수 상태는 혹시 마커 남아도 무시하게 막아놨고. 놓친 거 있으면 말해줘.
[Max] 다 됐어. 워커가 생성 시작할 때 마커 남기고 try/finally로 성공·에러 양쪽에서 지우게 했어. isWorking은 제안 상태 9종에서만 마커 인정하게 했고. typecheck·test·build 다 통과.
[리드] 깔끔하네. AC 내가 직접 돌려봤는데 셋 다 exit 0이야. 조이, 독립 검수 좀 부탁해. git diff랑 AC 재실행으로.
[Joy] 오케이 맥스 diff 받았어! git diff 쭉 봤는데 try/finally로 잘 감쌌네 굿 일단 typecheck/test/build 돌려볼게
[Joy] 코드 확인 다 했어 멱등 early-return이랑 reject는 마커 set 전에 빠져나가서 불필요한 progress write 안 생기고 setProgress는 throw 안 하니까 finally도 안전하네 깔끔하다 이제 AC 돌린다
[Joy] 다 통과! typecheck test build 전부 exit 0 이고 테스트 586개 다 초록불 stageProgress 9개 신규도 포함이야
[Joy] PROPOSAL_GEN_STATES도 종료 검수 working 상태 다 정확히 제외했고 finally로 에러 경로 마커 클리어까지 완벽해 무한폴링 걱정 없겠다 통과시킬게 맥스 수고했어 🎉
[Joy] 검수 끝! git diff 다 봤고 AC 3종 직접 돌렸어. 에러 경로 finally 클리어도 실재 확인했고, PROPOSAL_GEN_STATES가 종료·검수 상태 제대로 빼고 있어서 stale 폴링 걱정 없어. exit 다 0, 586개 테스트 통과 🎉
[리드] 좋아, 한 번에 통과. 수고했어 둘 다. step 0 완료 처리할게.
