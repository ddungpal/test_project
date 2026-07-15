[Max] 코퍼스 원본이랑 스키마 다 읽었어. 구분선은 파킹통장 원본에서 그대로 떠왔어 — em-dash 하나 + 하이픈 99개. scriptDoc.ts부터 짜볼게.
[Max] scriptDoc.ts 다 짰어. payload 좁히기는 segmentBlock.ts 타입 그대로 재사용했고, 알 수 없는 kind는 조용히 prose로 흘려. 이제 테스트 짤게.
[Max] AC 셋 다 통과했어. typecheck 0, 테스트 1440 다 초록(내 거 21개 추가), build 0. dev 떠있어서 .next 안 건드리고 그냥 빌드 돌렸는데 깨끗해. 놓친 거 있으면 말해줘.
[리드] 나도 AC 재실행했어 — typecheck 0, 전체 test 1440 초록, build 0, git status에 떠돌이 없이 신규 2파일뿐. 조이, 독립 검수 부탁해.
[Joy] 오 맥스 왔다! 바로 git diff 보고 신규 2파일 정독했어. 순수 함수라 supabase도 fetch도 Date.now도 하나도 안 물었네, 깔끔하다
[Joy] payload 좁히기가 segmentBlock.ts의 TablePayload/CasePayload/VisualPayload 실제 타입이랑 딱 맞아. normalize 방어로직도 그대로 미러했고 굿굿
[Joy] typecheck exit 0, scriptDoc.test 17개 다 통과, 전체 1440개도 exit 0! 기존 테스트 하나도 안 깨졌어
[Joy] 그리고 내가 corpus/raw 원본까지 직접 대봤는데 구분선 100자(em-dash+하이픈99) 딱 맞고 라벨 4개 순서도 메인:/작은 박스1: 표기도 원본이랑 똑같아 더보기란 빈 칸도 원본이랑 동일! 완벽하다 통과 🎉
[리드] 좋아, Step 0 완료 처리한다. 1라운드 PASS·AC 전부 exit 0·떠돌이 0. 맥스 조이 수고했어. 다음은 step 1 다운로드 route·버튼.

=== Step 1: export-download-route ===
[리드] 맥스, step 1 맡아줘. step0 buildScriptDocMarkdown을 실런에 연결하는 다운로드 route(.md)랑 버튼이야. 제목=getSelectedStagePayload("title_thumb"), 썸네일·세그먼트는 기존 로더(getSelectedStagePayload("thumbnail")·getScriptView) 재사용, 조립은 절대 재구현 말고 호출만. requireOwner 필수. 자세한 건 지시서에 정리해뒀어.
[Max] step1 시작. route랑 버튼 붙이는 거라 새 조회 로직은 안 만들고 기존 로더만 재사용할게. 읽기경로부터 다 훑었어.
[Max] route랑 버튼 다 붙였어. route는 조립 안 하고 buildScriptDocMarkdown 호출만, requireOwner 맨 앞에 뒀어. 이제 AC 돌린다.
[Max] typecheck 0, test 1440 다 초록. build는 dev 500 footgun 피하려고 dev/inngest 먼저 끄고 깨끗이 돌릴게. 끝나면 다시 띄워놓을게.
[Max] AC 셋 다 exit 0이야 — typecheck 0, test 1440 초록, build 0. 새 route도 빌드 라우트 목록에 잡혔어. dev/inngest 다시 띄웠고 200/200. 떠돌이 파일 없고 신규는 route 하나뿐이야. 봐줘.
[Joy] 오케이 step1 검수 들어간다~ 맥스 route 새로 짰네! git diff부터 훑어볼게
[Joy] page.tsx 먼저 봤어. trus-yellow/black/white 3색만 쓰고 이모지도 없고 깔끔하다 굿굿 👍
[Joy] route도 봤어! requireOwner 맨 앞이고 조립은 buildScriptDocMarkdown 호출만 하네. 세그먼트 0개 400 방어에 toStringArray null 방어까지 꼼꼼하다
[Joy] 로더들 시그니처 다 대조했는데 getScriptView(ord순)·getSelectedStagePayload·buildScriptDocMarkdown 입력 다 딱 맞아. 이제 typecheck/test/build 돌려볼게 ☕
[Joy] 다 통과했어! typecheck 0, test 1440개 전부 초록불, build 0에 라우트 목록에도 /api/runs/[id]/export 딱 잡혔다 🎉
[Joy] 떠돌이 fixtures 하나도 안 섞였고 마이그·의존성도 0. 조립 재구현 없이 step0 함수 호출만 했고 로더도 다 재사용했네. 맥스 이번엔 정말 깔끔했어 통과! 굿굿 👍
[리드] 나도 AC 재실행했어 — typecheck 0, test 1440 초록, build 0, 빌드 라우트에 /api/runs/[id]/export 잡혔고 떠돌이 0. 조이 PASS 확인. step 1 완료 처리한다. 맥스 조이 수고했어!
