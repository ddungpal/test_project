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
