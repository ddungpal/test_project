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
