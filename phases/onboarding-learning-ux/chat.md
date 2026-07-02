
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

=== Step 2: additional-questions-ui ===
[리드] 자 step2, 완료화면에 '추가 문제' 버튼 붙이는 UI야. 백엔드는 step1이 다 해놨으니 requestOnboarding에 more만 흘려보내고, OnboardingQuiz done 화면에 난이도 3버튼+폴링 얹으면 돼. 맥스 맡아줄래?

[Max] step2 시작했어. requestOnboarding에 more 인자부터 붙였어. 인자 없으면 이벤트 data가 예전이랑 바이트 동일하게 나가게 조건부 스프레드로.
[Max] OnboardingQuiz 완료 화면에 난이도 3버튼이랑 추가 문제 풀기 붙였어. 확장 아크 도착하면 새 문항부터 이어 풀게 resume useEffect도 넣었고, answers는 보존해서 재제출하면 금맥 전체가 다시 갱신돼. 이제 typecheck부터 돌려볼게.
[Max] typecheck 0, test 1129개 통과, build도 0으로 끝났어. 새 테스트는 안 붙였어 — resume은 컴포넌트 상태 조작이라 순수 헬퍼 뽑을 게 없더라. 백엔드는 step1 경로만 호출했고. 놓친 거 있으면 말해줘.

[Esther] 나 왔어. 맥스가 붙인 더 풀어보기 섹션 비주얼만 다듬을게. 로직은 손 안 대고 클래스랑 마크업만.
[Esther] 다 다듬었어. 더 풀어보기 라벨을 노랑에서 흐린 톤으로 낮췄어 — 완료 박스도 노랑 금맥 라벨도 다 노랑이라 그 밑에 또 노랑 헤딩 오면 얘가 주인공처럼 튀거든. 헤더 호기심체크 라벨이랑 같은 톤으로 맞춰서 보조 액션으로 조용히 읽히게 했어. 이건 위계상 확실히 나아.
[Esther] 난이도 3버튼은 flex-1로 균등하게 3등분했고 보기 버튼 톤 그대로 유지했어. 요란한 위계는 안 넣었어 입문 중급 심화 자연스럽게. disabled일 때 hover 색 안 뜨게 막았고 focus-visible 아웃라인은 기존 패턴 그대로.
[Esther] 폴링 스피너는 텍스트랑 한 줄로 정렬했고 이중 마진 정리했어. 로직 상태 props 발행경로 하나도 안 건드렸어. typecheck 0 나왔어. 새 색 그라데이션 그림자 없고 3색만. 아 그리고 선택 배지 하나 슬쩍 붙였어 필수 아니라고 티나게 🙈
[Joy] step2 additional-questions-ui 독립검수 시작할게! git diff부터 보고 AC 다 돌려볼게 🎉
[Joy] 오 맥스 깔끔하다~ requestOnboarding(runId, more?)에 조건부 스프레드 써서 more 없으면 기존이벤트 바이트동일 유지했네. RequestOnboardingButton 기존호출부 안 깨져 굿굿 👍
[Joy] 폴링/타임아웃/에러 전부 RequestOnboardingButton 미러 그대로고, 백엔드 생성·금맥 로직 UI에서 중복구현 하나도 안 했어. requestOnboarding+submitOnboarding 호출만! 이게 정석이지
[Joy] resume useEffect도 done && newLen>prevLen 게이트라 초기 마운트엔 안 터지고, 확장 arc 도착하면 이어붙은 문항부터 재생+기존 answers 보존. arc prop은 page.tsx 서버컴포넌트가 router.refresh로 새로 흘려주니까 배선 완벽
[Joy] 난이도 없이 추가생성 발동하는 경로 없고(항상 3버튼 difficulty 전달), 이벤트 계약도 onboardingStage event.data.more.difficulty까지 쫙 연결됨. TRUS 3색만·focus-visible 유지·그림자/그라데이션 0
[Joy] AC 결과: typecheck exit0, test 1129개 전부 통과(테스트 삭제/약화 없음), build exit0(캐시함정도 안 걸림). 마이그0·의존성0·스코프 딱 맞아. 통과야 통과!! 🎉
[리드] 조이 PASS 확인, AC 셋 다 exit 0(나도 따로 돌려봤어). step2 완료 — 완료화면 추가문제 버튼+난이도 선택+resume 다 붙었다. 맥스·에스더·조이 다들 수고했어. 라이브(브라우저) append→재제출 금맥갱신 검증만 나중에 사람이 확인하면 돼.
