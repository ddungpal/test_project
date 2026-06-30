
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

=== Step 1: research-gate-cleanup ===

[리드] 자 이번이 리서치 UX 대수술 마지막 step이야. step0이랑 Phase1으로 이제 리서치 게이트 상태들(research_scoped/ready/review)이랑 script_ready가 다 자동 통과돼서, 거기 박혀있던 수동 버튼·게이트 UI가 전부 죽은 코드가 됐어. 그걸 WaitingNote 진행표시로 바꾸고 스테퍼 문구도 자동흐름에 맞게 고치는 거야.
[리드] 맥스, page.tsx 맡아줘. ResearchSection/ScriptSection의 죽은 게이트들 WaitingNote로 교체하고, 죽은 import랑 scope 조회 제거해줘. 컴포넌트 파일은 절대 지우지 말고 import·사용만 빼. ResearchReentry 재진입도 happy-path에서 드랍이야.
[리드] 에스더, ResearchPhaseStepper.tsx 카피 좀 맡아줘. "내가 선택", "검수 진입 대기" 같은 수동 게이트 표현 빼고 "셜록이 알아서 진행 중"이 읽히게. 상태 표시기 자체는 유지하고 문구만.
[Max] page.tsx 다 봤어. ResearchSection이랑 ScriptSection의 죽은 게이트들 WaitingNote로 바꾸고, 죽은 import랑 scope 조회 정리할게. 재진입은 happy-path에서 빼고.
[Esther] 음 나도 ResearchPhaseStepper 시작할게. 파일이랑 설계 문서 다 읽었어. 게이트가 다 자동 통과되니까 스테퍼 카피가 아직 수동 클릭 전제로 박혀있더라고. 거기만 자동흐름 말투로 손볼게. 마크업이랑 클래스는 안 건드려.
[Esther] 다 고쳤어. "내가 선택" 빼고 "셜록이 검증 범위 자동 선택"으로, 세번째 단계 라벨도 "검수"가 남으면 사람이 또 클릭하나 오해할 거 같아서 "정리"로 바꾸고 부제는 "검수는 대본 단계에서 한 번"으로 명확히 했어. 하단도 "대기" 빼고 "셜록이 진행 중"이 읽히게 했어.
[Esther] 한 가지 손댄 게 있는데 research_ready를 working true로 바꿨어. 이 상태가 예전엔 "검수 진입 대기"라 멈춰있는 표시였는데 이제 자동으로 넘어가는 통과점이라 펄스 돌면서 "진행 중"으로 읽혀야 맞거든. phaseOf 상태→idx 매핑은 그대로 뒀어. 이건 자신 있어.
[Esther] typecheck 돌렸어. 내 ResearchPhaseStepper는 에러 0이야 깨끗해. 지금 뜨는 두 개는 page.tsx의 getResearchScopeView랑 scope prop 관련인데 맥스 작업 중인 파일이라 내 쪽 아니야. 맥스가 scope 조회 빼는 중이라 잠깐 깨진 거 같아. 나는 카피랑 주석만 손댔고 마크업 클래스는 그대로야. 끝!
[Max] 다 해놨어. research_scoped/ready/review랑 research_approved/script_ready의 죽은 게이트 다 WaitingNote로 바꿨고, 안 쓰는 ApproveAllInline 헬퍼랑 죽은 import 일곱 개, scope 조회까지 정리했어. ResearchReentry는 happy-path에서 뺐고 파일은 안 건드렸어. SegmentList는 approved/published에서 아직 쓰여서 남겨뒀어.
[Max] typecheck 0, 테스트 958 통과(회귀 0), build 0. ResearchPhaseStepper는 에스더 거라 안 건드렸어. 놓친 거 있으면 말해줘.
[Joy] 오 두 파일 다 봤어. 죽은 게이트 import(EnterReviewButton·ResearchScopeGate·ResearchReview 등) 싹 빠지고 WaitingNote로 깔끔하게 교체됐네 굿굿
[Joy] 보존 대상도 다 확인했어 — 시작버튼·ScriptReview·완료뷰(approved/published)·ResearchPanel·진행마커 전부 살아있고, 컴포넌트 파일은 하나도 안 지웠어(import만 제거). git status에 D 없음
[Joy] scope/getResearchScopeView/ScopeGateView 제거 후 죽은 import 없는지 눈으로 대조했는데 깨끗해. Promise.all에서도 scope 조회 잘 빠졌고
[Joy] 에스더 스테퍼 문구도 굿 — "내가 선택"·"검수 진입 대기" 사라지고 "셜록이 자동" 톤으로. phaseOf 매핑이랑 working/allDone 구조 그대로 유지. TRUS 3색만 썼어
[Joy] 이제 AC 3종(typecheck·test·build) 돌려볼게! 잠깐만~
[Joy] 와 다 통과!! typecheck exit 0, test 958개 전부 green, build도 exit 0 (/runs/[id] 라우트 정상)
[Joy] 테스트 삭제/약화도 없고(tests 디렉토리 변경 0), 마이그레이션·새 의존성·서버액션 손댄 거 하나도 없어. 딱 UI만 정확하게 도려냈네
[Joy] 맥스 에스더 둘 다 깔끔하게 잘했어 — 통과! 🎉
[리드] 좋아 step1 PASS. AC도 내가 직접 다시 돌려서 셋 다 exit 0 확인했어. 리서치 UX 대수술 마지막 칸까지 닫혔다 — happy-path 사람 접점은 이제 시작버튼·최종검수 둘뿐이고 중간 게이트는 다 자동흐름이야. index.json 갱신 완료. 고생했어 셋 다!
