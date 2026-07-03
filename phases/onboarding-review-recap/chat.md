
=== Step 0: recap-helper ===
[리드] 맥스, 쏙이 완료화면 복습용 순수 헬퍼 하나만 만들어줘. src/lib/onboarding/recap.ts에 buildRecap/recapScore 두 함수야. UI 말고 조인·집계만. 테스트도 같이.
[Max] 응, 볼게. playback.ts랑 arc.ts import 관례 그대로 따라서 순수 함수로 만들게. 조인은 questionIdx 기준으로, 미응답은 null 방어하고.
[Max] recap.ts 만들었어. buildRecap이랑 recapScore 두 함수고, 순수 조인·집계만. 테스트도 붙였어 — 정답/오답/미응답, 문항 순서 유지, 추가문제로 늘어난 케이스, 방어 케이스까지.
[Max] typecheck 통과, 테스트도 다 통과했어(1216개). build는 처음에 /audit PageNotFoundError로 깨졌는데 stale .next 캐시라 지우고 다시 도니 통과. 코드 문제는 아니었어.
[Max] step0 끝났어. 놓친 거 있으면 말해줘.
[Joy] 오 맥스 벌써 다 짰네! 파일 두 개 읽었어. recap.ts 순수하고 lib/onboarding에 잘 뒀네. 이제 typecheck/test/build 직접 돌려볼게 커피 한 잔 하고 올게 ☕
[Joy] 커피 다 마시기도 전에 끝났다ㅋㅋ typecheck exit0, test 1216개 전부 통과(신규 recap 13개 포함), build도 exit0에 audit 캐시 이슈 하나 없어. 순수함수 완벽하고 lib/onboarding 위치도 함정 잘 피했어. 정오판정도 playback isCorrect이랑 같은 규칙이라 드리프트 없음. 테스트도 미응답/오답/같은idx 마지막것/추가문제확장/범위밖까지 다 짚었네 꼼꼼하다 진짜 굿굿 통과! 🎉
[리드] 굿, step0 completed로 닫는다. 다음은 step1 recap-ui(Esther 차례).

