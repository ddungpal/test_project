
=== Step 0: perf-metrics-field-merge ===
[리드] 자, 이번 step은 성과 적재 덮어쓰기 충돌 픽스야. 자동수집(views)이랑 수동입력(CTR)이 같은 d7 행을 서로 안 지우게 필드별 병합으로 바꾸는 거. 맥스, 이거 맡아줄래? ingest.ts metricRows upsert만 손대면 돼.
[Max] step0 시작할게. ingest.ts metricRows upsert가 행 전체를 갈아끼워서 Cron이 사람이 넣은 CTR을 null로 지우는 문제. 기존 행 읽어서 필드별로 병합하는 방식으로 바꾼다.
[Max] ingest.ts 병합 다 넣었어. 기존 overall 행 한 번 조회해서 views/ctr/avg_view_pct/traffic_source 각각 `입력값 ?? 기존값 ?? null` 로 합치게 했고, ctr이 노출클릭률이라 자동수집은 못 채운다는 주석도 달아놨어.
[Max] 회귀 테스트는 인메모리 supa 스텁 직접 만들어서 ingestPerformance를 실제로 돌렸어. 자동→수동, 수동→자동, 멱등, manual.json 하위호환 4케이스.
[Max] AC 다 돌렸어. typecheck exit 0, test exit 0(1454→1458), build exit 0. dev는 꺼져 있어서 build도 깨끗. 놓친 거 있으면 말해줘.
[리드] 맥스 고마워. 내가 AC 직접 돌려봤어 — typecheck exit 0, test exit 0(1458), build exit 0. git도 깨끗하고 떠돌이 fixtures 없어. 조이, 독립 검수 부탁해.
[Joy] 오 맥스 빠르다~ step0 병합 픽스 diff 봤어. ingest.ts 기존행 조회해서 ?? prev ?? null 로 병합하는 거 딱 좋네. 이제 내가 직접 typecheck/test/build 돌려볼게!
[Joy] 굿굿! typecheck exit0, test 1458개 전부 통과(performanceMerge 4케이스 포함), build도 exit0 깨끗해. 금지파일(collect/youtubeAnalytics/cleanup/ab_variants) 하나도 안 건드렸고 마이그도 0이야.
[Joy] 병합 로직 spec이랑 딱 맞아. ?? prev ?? null 이라 null/undefined 둘 다 기존값 보존하고, onConflict 키도 그대로. ctr 정체 주석도 잘 달았네. 테스트도 진짜로 ingestPerformance 호출하는 회귀테라 든든하다.
[Joy] 딱 하나 소소한 거! phase index.json step0이 아직 pending에 summary 비어있어. 완료 마킹은 하네스가 할 거라 판정은 안 막는데, 다음엔 completed+summary로 채워주면 완벽할 듯. 이번 건 통과! 수고했어 맥스 🎉
[Joy] 검수 끝! 병합 로직 spec이랑 딱 맞고, 테스트도 진짜 ingestPerformance 돌리는 회귀테스트야(스텁이 기존행 돌려줘서 병합 검증됨). AC 셋 다 exit 0, 1458 통과, 떠돌이 fixtures 0. 통과! 🎉
[리드] 좋아, step 0 완료. index.json completed + summary 갱신했어. 다음 step은 하네스가 이어서.

