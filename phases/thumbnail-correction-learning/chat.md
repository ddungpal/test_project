
=== Step 0: corrections-store ===
[리드] 자, 교정 학습 첫 단추. 교정쌍(생성↔이상 카피) 저장만 하는 전용 테이블 thumbnail_corrections + 순수 매핑 buildCorrectionRow + saveCorrection 액션. 기존 copyLearn 패턴 그대로 미러하면 돼. 맥스, 맡아줄래?

[Max] 응 맡을게. 기존 copyLearn 패턴 다 읽었어. 먼저 buildCorrectionRow 테스트부터 쓰고 갈게.
[Max] 테이블이랑 매핑, 저장 액션까지 다 만들었어. FK는 일부러 안 걸었고 SQL에 이유 적어놨어. 이제 타입체크랑 테스트 돌려볼게.
[Max] 다 됐어. 타입체크, 테스트 474개, 빌드 전부 통과. diff랑 learned_at은 null로만 넣어놨고 step1/2에서 채우면 돼. 놓친 거 있으면 말해줘.
[Joy] 오 맥스 빠르다~ git status 봤어. 마이그레이션이랑 copyLearnMap 신규 잡혔네. diff 읽고 바로 AC 돌릴게!
[Joy] diff 다 봤어. FK 없는 독립 테이블 맞고 주석에 이유까지 적혀있네 굿굿. component_type CHECK·인덱스·learned_at·diff nullable 다 있다. 이제 AC 돌린다!
[Joy] AC 셋 다 초록불! typecheck exit0, test 474개 전부 통과, build exit0. payload 모양도 ab_variants랑 똑같이 맞췄네. 마지막으로 범위만 점검할게
[Joy] 검수 끝! UI/재학습 안 건드렸고 교정쌍을 엉뚱한 테이블에 넣지도 않았어. requireOwner→service-role 순서, 빈입력 throw, auditLog correction_saved까지 다 깔끔. 신규 fixtures 부산물도 없네. 통과야 맥스 굿굿 🎉
[리드] 깔끔하게 1라운드 PASS. step0 completed로 마감한다. 마이그레이션 20260626120024는 사용자가 Supabase에 직접 적용해야 런타임 동작하는 거 잊지 말고. 다음은 step1(차이 분석)이야.
