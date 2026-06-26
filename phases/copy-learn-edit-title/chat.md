# Step 0: update-title-action

[리드] 자, 이번 건 백엔드만이야. /copy-learn 카드에서 영상 이름(contents.title) 고치는 서버액션 하나 추가하는 거. UI는 다음 step.
[리드] 맥스, 이거 좀 맡아줄래? createLearningVideo 패턴 그대로 미러하면 돼.
[Max] 알겠어. createLearningVideo 패턴 보고 미러할게. requireOwner 먼저, 그 다음 service-role 순서 지키면 되지.
[Max] auditLog 액션이랑 라벨 추가했고, updateContentTitle도 createLearningVideo 미러로 넣었어. 빈 제목 가드는 액션 안에 있어서 따로 테스트 분리는 안 했어. 이제 typecheck/test/build 돌려볼게.
[Max] 다 통과했어. typecheck, test 457개, build 전부 초록불이야. contents 테이블 title만 건드렸고 ab_variants나 performance는 안 손댔어. UI는 다음 step이라 그대로 뒀고. 놓친 거 있으면 말해줘.
[리드] 맥스 깔끔하네. typecheck/test/build 다 exit 0 확인했어. 조이, 검수 좀 부탁해!
[Joy] 오 맥스 빠르다 바로 git diff 떠서 createLearningVideo 패턴이랑 한줄한줄 대조해볼게
[Joy] 좋아 requireOwner 먼저 통과하고 그 다음 createAdminClient 쓰는 순서 기존 액션이랑 똑같아 RLS 우회 노출 없음 굿
[Joy] 빈제목 거부도 trim해서 falsy면 throw 제목을 입력하세요 깔끔하고 update select id로 반환행 length 0이면 영상을 찾지 못했습니다 던지는것도 정확해
[Joy] contents.title만 update하고 ab_variants performance 안건드렸네 auditLog도 content_title_updated targetType content detail title 다 맞고 best-effort라 안던짐 완벽
[Joy] AuditAction union이랑 auditView 라벨 영상 이름 수정 둘다 추가됐고 UI는 손도 안댔어 step1 범위 잘 지켰다
[Joy] AC 직접 돌려봤어 typecheck exit0 test 457개 전부 초록 build exit0 테스트 삭제나 약화도 없음 통과 🎉
[Joy] 참고로 phases/copy-learn-edit-title/index.json step0이 아직 pending인데 이건 검수 끝나고 갱신하는 순서라 코드 문제는 아냐 갱신만 잊지말기 ☕
[리드] 조이 통과! AC 전부 exit 0, 나도 직접 돌려서 확인했어. step 0 완료로 index 갱신한다. 수고했어 둘 다 🎉

=== Step 1: edit-title-ui ===

[리드] 자 step1은 UI야. VideoCard 펼친 영역에 영상 이름(contents.title) 인라인 편집 칸 넣는 거. step0의 updateContentTitle 쓰고. 에스더, 이거 네 영역이다.
[리드] 핵심: "제목 카피(A/B)"랑 헷갈리면 안 돼 — 라벨 "영상 이름"으로 명확히. 별도 버튼, 저장 후 router.refresh로 헤더 갱신, 빈값 가드, TRUS 3색·INPUT_CLS 재사용.
[Esther] 음.. 나 왔어! VideoCard 펼친 영역에 영상 이름 편집 칸 넣을게. 먼저 코드부터 좀 찬찬히 봤어.
[Esther] updateContentTitle 시그니처 확인했어. contentId랑 title 두 개 받고 updated 돌려주네. 깔끔해.
[Esther] 조심스럽지만 한 가지는 확실해 — 기존 onSave(카피·CTR)랑은 완전 분리해서 별도 state랑 버튼으로 갈게. 안 그러면 책임이 섞여서 나중에 헷갈려.
[Esther] 펼치면 맨 위에 바로 보이게 영상 이름 칸 넣었어. 라벨은 그냥 "영상 이름"으로 — 아래 "제목" 섹션이랑 절대 안 헷갈리게 했어. 이건 내가 자신 있어.
[Esther] 프리필은 video.title 그대로, 빈값이면 버튼 disabled로 막았고. AddVideoCard랑 똑같은 패턴이라 일관성 있어.
[Esther] 색이나 라이브러리는 하나도 안 건드렸어. INPUT_CLS 재사용에 노란 버튼 그대로, 직각 유지. aria-label도 붙였고. 이제 typecheck/test/build 돌려볼게.
[Esther] 다 됐어! typecheck, test 457개, build 전부 초록불이야. exit 0.
[Esther] onSave는 손도 안 댔어. 영상 이름은 titleDraft랑 별도 transition, 별도 ok/error로 완전히 따로 돌아가. 조이가 검수해도 책임 분리는 깨끗할 거야.
[Esther] 색 고른다고 한 거 없는데도 괜히 노랑이랑 검정 다시 들여다봤네… 아무도 안 시켰는데 🙈 아무튼 토큰은 하나도 안 늘렸어. 검수 부탁해!
[Joy] 에스더 수고했어~ 나 지금 git diff 다 봤어. 영상 이름 칸 깔끔하게 잘 분리해놨네 굿굿
[Joy] updateContentTitle(contentId, title) 시그니처랑 호출 정확하게 맞고, INPUT_CLS 재사용에 aria-label도 챙겼더라
[Joy] 이제 typecheck/test/build 순서로 직접 돌려볼게. 빌드는 stale .next 캐시 함정 있으니까 깨지면 rm -rf .next 하고 판별할게
[Joy] 결과 나왔어 typecheck exit 0, test 457개 전부 통과 exit 0, build도 캐시 안 건드리고 한방에 exit 0 떴어 🎉
[Joy] 테스트 파일은 손 안 댔고 백엔드 step0도 그대로네. 영상 이름 칸이 제목 A/B 카피랑 라벨로 딱 구분되고 빈값이면 버튼 disabled, router.refresh로 헤더 갱신까지 경로 완벽
[Joy] trus 3색에 직각 그대로 신규 라이브러리도 없어. 에스더 깔끔하게 잘했다 통과! 맥스도 빠르고 굿굿 👍
[리드] 조이 PASS! AC 전부 exit 0, 나도 직접 확인했어(내 쪽에선 build가 stale .next 캐시로 한번 깨졌다가 rm -rf .next 후 exit 0). step 1 완료로 index 갱신한다. 둘 다 수고했어 🎉
