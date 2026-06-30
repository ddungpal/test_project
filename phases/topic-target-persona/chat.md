
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

=== Step 2: scribe-persona ===
[리드] 마지막 전파 단계 가자. 이번엔 짠펜(scribe) 차례야. step0에서 촉이가 심은 target_persona를, 짠펜도 같은 getSelectedStagePayload("topic")로 꺼내서 스크립트 톤·예시·어휘를 그 대상한테 직접 말 걸듯 맞추는 거. 단 짠펜 픽스처는 골든 A/B에 opus라 더 민감하니까, persona 없으면 input은 물론 system까지 바이트 그대로여야 해(promptHash 보존). step1처럼 input 조건부 + system도 persona 있을 때만 한 줄 append하는 방식으로. 말투/money-safety/형식 규칙은 절대 안 건드리고. 맥스, 맡아줄래?
[Max] 맡을게. scriptCell, step, schema 셋 다 봤어. 구다리랑 다른 점은 짠펜은 system 합성을 step.ts에서 한다는 거. 그래서 SCRIBE_SYSTEM 본문은 그대로 두고 SCRIBE_PERSONA_DIRECTIVE 별도 상수를 만들어서 persona 있을 때만 한 줄 append하는 방식으로 갈게. callLLM input에도 persona 있을 때만 넣고. 없으면 system도 input도 바이트 그대로. fake driver로 캡처하는 테스트부터 짜고 red 확인할게.
[Max] 테스트 먼저 짜서 red 확인했어. fake driver로 scribeStep이 callLLM에 넘기는 system이랑 input을 캡처해서, persona 있을 때 input에 실리고 system에 지시 붙는지(A), 없을 때 키 없고 system이 SCRIBE_SYSTEM 바이트 동일인지(B 회귀 가드), 빈 문자열은 주입 안 하는지(C), 지시가 별도 상수로 본문에 안 섞였는지(D) 네 케이스.
[Max] 구현 끝. schema에 SCRIBE_PERSONA_DIRECTIVE 별도 상수 추가했고(SCRIBE_SYSTEM 본문은 한 글자도 안 건드림), step.ts에서 persona truthy일 때만 system 뒤에 한 줄 append + input에 키 포함. 없으면 둘 다 바이트 그대로. scriptCell은 같은 getSelectedStagePayload('topic')로 persona 꺼내서 있을 때만 scribeStep에 넘겨. 그 테스트 4개 다 통과. AC 전체 돌려볼게.
[Max] AC 셋 다 통과. typecheck 0, 테스트 970개 전부 통과(신규 4개 포함), build도 0. 이번엔 build가 캐시 이슈 없이 한 번에 깨끗하게 됐어. 짠펜 골든 픽스처는 persona 없는 경로 system/input 바이트 보존이라 안 깨졌고.
[Max] 정리하면 짠펜도 이제 주제 payload의 target_persona를 읽어서, persona 있을 때만 그 대상한테 직접 말 걸듯 예시·어휘를 맞춰. 말투·money-safety·형식 블록 규칙은 안 건드렸고 persona는 맥락만 더하는 보조 신호라고 지시에 못박았어. persona 없으면 system도 input도 바이트 그대로라 promptHash 보존돼. 건드린 건 scriptCell.ts, step.ts, schema.ts, 배선 테스트 하나뿐이야. 놓친 거 있으면 말해줘.
[Joy] 오 맥스 step2 짠펜 페르소나 받았다~ git diff부터 보고 typecheck/test/build 3종 바로 돌려볼게!
[Joy] typecheck 0, test 970 다 통과! 그리고 회귀가드 진짠지 보려고 일부러 무조건주입으로 깨봤는데 케이스 B/C가 딱 빨개졌다가 원복했어. 껍데기 아니고 진짜 잠겨있네 굿굿
[Joy] build도 exit 0 깔끔! SCRIBE_SYSTEM 본문 한 글자도 안 건드렸고 directive 별도 상수로 잘 뺐어. canonicalize가 키 정렬해서 input 재조립해도 해시 안전한 것도 확인했고. 범위도 scribe/scriptCell/test 딱 세 개라 군더더기 없음. 맥스 이번 거 진짜 교과서다, 통과! 🎉
[리드] 조이, 짠펜 검수 부탁해. AC는 내가 다 돌려봤어 — typecheck 0, test 970 통과, build 0(이번엔 캐시 이슈 없이 한 번에). 특히 persona 없을 때 system까지 바이트 동일인지(골든 픽스처 보존) 회귀 가드가 진짜 잠겼는지 봐줘.
[Joy] 오 짠펜이면 골든 픽스처 걸려있으니 더 꼼꼼히 봐야지. AC 3종 다시 돌리고 회귀 가드 뮤테이션으로 깨볼게!
[Joy] AC 셋 다 exit 0 재현됐고 970 통과. 조건부를 무조건 주입으로 일부러 깨보니까 케이스 B(system 바이트 동일)랑 C(빈 문자열) 딱 그것만 빨갛게 떴어. 원복하니 초록불. 껍데기 아니고 진짜 promptHash 불변식 잠금이야.
[Joy] SCRIBE_SYSTEM 본문은 한 글자도 안 변했고 persona 지시는 별도 상수로 깔끔하게 분리됐어. 말투·money-safety·형식·lineage도 안 건드림, persona는 맥락만 더하는 보조 신호라고 못박았네. 마이그 0, 촉이·구다리·UI 미변경. 통과 🎉
[리드] 좋아, 1라운드 PASS. Step 2 완료 처리한다. 이제 타겟 페르소나가 촉이(생성)→구다리(목차)→짠펜(스크립트)까지 파이프라인 전체에 전파돼. persona 없는 옛 런은 어디서도 input/system 바이트 그대로라 기존 골든 픽스처 다 안전하고. 남은 건 step3 persona-ui — 화면에 표시하고 편집하는 거. 맥스·조이 수고했어!
