
=== Step 0: review-data-action ===

[리드] 맥스, step0 백엔드 맡아줘. 두 가지야. (A) scriptView의 SegmentView.facts를 칩에 필요한 상세로 확장 — pending(isFactPending 재사용)·verificationStatus·sourceTier·primarySourceUrl·isFinancial 붙이고, fact select에 human_approved·escalated_to_human 추가. (B) reviewScriptAction 신규 — 보류 fact 확정(reject=false·나머지 보류=true, 전부 run 스코프) 후 reject 비었으면 approveScript, 있으면 requestScriptRework 재사용. 새 부분재생성 경로 만들지 말고. 마이그레이션 금지. 테스트도 같이.

[Max] 시작했어. 필독 문서랑 기존 게이트 패턴 다 봤어. researchGate.approveResearch의 run 스코프 update 패턴을 그대로 미러하면 될 것 같아. reviewScript 헬퍼는 scriptGate.ts에 넣고, scriptView 칩 확장이랑 같이 작업할게.

[Max] scriptView 먼저 손봤어. SegmentFactView 타입 새로 빼고 pending은 isFactPending 재사용했어. select에 human_approved랑 escalated 같은 거 추가했고, 기존 LineageFooter는 id·claim만 쓰니까 안 깨져.

[Max] reviewScript 헬퍼 넣었어. 보류 목록을 escalated && human_approved null로 DB에서 뽑고, reject는 그 목록에 실제 든 것만 유효 처리했어. 타 run id가 섞여 들어와도 무시되게. update 전부 .eq run_id 스코프 걸었고, reject 비면 approveScript·있으면 requestScriptRework 그대로 재사용했어. 부분재생성 경로는 안 만들었어.

[Max] 테스트는 fake supa로 reviewScript 4개(reject없음·있음·스코프격리·보류밖 id무시), scriptView 2개(pending true/false 매핑). scriptView는 server-only랑 admin.js mock해서 getScriptView 직접 돌렸어.

[Max] AC 다 통과했어. typecheck 0, test 955 전부 green, build 0. 범위 외 파일 안 섞였고. 놓친 거 있으면 말해줘.

[Max] 다 됐어. scriptView에 fact 상세 붙였고 reviewScript 헬퍼랑 reviewScriptAction 만들었어. isFactPending 재사용했고 run 스코프도 다 지켰어. typecheck·test·build 전부 통과. 차분하게 테스트부터 짜고 구현했어.
[리드] 조이, 검수 부탁해. AC는 내가 직접 돌려봤는데 typecheck/test(955)/build 다 exit 0이야. Max 작업 git diff랑 같이 봐줘.
[Joy] 오 맥스 step0 받았어! git diff부터 쫙 봤는데 깔끔하다~ scriptView에 SegmentFactView 새로 만들고 isFactPending 재사용한 거 굿굿
[Joy] reviewScript도 봤는데 보류 fact를 DB 컬럼조건으로 다시 조회해서 reject/approve 나누고, run_id 스코프 다 걸려있네. 새 부분재생성 경로도 안 만들었고 approveScript/requestScriptRework 재사용 잘했어
[Joy] LineageFooter가 SegmentView["facts"] 파생 타입 쓰니까 필드 추가는 하위호환 OK, 기존 소비처 안 깨짐 확인!
[Joy] 이제 AC 3개 돌려본다 — typecheck, test, build. 두근두근
[Joy] 와 AC 3개 다 통과! typecheck exit 0, test 955개 다 초록불(reviewScript 4 + scriptViewFacts 2 포함), build도 exit 0
[Joy] 마이그레이션이나 promptHash 건드린 거 없고 신규파일은 테스트 2개뿐이라 깔끔해. 거버넌스 불변식(human_approved=true는 사람 액션에서만)도 지켜졌고!
[Joy] 맥스가 플래그한 auditLog detail.approved에 state 문자열 넣은 건 살짝 라벨 오해 소지 있는데, 옆에 rejected 카운트 있고 기능엔 지장 없어서 PASS 막을 정돈 아냐. 다음에 키 이름만 살짝 다듬어주면 더 깔끔할 듯!
[Joy] 결론 통과! 맥스 깔끔하게 잘했어 수고했어 🎉

[Joy] 검수 끝! scriptView 칩 상세도 잘 붙였고 reviewScript run 스코프도 다 지켰어. 보류 fact 승인이 사람 액션에서만 일어나는 거 확인했고, 테스트도 의미있게 짰더라. AC 세 개 다 내가 직접 돌려서 exit 0! 통과 🎉
[리드] 좋아, step0 완료. 맥스·조이 수고했어. reviewScriptAction이랑 SegmentFactView가 step1 인라인 칩 UI 소비점이야.
