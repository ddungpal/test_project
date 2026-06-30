
=== Step 0: persona-generate ===
[리드] 자, 타겟 페르소나 1단계 시작하자. 촉이가 주제 후보마다 '누구를 위한 영상인지' 한 줄을 만들고 payload에 실리게 하는 거야. 맥스, 이거 좀 맡아줄래?
[Max] 오케이, 맡을게. 스펙이랑 schema.ts, stage.ts 다 봤어. 촉이가 후보마다 타겟 페르소나 한 줄 만들고 그게 payload에 실리게 하는 거. 테스트부터 짜고 시작할게.
[Max] 다 해놨어. schema에 target_persona required로 넣고, 시스템 프롬프트에 누구+상황+막막함 한 줄로 쓰라고 예시 두 개랑 같이 지시 추가했어. audience_need랑은 다른 축이라 둘 다 채우라고 명시도 해뒀고.
[Max] 핵심 배선인 toCandidates payload에 target_persona 한 줄 추가했어. 이게 빠지면 다음 step 전파가 끊겨서 제일 신경썼어.
[Max] AC 셋 다 통과. typecheck 0, 테스트 963개 전부 통과(신규 5개 포함), build도 0. build는 처음에 webpack MODULE_NOT_FOUND 떴는데 stale .next 캐시였어. 지우고 다시 도니까 깨끗하게 됐어. 놓친 거 있으면 말해줘.
[리드] 조이, 맥스 작업 검수 좀 부탁해. AC는 내가 돌려봤는데 typecheck/test/build 다 exit 0이었어. diff랑 같이 봐줘.
[Joy] 오 맥스 빠르다~ diff 봤어 깔끔하네. 내가 직접 typecheck/test/build 셋 다 다시 돌려볼게!
[Joy] 다 봤어! typecheck 0 test 963개 다 통과 build도 0(처음에 next 캐시 땜에 깨졌는데 rm -rf .next 하니까 깨끗) 굿굿. payload에서 target_persona 일부러 빼봤더니 테스트가 바로 실패하더라 껍데기 아니고 진짜 잠그고 있어. 마이그 0 UI structurer scribe 안 건드렸고 audience_level/need도 그대로 병존. 깔끔하다 통과 맥스 수고했어 🎉
[리드] 좋아, 1라운드 PASS. Step 0 완료 처리한다. 촉이가 이제 후보마다 타겟 페르소나를 만들고 payload에 실어서 다음 step(구다리·짠펜 전파)이 읽을 수 있어. 다들 수고했어.

=== Step 1: structurer-persona ===
[리드] 2단계 가자. 이번엔 구다리(structurer) 차례야. step0에서 촉이가 주제 payload에 심어둔 target_persona를, 구다리가 같은 getSelectedStagePayload("topic")에서 같이 꺼내서 목차를 그 대상에 맞춰 짜게 하는 거. 핵심은 조건부 주입 — 페르소나 없으면 input/system 바이트 그대로(픽스처 해시 보존). 맥스, 맡아줄래?
[Max] 맡을게. prepare.ts랑 schema, 기존 배선 테스트 다 봤어. 구다리는 이미 같은 getSelectedStagePayload("topic")로 title만 꺼내고 있어서, 거기서 target_persona도 같이 빼면 돼. structure_style_profile 조건부 주입 패턴 그대로 따라가면 되겠다. 테스트부터 짜고 시작할게.
[Max] 테스트 먼저 짜서 red 확인했어. persona 있을 때 input.target_persona 실리는지(D), 없을 때 키 자체가 없는지(E, 회귀 가드), system에 지시 문구 있는지(F) 세 케이스. 기존 fake supa에 topicPersona 옵션만 더해서 A/B/C는 안 건드렸어.
[Max] 구현 끝. prepare는 같은 payload 호출 결과를 변수에 담아서 title이랑 target_persona 둘 다 꺼내고, persona는 truthy일 때만 input에 실어. 없으면 키 안 넣어서 바이트 그대로야. schema 시스템엔 '주어지면 그 대상에 맞춰' 지시랑 예시 두 개, 억지 금지 한 줄 박았어. 그 테스트 6개 다 통과. 이제 AC 전체 돌려볼게.
[Max] AC 셋 다 통과. typecheck 0, 테스트 966개 전부 통과(신규 3개 포함), build도 0. build는 또 PageNotFoundError(/copy-learn) 떴는데 stale .next 캐시였어. 지우고 다시 도니 깨끗해졌어. step0이랑 똑같은 패턴이네.
[Max] 정리하면 구다리는 이제 주제 payload에서 target_persona를 같이 읽어서 persona 있을 때만 목차를 그 대상에 맞춰 짜. 없으면 input/system 바이트 그대로라 기존 구다리 픽스처는 안 깨져. 건드린 건 prepare.ts, schema.ts, 배선 테스트 세 개뿐이야. 놓친 거 있으면 말해줘.
[리드] 조이, 맥스 작업 검수 부탁해. AC는 내가 다 돌려봤어 — typecheck 0, test 966 통과, build 0(처음엔 next 캐시로 깨졌고 rm -rf .next 후 0). diff랑 같이 봐줘. 특히 조건부 주입(persona 없을 때 input에 키 없음) 회귀 가드가 진짜 잠겨있는지.

[Joy] 오 맥스 step1 빠르다~ git diff 봤는데 조건부 주입 깔끔하네. 이제 typecheck/test/build 3종 직접 돌려볼게!

[Joy] 다 돌려봤어! typecheck 0, test 966 통과, build도 0. 새 테스트 6개(D/E/F) 다 초록불이야
[Joy] 회귀 가드(케이스 E) 진짜 잠그는지 코드 일부러 깨봤거든? 조건부를 무조건 주입으로 바꾸니까 딱 그 테스트만 빨갛게 떴어. 껍데기 아니고 진짜 불변식 지켜줌 굿굿
[Joy] 같은 getSelectedStagePayload('topic') 한 번 호출에서 title이랑 persona 같이 꺼내고, 마이그 0, scribe/UI/촉이 안 건드림. step2(짠펜)는 따로 남겨둔 거 맞고. 깔끔하다 통과 🎉
[리드] 좋아, 1라운드 PASS. Step 1 완료 처리한다. 이제 구다리가 선택된 주제 페르소나를 읽어 목차를 그 대상에 맞춰 짜고, persona 없는 옛 주제는 input 바이트 그대로라 기존 픽스처도 안전해. 다음은 step2 짠펜(scribe) — 같은 패턴으로 스크립트까지 페르소나 전파하면 돼. 맥스·조이 수고했어.
