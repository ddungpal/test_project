
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

=== Step 1: review-inline-ui ===

[리드] 맥스, step1 프론트야. ScriptReview를 {runId, segments}로 확장해서 인라인 사실 칩 검수 만들어줘. 핵심 셋. (1) 세그먼트 본문 + 그 세그먼트 fact를 칩으로. SegmentList의 SegmentBody를 export해서 재사용해(본문 렌더 중복 금지). (2) 보류(pending) fact는 ResearchReview 패턴대로 control 슬롯에 승인/반려 토글(기본 승인) + "확인 필요". 비보류 verified는 출처만, 미검증(verificationStatus!=verified)은 가벼운 표식. SegmentFactView는 FactView 서브셋이라 FactCard 그대로 못 씀 — 작은 칩 새로 만들어. (3) "최종 승인"이 reviewScriptAction(runId, {rejectFactIds}) 호출, 반려 있으면 confirm 다이얼로그 후. 기존 수정요청 버튼은 보조로 유지. 페이지 script_review 분기는 ScriptReview만 렌더(SegmentList 중복 제거), script_ready/approved/published의 SegmentList는 그대로. 서버 전이 로직 절대 UI에서 중복 금지 — rejectFactIds만 모아 넘겨. TRUS 3색만, 그림자·그라데이션 금지.

[Max] step1 시작할게. 완성 대본에 fact 칩 인라인으로 띄우고 한 화면에서 최종검수 하는 UI. 본문은 SegmentBody 재사용하고, 보류 fact만 승인/반려 토글 붙일 생각이야.
[Max] ScriptReview 본문+칩 다 붙였고 page.tsx 배선도 바꿨어. SegmentBody랑 safeHref는 export해서 재사용. 이제 typecheck/test/build 돌려본다.
[Max] AC 다 통과했어. typecheck 0, test 955개 통과, build 0. 범위 외 파일도 없어. 칩은 보류만 토글 달았고 verified는 출처만, 나머지는 미검증 표식만 가볍게 뒀어. 놓친 거 있으면 말해줘.

[Esther] 나 왔어. Max가 만든 ScriptReview 인라인 검수 UI 디자인 관점에서 볼게. 본문이랑 fact 칩이 한 화면에 섞이는 구조라 시각 계층이 제일 중요할 것 같아.

[Esther] 3색이랑 안티슬롭은 깔끔해. 그라데이션 그림자 라운딩 다 없고 이모지도 안 남발했어. 여기는 잘 지켰어.
[Esther] 근데 두 가지가 좀 아쉬워. 첫째, 출처 URL에 truncate만 걸려있고 title 폴백이 없어서 URL이 잘리면 전체를 볼 방법이 없어. 같은 앱 SegmentList는 title 다 주거든. 이건 맞춰야 해.
[Esther] 둘째, 확인 필요 칩은 노랗게 강조됐는데 그 칩을 담은 컨테이너는 일반 칩이랑 똑같이 흰 보더라서, 단락이 여러 개면 어디 확인할 게 있는지 한눈에 안 들어와. 보류 칩 컨테이너에 노란 좌측 보더 살짝 줘서 스캔되게 하는 게 확실히 나아. 이건 내가 자신 있어.

[Esther] 둘 다 고쳤어. 출처에 title 폴백 넣었고, 보류 칩엔 노란 좌측 보더 살짝 줬어. 로직은 하나도 안 건드리고 className이랑 마크업만. typecheck build test 다 통과(955개 그린). 나머지는 진짜 깔끔하게 잘 만들었더라. 수고했어 Max 🙈

[리드] 조이, 검수 부탁해. AC는 Esther 수정까지 반영해 내가 직접 돌렸고 typecheck/test(955)/build 다 exit 0이야. Max랑 Esther 작업 git diff 같이 봐줘.

[Joy] 자 step1 검수 시작! git diff 쭉 봤는데 ScriptReview에 segments 받아서 인라인 칩 깔끔하게 잘 붙였네. SegmentBody랑 safeHref export 재사용한 거 굿굿
[Joy] 백엔드 소비점도 봤어 reviewScriptAction(runId, {rejectFactIds}) 시그니처 정확히 맞고, 서버 전이 로직은 안 건드렸어. 부분 재생성 신규도 없고
[Joy] page.tsx에서 script_review만 통합하고 script_ready/approved/published SegmentList는 그대로 둔 것도 확인! 이제 AC 3개 돌려볼게
[Joy] typecheck exit 0, test 955개 전부 통과, build도 exit 0! /audit 포함 6페이지 정상 생성됐고 stale 캐시 이슈 없었어
[Joy] TRUS 3색만 썼는지도 확인했는데 trus-yellow/white/black만 있고 그라데이션 그림자 임의색 하나도 없어. 완벽하다 통과 🎉
[리드] 좋아 step1 완료. 맥스·에스더·조이 수고했어. 한 라운드에 PASS — 이제 대본 본문에 인라인 사실 칩으로 한 화면 최종검수가 된다. autoflow 단일 최종검수 동선의 UI가 닫혔어.
