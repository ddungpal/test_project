# Step 0 — views-score-core (조회수 신뢰도 가중)

[리드] 자 시작하자. 이번 건 순수 함수에 vconf(조회수 신뢰도) 곱하는 거야. DB·UI 안 건드리고 abVerdict.ts 시그니처만 확장. 맥스, 맡아줄래?

[Max] 응 맡을게. tech.md 13.2랑 기존 ctrWeightedScore 패턴 다 봤어. log1p 정규화·clamp·하위호환 그대로 미러해서 vconf 붙일게.

[Max] vconf 다 붙였어. viewsConfidence 헬퍼 추가하고 single·ab 양쪽에 곱했고, views 없으면 1.0이라 기존이랑 바이트 동일하게 유지했어. config에 viewsConfFloor 노브랑 .env.example도 넣었고.
[Max] 한 가지 짚을 게 있어. step0.md 본문엔 음수 views를 clamp(→floor)라 했는데, 경계 테스트 명세는 "음수/NaN → vconf=1.0(방어)"라 둘이 살짝 어긋나더라. 더 구체적인 테스트 AC쪽(음수도 무가중 1.0)으로 맞췄어. 의도가 반대였으면 말해줘.
[Max] typecheck·test(360개)·build 다 통과. parity 테스트 헬퍼에 새 필드 하나 채운 거 빼곤 기존 케이스 안 건드렸어. 놓친 거 있으면 봐줘.

[리드] 맥스 빠르네. AC 직접 돌려봤어 — typecheck/test/build 전부 exit 0. 조이, 검수 부탁해. parity.test.ts도 타입 동반 수정됐으니 그것도 봐줘.
[Joy] 오 맥스 step0 빠르다! 바로 git diff 떠서 보고 AC 3개 다 돌려볼게
[Joy] typecheck 0, test 360개 전부 통과 0, build 0! 깔끔하다 🎉
[Joy] 기존 ctrWeightedLearning 8케이스 하나도 안 깨졌고 views 케이스 9개 새로 추가됐네. 하위호환 회귀 가드까지 챙겼고 굿굿
[Joy] inconclusive early return이 vconf 곱하기 전에 있어서 reach 높아도 0 유지되는거 확인했어. base===0 처리 깔끔
[Joy] 순수함수 유지(코퍼스 조회 없음)·범위 침범 없음(UI/abLearnSource 안건드림)도 다 봤어. 통과시킬게! 수고했어 맥스 👍

[Joy] 다 봤어! 하위호환 바이트 동일, 순수성, 경계방어(0→floor·음수/NaN→1.0)·inconclusive 0 다 챙겼더라. 테스트도 약화 없이 9개 추가했고. exit 0 셋 다 통과! 🎉
[리드] 좋아, step 0 완료. 다음은 step 1(데이터 배선)인데 그건 다음 세션에서.

=== Step 1: views-data-wiring ===

---

# Step 1 — views-data-wiring (데이터 배선: 입력→저장→로드→스코어 주입)

[리드] step0에서 ctrWeightedScore가 videoViews24h·viewsReference 받게 됐잖아. 이번엔 거기에 실데이터를 흘려보내는 백엔드 배선이야. 폼 입력 계약(views24h)부터 performance_metrics.views 저장, loadAbResultsFromDb 로드, buildAbStyleInput reference 1회 산출 후 주입까지. UI는 step2니까 안 건드려. 맥스, 맡아줘.

[Max] 응 맡을게. step0에서 만든 ctrWeightedScore의 views 인자에 실데이터 흘려보내는 거지. 입력 계약(views24h)부터 metricRow 저장, loadAbResultsFromDb, buildAbStyleInput reference 1회 산출까지 배선할게. reference는 코퍼스 max 1회만 구하고, views 없으면 vconf=1.0이라 기존 학습은 그대로 유지돼. UI는 안 건드려.

[Max] 한 가지 짚을 게 있어. CopyAbInput에 views24h를 필수로 추가했더니, UI(CopyLearningForm)의 toInput이 그 타입을 반환해서 타입체크가 깨지더라. UI 입력칸·동작은 step2라 안 건드리는데, 컴파일 통과하려면 toInput에 views24h: null 한 줄은 불가피해. 기능은 그대로(null)고 step2에서 실제 입력값으로 바뀔 자리야. 이렇게 처리했어 — 다른 의도였으면 말해줘.

