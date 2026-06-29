
=== Step 0: reentry-state-cell ===
[리드] 자, 리서치 단계 안에서 이전 단계로 되돌아가 다시 도는 기반을 까는 작업이야. 되돌림 전이 4개 추가하고, 셀이 fromStep='examples'(예시만 다시)를 지원하게 하는 거. 액션·UI는 다음 step이니까 손대지 말고.
[리드] 맥스, 이거 좀 맡아줄래? TDD로 가고, 검증 로직(7가드)은 절대 건드리지 마.
[Max] 알겠어. 관련 파일들 다 읽었어. 전이표·enums·셀·researchStage 구조 파악했고, TDD로 갈게.
[Max] 먼저 마이그레이션 28번이랑 enums에 되돌림 전이 4개 additive로 넣을게. 27번이 단방향으로 만든 건 그대로 두고.
[Max] 마이그레이션 28(되돌림 4개 additive·on conflict do nothing)·enums 전이표 동기화·셀 fromStep='examples' 다 넣었어. examples는 팩트검증·리콘실·반론 스킵하고 research_facts는 손도 안 대, explanation_assets만 다시 써.
[Max] rework_count는 안 올렸어. 단계 내부 재진입이라 비용 캡으로만 막는 게 맞다고 봐서 — 주석에도 적어놨어.
[Max] 셀은 driver 주입 옵셔널로 받게 해서 테스트가 LLM 호출 횟수를 셀 수 있게 했어. fact_verifier 0회, numbers/analogist만 도는 거 검증됨.
[Max] typecheck·test(676개)·build 다 exit 0. 검증 로직은 한 줄도 안 건드렸어. 놓친 거 있으면 말해줘.
[리드] AC 직접 돌려봤어 — typecheck/test/build 전부 exit 0 확인했어. 조이, 독립 검수 부탁해.
[Joy] 오 맥스 빠르다~ git diff랑 신규 마이그레이션·테스트 다 읽었어. 이제 full 경로 원본이랑 transitionRun 멱등성 보고 typecheck/test/build 돌려볼게!
[Joy] 마이그레이션 멱등성 확인 완료! run_state_transitions PK가 (from_state,to_state)라 on conflict가 딱 맞고, research_review→researching는 migration 8에 이미 있어서 중복 insert해도 무시돼. enums랑 DB 전이표도 1:1 맞아떨어진다. 액션·UI·agents도 안 건드렸고. 이제 typecheck/test/build 돌려볼게!
[Joy] 어 다 통과! typecheck exit 0, test 676개 전부 초록불(신규 researchReentry 포함), build도 exit 0이야. fact_verifier 0회·research_facts delete 미호출 어설션도 진짜로 박혀있고, full 경로는 회귀 없이 진입가드로 확인됐어. rework도 안 올리고 액션·UI도 안 건드렸네. 깔끔하다 맥스 굿굿 통과! VERDICT PASS

=== Step 1: scope-augment ===
[리드] 이번엔 research_scoped 게이트에서 셜록 후보가 부족할 때 보완하는 백엔드야. (a)scope 재생성(이유 입력) + (b)수동 추가(사용자가 직접 claim/concept). 수동 claim 금융여부는 자동판정+토글. UI는 step3니까 손대지 말고 백엔드만.
[리드] 맥스, 핵심 가드 세 개만 안 깨면 돼 — 재생성은 새 proposal INSERT·전이 없음, 수동분은 proposal 변형 말고 edited_payload에 인라인, 검증 로직(7가드)·기존 scopeStep 호출 promptHash는 그대로. TDD로 부탁해.
[Max] 관련 파일 다 읽었어. researchScope·researchCell·셜록 step/schema·액션·기존 테스트 구조 파악했고, TDD로 갈게.
[Max] 먼저 detectFinancial 휴리스틱부터. commentSignals 톤 미러해서 순수·결정적으로 만들고 경계는 테스트로 박을게.
[Max] 다 끝냈어. detectFinancial 휴리스틱 새로 만들고, scope 재생성은 새 proposal INSERT만 하고 전이는 안 해. 수동 추가는 candidates 안 건드리고 edited_payload에 인라인으로만 넣었어.
[Max] 픽스처 보존 신경 썼어 — scopeStep input에 reason/existing은 값 있을 때만 넣어서, 기존 runResearchScope 호출은 byte-identical이야. candidate 빌드는 buildScopeCandidates로 빼서 두 곳이 공유하는데 출력은 그대로고.
[Max] 수동 claim 금융여부는 저장된 값 그대로 써. 자동판정으로 재정하지 않았어 — 토글이 최종이니까.
[Max] typecheck·test(691개, 신규 15개)·build 다 exit 0. parity도 안 깨졌어. 검증 로직은 한 줄도 안 건드렸고. 놓친 거 있으면 말해줘.
[리드] AC 직접 돌렸어 — typecheck/test(691)/build 전부 exit 0 확인. 조이, 독립 검수 부탁해.

[Joy] 오케이 맥스 보고 받았고~ 나 지금 git diff부터 쫙 보고 직접 검수 들어간다! research_scoped 게이트 보완이라 했지? 픽스처 byte-identical 보존이랑 0개 가드 합산 부분 빡세게 볼게 🩷

[Joy] diff 다 봤어! 핵심 좋은 신호 몇개 — runResearchScope는 llm에 driver 안 섞고 scopeStep 호출도 budget까지만 그대로라 byte-identical 유지됐고, 0개 가드도 수동 합산으로 바뀌었네. 이제 AC 3종 돌린다. typecheck/test/build 가자~

[Joy] 결과 나왔다~ typecheck/test/build 셋 다 exit 0! 691개 테스트 전부 그린이고 parity도 통과라 픽스처 byte-identical 확인됐어. regenerate는 research_scoped에서만·전이없음·새 proposal INSERT 다 맞고, 수동추가는 candidates 안 건드리고 edited_payload 인라인, 0개 가드도 합산으로 정확. manual 타입이 ScopeClaim/Concept랑 동형이라 깔끔하네. is_financial도 전달값 그대로 보존(재판정 X). 맥스 이번 진짜 꼼꼼했다 통과야 🎉
[리드] 좋아, Step 1 통과 확정. index.json completed로 갱신했어. 수고들 했어 — 다음은 step2 reentry-actions야.
