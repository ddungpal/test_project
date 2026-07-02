
=== Step 0: gold-display ===
[리드] 맥스, step0 gold-display 맡아줄래. 완료화면이 "복습 완료"만 뜨는 걸 실제 금맥(헷갈린 지점·아하·핵심 갈림길·추론 수준) 표시로 바꾸는 거야. 백엔드 loadOnboardingGold는 이미 있으니 page.tsx에서 병렬 로드해서 OnboardingQuiz까지 내려주고 done 화면만 렌더링. 순수 UI 배선이라 Esther 없이 너 혼자 가자.
[Max] gold-display 시작할게. loadOnboardingGold 이미 있으니까 page.tsx에 병렬로드 붙이고 OnboardingQuiz done 화면만 손보면 돼. 조용히 해놓을게.
[Max] 배선 다 붙였어. page.tsx에 gold 병렬로드+prop, OnboardingQuiz done 화면에 금맥 4필드 노랑 톤으로 얹었고. 금맥 없으면 기존 카피만 뜨게 하위호환 유지했어. 이제 typecheck/test/build 돌려볼게.
[Max] 다 됐어. typecheck 0, test 1120개 다 통과, build도 깨끗해. 금맥 있으면 완료화면에 헷갈린 지점·아하·핵심 갈림길·추론 수준 뜨고, 없으면 예전처럼 카피만 나와. 놓친 거 있으면 말해줘.
[리드] 조이, 검수 부탁해. 맥스가 page.tsx랑 OnboardingQuiz.tsx 두 파일 손봤어. AC는 내가 직접 돌렸는데 typecheck exit0 · test 1120 통과 exit0 · build exit0 나왔어. git diff로 스코프·하위호환·TRUS 준수 봐줘.
[Joy] 오 맥스 빠르다~ 바로 git diff 읽고 AC 셋 다 독립으로 돌렸어. typecheck exit0, test 1120개 전부 통과 exit0, build도 audit이나 chunk 오류 없이 깔끔하게 exit0 나왔어 🎉
[Joy] 스코프 완벽해. 신규 조회로직 안 만들고 loadOnboardingGold 그대로 재사용했고, page.tsx 병렬로드 자리도 arc 바로 밑에 isOnboardingVisible 게이트 미러해서 넣었네. step1/2 백엔드는 손 안 댔고 untracked도 chat.md뿐이야.
[Joy] 하위호환도 꼼꼼해. gold 없으면 예전 카피만 뜨고, 리스트는 length>0, coreAngle/calibratedLevel은 truthy 가드라 스키마랑 딱 맞아. live "이해 완료" / review "복습 완료" 분기도 그대로 살아있고 금맥은 그 위에 얹혔어.
[Joy] TRUS 3색도 굿굿 👍 border-l-trus-yellow, bg-trus-white/[0.03], text-trus-white/90 다 Black/Yellow/White 투명도 조절이라 새 색·그라데이션·그림자 없어. 통과야!
[Joy] 전부 통과! typecheck·test 1120·build 다 exit0, 스코프도 깔끔하고 하위호환도 잘 됨. 통과시킬게 🎉
[리드] 좋아, step0 완료. 금맥 4필드가 완료화면에 뜨게 배선 끝. 브라우저 실제 렌더는 라이브 검증 때 확인하자. 수고했어 둘 다.

=== Step 1: onboarder-difficulty-more ===
[리드] 맥스, step1 백엔드 맡아줘. 난이도(basic/mid/deep) 하나 받아서 그 난이도 문항 2~3개를 추가 생성해 기존 아크에 이어붙이는 경로야. 핵심은 저장된 refs 재사용(gatherExternalSignals 재검색 절대 금지), 기존 arc.questions에 append(덮어쓰기 금지), more 없으면 기존 runOnboarding 바이트 동일. 순수 백엔드라 너 혼자 가자. TDD로.

[Max] onboarding-learning-ux step1 시작할게. 난이도 하나 받아서 그 난이도 문항 2~3개를 기존 아크에 이어붙이는 백엔드야. 저장된 refs 재사용하고 재검색은 안 해.
[Max] prepareOnboarderFromRefs(저장 refs 재사용)·onboarderMoreStep(난이도 추가지시)·appendOnboardingQuestions(proposal UPDATE로 append)·이벤트 more 분기까지 배선 끝냈어. 이제 테스트 돌려볼게.
[Max] typecheck·test(1129개)·build 셋 다 통과했어. 재검색은 spy로 0회 확인했고, more 없는 default 경로 system은 ONBOARDER_SYSTEM 바이트 그대로 유지했어. 놓친 거 있으면 말해줘.

[Joy] 오케이 맥스 step1 백엔드 받았어! 지금 git diff 쭉 보고 typecheck·test·build 셋 다 독립으로 돌려볼게 🎉
[Joy] typecheck exit 0 떴어 굿굿 👍 스코프도 깔끔해 — schema·arc·UI·submitOnboarding 손 안 댔고 마이그 0, 의존성 0. 이제 test랑 build 돌린다!
[Joy] 전체 test 1129개 다 통과 exit 0! build에서 /copy-learn PageNotFoundError 떴는데 이거 규칙에 있는 stale .next 캐시 함정이야 — rm -rf .next 하고 재빌드로 판별할게 ☕
[Joy] .next 캐시 지우고 재빌드하니까 exit 0! 코드 문제 아니었어 맥스 잘못 아님 ㅋㅋ 정리하면 append 보존·refs 재검색 0회(spy로 검증)·more 없으면 ONBOARDER_SYSTEM 바이트 동일·proposal은 UPDATE라 gold 링크 유지·extractGold 확장아크 반영까지 불변식 다 지켜졌어. typecheck/test1129/build 셋 다 exit 0. 통과야 고생했어 🎉
[리드] 좋아 step1 완료. 난이도별 추가문항 생성·기존 아크 append·저장 refs 재사용 백엔드 끝. 다음 step2에서 UI 얹으면 돼. 둘 다 수고했어.
