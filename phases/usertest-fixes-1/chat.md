
=== Step 0: thumbnail-stage-constraint ===

## Step 0: thumbnail-stage-constraint
[리드] 자, 첫 수정. 썸네일 제안이 DB CHECK 제약에 막혀서 안 됐던 버그야. stage_proposals.stage 제약에 'thumbnail'이 빠져 있어. 마이그레이션 한 개만 새로 만들면 돼. 맥스, 맡아줄래?
[Max] step 0 시작. stage_proposals.stage CHECK에 thumbnail 빠진 거 마이그레이션으로 추가할게.
[Max] 005에서 inline check로 만들어진 거라 기본명이 stage_proposals_stage_check 맞고, 22번 단계분리가 production_runs.state만 고치고 이건 놓쳤더라. enums.ts STAGES랑 허용값도 맞춰봤어.
[Max] 마이그레이션 파일 만들었어. typecheck, 테스트 304개, build 다 통과했고 grep도 MIGRATION_OK 떴어.
[Max] database.types.ts는 stage가 Stage 타입 파생이라 thumbnail 이미 들어가 있어서 손 안 댔어. 라이브 DB 적용은 안 했고. 놓친 거 있으면 말해줘.
[Joy] 오 맥스 빠르다~ Step 0 바로 봤어. 신규 파일은 마이그레이션 한 개만 딱 추가됐고 기존 sql이랑 코드는 손 안 댔네. 굿굿
[Joy] 허용값도 enums.ts STAGES랑 글자 하나까지 똑같아. topic title_thumb thumbnail structure research script. 깔끔하다
[Joy] 컨벤션도 22번 파일이랑 동형이야. DROP constraint 하고 ADD constraint로 재정의. 좋아 이제 AC 돌려볼게
[Joy] AC 다 돌렸어. typecheck exit0, test 304개 전부 통과(테스트 삭제/약화 없음 확인), build exit0, MIGRATION_OK 떴어
[Joy] 보안도 깨끗해. env나 키 파일 커밋된 거 없고 코드 변경도 없으니 위험 제로
[Joy] 라이브 적용은 사람 게이트라 우리가 안 건드린 것도 맞고. 완벽하다 통과 🎉 맥스 수고했어
[리드] 조이 PASS, AC 전부 exit 0. step 0 완료로 마크할게. 라이브 적용만 사용자가 db push로 해주면 끝. 다음 step ㄱㄱ