[Max] 배선 다 끝났어. CopyAbInput·mapCtr24hToMetricRow에 views 넣고, abLearnSource·copyLearnView select에 views 추가해서 viewsById 매핑했어. learn-ab-style은 buildAbStyleInput 진입부에서 viewsReference를 코퍼스 max로 1회만 구하고 ctrWeightedScore 2곳(single·ab)에 주입했고. metricRow가 views를 채우니 onConflict upsert가 그대로 갱신해줘서 copyLearn.ts는 손 안 댔어.
[Max] 테스트는 매핑(mapCtr24hToMetricRow views=views24h, null→null), loadAbResultsFromDb views 매핑 1건, buildAbStyleInput 조회수 가중(고조회>저조회, 전부 null이면 기존 weight 동일) 추가했어. 기존 9영상 코퍼스는 views 없어서 weight 그대로인 거 회귀 가드로 박아놨고.
[Max] AC 셋 다 통과. typecheck exit 0, test 363개 통과(360→363) exit 0, build exit 0. 하위호환은 views 없으면 reference=0/vconf=1.0이라 기존 학습 불변이고 기존 테스트도 하나도 안 깨졌어. 놓친 거 있으면 봐줘.

[리드] 맥스 빠르다. AC 3개 직접 돌려볼게. 한 가지 — views24h를 필수로 넣어서 CopyLearningForm에 null 한 줄 들어간 거, 그거 step2 영역이라 조이한테 판단 맡길게.
[리드] 조이, 검수 부탁해. 특히 (1) 하위호환(기존 weight 불변) (2) reference 1회 산출 (3) views 멱등 저장 (4) CopyLearningForm 한 줄 터치가 "UI 수정 금지" 위반인지 — 더 깔끔한 길(views24h 옵셔널로 두면 UI 안 건드림)이 있는지 봐줘.
[Joy] 오 맥스 빠르다~ 나 지금 git diff 보고 바로 typecheck·test·build 다 돌려볼게! 핵심 쟁점 그 views24h 필수냐 옵셔널이냐도 꼼꼼히 볼게 🎉

[Joy] 다 돌렸어! typecheck exit 0, test 363개 다 통과(360→363 맞고), build exit 0. 셋 다 깔끔해 🎉
[Joy] 배선도 step0 계약이랑 정확히 맞물려. viewsReference는 buildAbStyleInput 진입부에서 Math.max(0,...) 1회만 구하고 전부 null이면 0→vconf 1.0이라 기존 9영상 weight 그대로 박혀있더라. 회귀 가드(ISA 3년 = verdictWeight) 까지 테스트로 잡아놨고 굿굿 👍
[Joy] views 멱등도 OK — mapCtr24hToMetricRow가 d1 overall 한 행에 views만 얹어서 onConflict upsert 그대로 갱신, 행 안 늘어나. 기존 어서션 삭제·약화도 전혀 없고 전부 추가만 했어. 깨끗하다!
[Joy] 그리고 그 CopyLearningForm null 한 줄 쟁점 — 결론부터: 통과 줄게. step1 명세 작업1)이 CopyAbInput.views24h를 필수(number|null)로 추가하라고 대놓고 시켰거든. 맥스는 명세 그대로 따른 거고, toInput의 null 한 줄은 입력칸·동작 안 건드린 순수 타입 shim이야. 금지사항(UI 동작은 step2) 실질 위반 아님. 옵셔널이 더 깔끔하긴 한데 그건 명세 필수 지시를 어기는 거라 강제 안 할게. 맥스 깔끔하게 잘했어, 통과! 🎉

[Joy] 오 맥스 깔끔하다~ git diff 떠서 7개 체크 다 봤어
[Joy] 하위호환 회귀 가드(기존 9영상 weight 불변)까지 박아놨고, reference는 루프 밖 1회 산출 맞아. 고조회>저조회 weight 테스트도 통과 👍
[Joy] CopyLearningForm 한 줄은 step1 명세가 views24h 필수로 추가하라고 못박았으니 그거 따른 거고, 입력칸 동작은 안 건드렸으니 step2 침범 아냐. PASS로 본다!
[Joy] AC 3개 직접 돌려서 typecheck 0, test 363 통과 0, build 0 확인. 통과 🎉
[리드] 좋아, 통과! step1 데이터 배선 끝났다. views가 폼계약→저장→로드→스코어까지 관통하고, 없으면 vconf=1.0으로 기존 그대로. step2(UI 입력칸)는 다음에. 수고했어 둘 다 👏