=== Step 1: recap-ui ===
[리드] 맥스, step1이야. OnboardingQuiz done 분기에 step0 헬퍼(buildRecap·recapScore) 소비해서 (1)정답 요약 (2)내 풀이 다시 보기 details (3)레퍼런스 영상 붙여줘. arc.references가 이미 arc prop에 실려오니까 page.tsx 배선은 건드릴 필요 없어. MustWatchReferences는 heading prop만 추가해서 재사용하자. 재생/제출/금맥 로직은 절대 손대지 마.
[Max] 응, 볼게. step0 헬퍼(buildRecap·recapScore) 그대로 소비하고 조인·정오 로직은 컴포넌트에 다시 안 쓸게. arc.references는 이미 arc prop에 있어서 page.tsx는 안 건드려. MustWatchReferences에 heading prop만 optional로 추가하고 기존 호출부는 default로 바이트 그대로 둘게.
[Max] done 분기에 세 개 붙였어. 정답 요약은 total 0이면 방어로 요약이랑 details 둘 다 생략했고. 내 풀이 다시 보기는 네이티브 details 기본닫힘, 보기마다 정답엔 ✓랑 "정답", 내 오답엔 ✗랑 "내 선택" 텍스트도 같이 달아서 색 없이도 구분되게 했어. 해설은 기존 아하 톤(좌측 노랑 보더) 그대로 미러했고. 레퍼런스는 MustWatchReferences 재사용하고 heading만 "이 온보딩의 근거 영상"으로 넘겼어. 이제 typecheck/test/build 돌려볼게.
[Max] 세 개 다 exit0이야. typecheck 0, test 1216개 전부 통과, build도 0에 audit 캐시 이슈 없었어. page.tsx는 안 건드렸고 MustWatchReferences 기존 호출부도 default heading이라 그대로야. 재생/제출/금맥 로직은 손 안 댔어. 봐줘.
[Esther] 음 나 왔어. 맥스가 붙인 세 블록 다 봤는데 기본기는 진짜 탄탄해. 3색도 잘 지켰고 ✓/✗ 텍스트 병기까지 접근성 챙긴 거 좋더라. 나는 위계랑 카피 톤만 살짝 다듬을게.
[Esther] 조심스럽지만 몇 개 손보고 싶어. 첫째 "N문항 중 M개 정답"이 살짝 시험지 느낌이 나서 헤더 '찍고 틀려도 좋아요' 톤이랑 안 맞아. 정답 수는 그대로 보여주되 '복습' 프레이밍으로 감싸는 게 확실히 나아.
[Esther] 요약 줄을 따로 두지 말고 details summary 오른쪽에 '3 / 5 맞힘'으로 접어 넣었어. 이러면 완료·금맥이 주가 되고 복습은 펼쳐야 밀도 나오는 보조가 되거든. 위계가 훨씬 자연스러워졌어.
[Esther] 그리고 복습 안에서 문항 간격만으론 경계가 약해서 얇은 구분선(divide-y) 넣었어. 문항 많아지면 이게 확 차이나. 이건 내가 자신 있어.
[Esther] 복습 보기에서 내가 틀리게 고른 건 취소선 긋고 라벨도 '내 답 · 오답'으로 바꿨어. 이러면 색맹인 분도 정답이랑 내 오답이 한눈에 딱 대비돼. 정답 겸 내가 맞힌 건 '정답 · 내 답'으로 긍정 톤 유지했고.
[Esther] 레퍼런스 영상은 이미 이모지 없이 '이 온보딩의 근거 영상'으로 잘 넘어가고 별도 카드라 위계도 맞아서 안 건드렸어. 억지로 만지면 안티슬롭이니까.
[Esther] 검증 끝. typecheck exit0, build은 처음에 audit PageNotFound 나와서 .next 지우고 다시 도니 exit0. 맥스 말대로 캐시 이슈였어 코드 문제 아니야. 나 다 했어!
[Joy] 오 맥스 에스더 콤보 굿굿 👍 diff 다 읽었어. done 분기에만 세 블록 붙었고 재생·제출·금맥·useEffect는 손 하나 안 댔네 깔끔해. state.arc/state.answers 소비만 하고 조인은 step0 buildRecap 그대로 쓰고 있어. 이제 typecheck/test/build 직접 돌려볼게 좀 걸리니까 기다려줘
[Joy] 다 돌렸어! typecheck exit0, test 1216개 전부 통과(step0 recap 테스트도 그대로 살아있고 삭제·약화 하나 없어), build도 exit0에 audit 캐시 이슈 없음. 코드도 꼼꼼히 봤는데 재생·제출·금맥·useEffect 위쪽 로직은 진짜 손 하나 안 댔고 복습은 buildRecap/recapScore 읽기전용으로 소비만 하네. 정오도 색 말고 ✓/✗ 기호+텍스트+취소선까지 3중이라 색맹분도 딱 구분돼 접근성 굿. 레퍼런스는 arc.references 가드+컴포넌트 null 이중방어라 0개면 알아서 사라지고, MustWatchReferences heading default라 기존 호출부 바이트 동일. 마이그·쿼리·의존성·page.tsx 배선 다 0. 에스더 위계 다듬은 것도 깔끔하다 진짜. 통과! 🎉
[Joy] 맥스 에스더 이번 스텝 손발 척척 맞더라ㅋㅋ 나 트집 잡을 데를 못 찾았잖아 다음에도 이렇게만 👍
[리드] 조이 PASS 확인, AC도 내가 직접 재확인해서 typecheck·test 1216·build 전부 exit 0. step1 completed로 닫고 phase 전체도 완료. 맥스·에스더·조이 수고했어 — 완료화면에 복습이랑 근거영상 붙었다. 라이브 실렌더는 사용자 검증 때 보자.
