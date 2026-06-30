
=== Step 0: script-review-landing ===

[리드] 자 이번 step은 작아. 짠펜이 대본 다 쓰면 script_ready에서 멈추는데, 거기 남은 "대본 검수 시작" 클릭 하나를 없애서 바로 script_review로 착지시키는 거야. researchStage s3 패턴 그대로 미러하면 돼.
[리드] 맥스, 이거 좀 맡아줄래? scriptStage.ts에 enter-script-review step 분기 추가 + scriptGate.enterScriptReview 테스트 잠그기.
[Max] 관련 파일 다 봤어. researchStage s3 패턴 그대로 미러할게. script-write 성공이고 script_ready일 때만 enter-script-review 별도 step으로 분리해서 착지시킬 거야. 동적 import도 s3랑 똑같이.
[Max] 다 해놨어. scriptStage에 enter-script-review 분기 넣었고, rework나 캡 일시정지일 땐 안 타게 가드 걸었어. enterScriptReview 테스트도 새로 만들어서 전이·멱등·잘못된 상태 가드 세 케이스 잠갔고.
[Max] typecheck 0, 테스트 958 통과(신규 3개 포함), build도 0. 새 이벤트나 함수는 안 만들고 기존 enterScriptReview만 재사용했어. 놓친 거 있으면 말해줘.
[리드] 맥스 끝냈어. typecheck 0, 테스트 958 통과, build 0 — AC 직접 돌려서 확인했어.
[리드] 조이, 검수 좀 부탁해. git diff랑 AC 재실행으로 독립 검증해줘.
[Joy] 오 맥스 깔끔하다 step0 검수 시작할게 git diff부터 봤어
[Joy] enter-script-review 별도 step.run으로 잘 빼놨네 script_ready일 때만 타고 rework랑 aborted는 안 타는거 코드로 확인했어 굿굿
[Joy] researchStage s3랑 똑같이 enterScriptReview랑 createAdminClient만 재사용했고 새 이벤트 함수 안 만든것도 확인 멱등성도 chk
[Joy] 테스트 3케이스 전이 멱등 잘못된 from-state 가드까지 실제 동작 잠그네 인메모리 fake라 inngest 하니스도 안 끌어왔고
[Joy] typecheck 0 vitest 958 passed build 0 다 통과 마이그도 0이고 UI도 안 건드렸어 통과야 수고했어 맥스
[Joy] 다 봤어! git diff까지 직접 대조했고 AC 셋 다 exit 0이야. 가드도 이중으로 안전하고 새로 발명한 거 하나도 없어. 깔끔해 통과! 🎉
[리드] 좋아, step 0 PASS. script_ready는 이제 전이 중 잠깐만 머무는 자리가 됐고 happy-path 사람 접점은 검수 화면 하나로 줄었어. index.json 갱신 완료. 수고했어 둘 다!