=== Step 1: learning-window-d7 ===
[리드] 이번 건 학습 윈도우 픽스야. abLearnSource가 영상 랭킹 CTR을 d1(24시간)에서 읽는데, "1주일 성과로 학습"이라는 취지랑 안 맞아. d7 우선(없으면 d1 폴백)으로 바꾸는 거. 맥스, 조회 윈도우만 바꾸는 거라 작아. ab 경로 로직·judgeComponent·ctrWeightedScore는 절대 손대지 말고 조회+맵 구성만 손봐줘.
[Max] step1 시작할게. abLearnSource가 랭킹 CTR을 d1에서만 읽는데, d7 우선(없으면 d1 폴백)으로 바꾼다. ab 경로랑 judge/ctrWeightedScore는 안 건드리고 조회 윈도우랑 맵 구성만 손봐.
[Max] 구현 끝났어. 조회를 metric_window in [d1,d7]로 넓히고, 영상별로 d7 있으면 d7·없으면 d1 쓰게 맵 구성했어. 상단·함수 주석도 d7 우선으로 갱신했고. 회귀 테스트는 기존 ctrWeightedLearning.test.ts에 d7우선·d1폴백·둘다없음 3케이스 붙였어(스텁 .in 이미 지원).
[Max] AC 다 돌렸어. typecheck exit 0, test exit 0(1458→1461), build exit 0. dev 꺼져 있어서 build 깨끗하고 git도 명세 파일만 바뀌었어. 떠돌이 fixtures 없어. 놓친 거 있으면 말해줘.
[리드] 맥스 고마워. 내가 AC 직접 재실행했어 — typecheck 0, test 0(1461 passed), build 0. git도 abLearnSource랑 테스트만 바뀌었고 떠돌이 없어. 조이, 독립 검수 부탁해. 특히 ab/single 경로 로직이 진짜 안 바뀌었는지랑 주석-코드 드리프트 봐줘.

[Joy] step1 검수 시작할게~ git diff로 abLearnSource랑 ctrWeightedLearning.test 정독했어
[Joy] 오 select에 metric_window 넣고 in으로 d1 d7 둘 다 긁어오네 굿굿
[Joy] d7 우선 d1 폴백 둘 다 없으면 null 로직 깔끔해 ctrById viewsById가 pick으로 채워지는거 확인
[Joy] ab 경로 single 경로 judgeComponent ctrWeightedScore는 손 하나도 안 댔네 조회랑 맵 구성만 바뀜 완벽
[Joy] 주석도 d1만이던거 d7 우선으로 정확히 갱신했어 rules 요구 통과
[Joy] mock supa 스텁이 in을 배열 includes로 처리하고 thenable로 진짜 loadAbResultsFromDb 돌리네 d7=5.0 검증 진짜야
[Joy] typecheck exit0 test 1461 전부 그린 build도 exit0 나왔어
[Joy] 마이그0 의존성0 범위밖 파일 안 건드림 통과야 맥스 굿 🎉
[리드] 좋아, VERDICT PASS 확인. step 1 완료 — index.json completed + summary 갱신했어. 학습 윈도우가 d7 우선으로 바뀌었으니 다음 step(ctr 수동입력 화면)은 하네스가 이어서.

=== Step 2: ctr-input-screen ===
[리드] 마지막 step이야. CTR은 YouTube API가 안 주니까 김짠부가 Studio '도달범위' 보고 직접 입력하는 화면을 /copy-learn에 붙이는 거. 백엔드(순수헬퍼·로더·서버액션·테스트)랑 프론트(입력 컴포넌트·페이지 배선)로 나뉘고 파일이 안 겹쳐서 맥스·에스더 동시에 갈게.
[리드] 맥스는 ctrInput.ts 순수헬퍼 + getCtrInputVideos 로더 + submitVideoCtr 서버액션 + ctrInput.test.ts. 에스더는 PerformanceInputForm.tsx 컴포넌트 + page.tsx 섹션 배선. 인터페이스는 spec에 다 박혀 있으니 이름만 맞추면 링크돼.
[Max] step2 백엔드 시작할게. CTR 순수헬퍼(parseCtrInput/formatCtr) + getCtrInputVideos 로더 + submitVideoCtr 서버액션 + 테스트. 프론트는 에스더 거니까 안 건드려.

[Esther] 음 이제 CTR 입력 화면 프론트 시작할게. copy-learn 페이지랑 CopyLearningForm 패턴 다 봤어. 기존 톤(검정/노랑/흰 3색, 직각, 그림자 없음) 그대로 따라가면 돼서 새로 만들 컴포넌트는 최소로 갈 거야.

