
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
