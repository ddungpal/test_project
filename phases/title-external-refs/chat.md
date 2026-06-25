
=== Step 0: title-reference-rewrite ===
[리드] 맥스, step 0 맡아줘. 훅이 제목 생성에 '고조회 관련 유튜브 제목'을 레퍼런스로 얹는 거야. 핵심은 플래그 off(기본)면 기존 promptHash가 1바이트도 안 바뀌어야 한다는 거 — 조건부 주입 필수. LLM 추가 호출 금지, hook_maker만 건드려.
[Max] step0 명세랑 hook_maker 코드 다 읽었어. 순수함수 pickTopExternalTitles 테스트부터 짜고 들어갈게.
[Max] externalRefs.ts 만들었어. 순수 추림 함수랑 게이트, gatherExternalSignals 재사용 래퍼까지. 이제 prepare에 조건부로 끼울게.
[Max] prepare에 조건부 주입 넣고 schema에 재창작 지침 한 줄 더했어. stage는 기존 ref_similarity 그대로 두는 게 안전해서 안 건드렸어. .env.example에 TITLE_REFERENCES=off도 추가했고.
[Max] typecheck, test(316개 통과·parity 골든 보존), build 다 통과했어. 플래그 off라 promptHash 안 바뀌는 거 확인됐고. 놓친 거 있으면 말해줘.
[리드] AC 다 돌렸어 — typecheck/test/build 전부 exit 0, 316개 통과. 조이, 독립 검수 부탁해. 특히 플래그 off에서 promptHash 불변(parity 골든 보존)·LLM 추가호출 없음·hook_maker 범위 준수 봐줘.
[Joy] 오케이 맥스 작업 받았다~ step0 명세랑 diff 먼저 정독했어. 이제 typecheck/test/build 바로 돌려볼게!
[Joy] typecheck exit 0, test 316개 전부 통과(hookMakerExternalRefs 9개 포함), build exit 0! 셋 다 깔끔해 굿굿
[Joy] 핵심 봤어 — 게이트 off일 때 reference_titles_external 필드를 아예 안 넣더라(조건부 할당). 기존 hook_maker parity 골든도 1바이트도 안 건드렸고. promptHash 불변 계약 지킴 됐다
[Joy] LLM 추가 호출도 없고(검색만), 게이트는 youtube일 때만, 순수함수 테스트도 동률 안정정렬까지 꼼꼼해. 프롬프트에 낚시 모방 금지도 들어갔고. 통과시킬게 맥스 깔끔하다 짝짝짝
[Joy] 참고로 untracked parity fixture 8개가 새로 생겼던데(hook/thumb/topic) 기존 골든은 안 건드려서 회귀는 없어. record 돌린 흔적 같으니 커밋 전에 한번만 확인해줘~
[Joy] 7개 안전장치 다 직접 까봤어 — promptHash 불변, LLM 추가호출 없음, 게이트 옵트인 전부 OK. AC도 내가 다시 돌려서 exit 0 확인했고! 통과 🎉
[리드] 좋아, step 0 완료 처리한다. 맥스·조이 수고했어. 라이브 검증(TITLE_REFERENCES=youtube)은 사용자 몫으로 summary에 남겨둘게.