[Esther] ctrInput.ts 확인했어. parseCtrInput은 0<ctr<=100 검증하고 에러 메시지도 한글로 잘 돼있네. 클라이언트 사전검증도 이거 재사용해서 저장 전에 바로 막을게. 컴포넌트엔 순수 로직 절대 안 넣어(테스트 import 사각지대 때문에). 지금 PerformanceInputForm 만든다.
[Max] 넷 다 만들었어. 순수헬퍼는 src/lib/performance/ctrInput.ts에 두고 컴포넌트는 안 건드렸어. 서버액션은 ingestPerformance에 ctr만 넘겨서 step0 병합이 자동수집 views 보존하게 했고. 이제 typecheck랑 test 돌려볼게.

[Esther] 다 됐어. PerformanceInputForm 새로 만들고 copy-learn 페이지에 성과 입력 섹션 넣었어. CopyLearningForm 바로 위에 뒀는데, CTR 먼저 입력하고 그 아래에서 재학습 돌리는 흐름이라 위쪽이 자연스러워서 그렇게 했어. Max 로더/액션도 이미 들어와 있어서 typecheck 완전 깨끗하게 통과했어. 색은 검정/노랑/흰 3색만, 직각, 그림자 없이 기존 톤 그대로 맞췄어. 이건 자신 있어!
[Max] AC 다 돌렸어. typecheck exit 0, test exit 0(1461→1476, 신규 15개), build도 exit 0. auditLog 유니온에 video_ctr_submitted 하나 추가했어(안 넣으면 typecheck가 막혀서). 에스더 프론트랑 이미 링크돼서 build까지 깨끗하게 통과했네. 떠돌이 fixtures 없어. 놓친 거 있으면 말해줘.
[리드] 둘 다 고마워. 내가 AC 직접 재실행했어 — typecheck 0, test 0(1476 passed), build 0(/copy-learn 포함). git도 명세 파일만 바뀌었고 떠돌이 없어. 조이, 독립 검수 부탁해. 특히 submitVideoCtr이 ingestPerformance에 ctr만 넘겨 step0 병합으로 views 안 지우는지, 순수로직이 컴포넌트 아니라 lib에 있는지, parseCtrInput 경계(0/100)가 맞는지 봐줘.

[Joy] 조이 들어왔어 마지막 step 검수 시작할게 diff랑 신규파일 다 정독했어
[Joy] 오 핵심부터 봤는데 submitVideoCtr이 metrics d7 ctr만 넘기고 views는 안 넘겨 ingest의 m.views ?? prev.views 병합이 자동수집 views 그대로 보존해 이게 제일 걱정이었는데 딱 맞췄네 굿
[Joy] parseCtrInput 경계도 완벽해 0 거부 100 통과 100.1/150/-1 거부 빈값 비숫자 다 막고 순수로직은 lib에 있고 컴포넌트는 import만 해 rules.md 사각지대 잘 피했어
[Joy] 이제 AC 직접 돌려볼게 typecheck test build 순서로

[Joy] AC 셋 다 내가 직접 돌렸어 typecheck exit0 test exit0 1476 passed(신규 ctrInput 15개 포함) build exit0 copy-learn 라우트도 깨끗하게 나와
[Joy] 로더도 봤어 d7 overall만 읽고 youtube_video_id non-null upload_date desc title은 ?? ""로 non-null 보장 owner게이트도 requireOwner 먼저 하고 service-role auditLog는 best-effort라 안 던져 다 좋아
[Joy] 마이그0 새컬럼0 의존성0 떠돌이 fixtures도 없고 untracked 3개 다 명세된 산출물이야 통과야 맥스 에스더 둘 다 굿굿
[Joy] 딱 하나 리드한테 넘길 거 step2 index.json이 아직 pending에 summary 비어있어 커밋 전이라 판정은 안 막지만 완료 처리할 때 completed+summary 채워줘
[Joy] VERDICT PASS 🎉
[리드] 좋아, VERDICT PASS 확인(센티넬 1개·AC 셋 다 exit0). step 2 완료 — index.json completed + summary 갱신했어. 이걸로 ctr-manual-d7-learning phase 3 step 다 끝났다. CTR 수동입력→d7 랭킹 학습 루프 완성. 다들 고생했어!
