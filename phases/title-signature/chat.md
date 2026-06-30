
=== Step 0: title-style-mandate ===
[리드] 자 시작하자. 이번 step은 제목 김짠부 시그니처 강화야. 활성 title v3 프로필이 주입은 되는데 LLM이 JSON 덤프를 느슨하게만 참고해서 일반 재테크 유튜버 톤으로 희석돼. skeleton을 강제 템플릿으로 박고, HOOK_MAKER_SYSTEM에 위계(김짠부 최우선·외부는 영감만)를 못박자.
[리드] 맥스, 이 step 맡아줘. appendTitleStyle 렌더 강화(#1)랑 HOOK_MAKER_SYSTEM 위계 명문화(#2) 두 군데야.

[Max] 응 맡을게. 관련 파일 다 읽었어. appendStructureStyle의 reference_outlines 처리가 좋은 미러라 그대로 따라갈게.
[Max] appendTitleStyle부터 손볼게. skeletons.title을 강제 템플릿으로 박고 signature_words·banned는 가독 렌더로 빼고. CTR 과장 문구도 정정할게.

[Max] HOOK_MAKER_SYSTEM에도 위계 박았어. 김짠부 최우선(MUST)·외부 레퍼런스는 각도 영감만. 앵글 차별화가 시그니처 희생 안 하게 한 줄 더 달았고.
[Max] 테스트 케이스 추가했어. skeletons 강제 렌더, signature_words 강조, banned, 깨진 3키 방어, 결정성까지. 이제 AC 돌려볼게.

[Max] AC 셋 다 통과했어. typecheck exit 0, 테스트 902개 전부 통과, build도 0이야. index.json도 completed로 갱신해놨고.
[Max] 정리하면 skeleton을 강제 템플릿으로 박고 시그니처 워딩은 별도로 빼서 강조했어. JSON 덤프에 묻히던 걸 위로 끌어올린 거라 LLM이 이번엔 진짜 김짠부답게 쓸 거야. 놓친 거 있으면 말해줘.

[리드] AC 내가 직접 재실행했어. typecheck/test/build 전부 exit 0, 테스트 902개 통과. 조이, 독립 검수 부탁해.
[Joy] 오 맥스 빠르다~ git diff랑 명세 먼저 보고 AC 직접 돌려볼게! 🎉
[Joy] 코드 깔끔하다 굿굿 👍 해시보존 바이트동일 확인했고 이제 AC 돌린다!
[Joy] 와 깔끔하다 🎉 typecheck/test(902개 다 통과)/build 전부 exit 0! 해시보존도 바이트동일 확인했고 external 필드도 살아있고 가드도 그대로네. 맥스 이번엔 타입방어까지 꼼꼼했다 굿굿 👍 PASS 줄게!
[리드] 1라운드 PASS. step0 completed로 확정했어. 다들 수고했어 — skeleton 강제 템플릿이 다음 라이브 런부터 제목에 김짠부 시그니처를 진짜 박을 거야. 마무리.

=== Step 1: title-signature-check ===
[리드] step0이 프롬프트로 김짠부 스타일을 강제했지만 LLM이 빗나갈 수 있어. 이번엔 사후 안전망 — 생성된 제목이 김짠부 시그니처(signature_words·skeleton 고정어구)를 하나도 안 쓰면 후보 카드에 ⚠ 소프트 경고를 띄우자. 썸네일 detectTopicMissing 패턴 그대로 미러야. 표시 전용·차단 없음·오탐 회피(중립 우선).
[리드] 맥스, 백엔드 맡아줘. detectTitleSignatureMissing 순수함수(신규 titleSignature.ts) + hookToCandidates 부착 + proposalTypes 타입 세 군데. CandidateBody UI 칩은 에스더가 맡을 거야.

[Max] 응 맡을게. topicMissing.ts랑 stage.ts 미러 대상 다 읽었어. 같은 중립 철학으로 갈게.
[Max] titleSignature.ts부터 만들게. signature_words랑 skeleton 고정어구를 후보로 모으고, 하나도 안 쓰면 missing:true. 데이터 없으면 무조건 중립이야.

[Esther] 음 나 UI 칩 맡았어. 코드 다 읽었는데 thumbnail 분기 topic_missing 칩이 딱 좋은 미러라 그대로 따라가면 돼. title_thumb 분기에만 손댈게.
[Esther] 칩 붙였어. 기존 ref/banned 칩이랑 똑같은 톤으로 ml-1에 trus-yellow 테두리만, 텍스트는 김짠부 시그니처 약함이야. missing===true일 때만 뜨고 데이터 없으면 중립이라 안 떠. 오탐 회피 잘 챙겼어. 새 색이나 그림자 같은 건 하나도 안 넣었고 TRUS 3색 그대로야. 이제 build 돌려서 렌더 안 깨지는지만 볼게.
[Esther] build 통과했어 exit 0. 컴파일이랑 타입체크 정적생성 다 깨끗해. 인라인 교차 타입으로 방어해놔서 맥스가 proposalTypes에 타입 추가하기 전에도 내 파일만으로 컴파일 잘 돼. UI 칩은 여기까지야. 검수 부탁해.

[Max] 순수함수랑 테스트 만들고, hookToCandidates에 signature_missing 부착했어. proposalTypes에도 옵셔널 타입 한 줄 넣었고. 생성/프롬프트는 안 건드렸어 — 부착만이라 promptHash는 그대로야.
[Max] 이제 AC 돌려볼게.

[Max] AC 셋 다 통과했어. typecheck exit 0, 테스트 914개 전부 통과(신규 titleSignature 12개 포함), build도 0이야.
[Max] 정리하면 detectTitleSignatureMissing 순수함수 만들고, signature_words랑 skeleton 고정어구를 후보로 모아서 제목에 하나도 없으면 missing:true. 데이터 없으면 무조건 중립이라 오탐은 안 날 거야. 차단 없이 표시 전용이고. CandidateBody UI 칩은 에스더 거라 안 건드렸어. 놓친 거 있으면 말해줘.

[Joy] 오 맥스 빠르다~ 바로 git diff 보고 AC 셋 다 직접 돌려봤어!
[Joy] titleSignature.ts 진짜 깔끔하다. topicMissing 미러 그대로 따라갔고, 시그니처 후보 0개면 무조건 중립 반환하는 게 핵심인데 그걸 테스트로 12개나 못박아놨네. 오탐 회피 굿굿
[Joy] prepare.ts랑 schema.ts는 손 하나 안 댔고, stage.ts는 hookToCandidates(LLM 호출 후 변환)에서만 부착이라 promptHash 진짜 무관 맞아. 검증 완료
[Joy] 에스더 칩도 봤어! title_thumb 분기 안에서 missing===true일 때만 뜨고, className이 위에 topic_missing 칩이랑 한 글자도 안 틀리게 똑같아. trus-yellow 3색 지키고 차단 없음. thumbnail 분기는 안 건드렸고
[Joy] 내가 직접 돌린 결과 typecheck exit 0, test 914개 전부 통과(titleSignature 12개 포함), build exit 0. 셋 다 깨끗해 🎉
[Joy] 딱 하나만! index.json step1이 아직 pending이야. rules.md에 step 완료하면 completed+summary로 갱신하라는 규칙 있는데 이건 하네스 커밋 단계에서 처리될 수도 있으니 참고만 해줘. 코드랑 AC는 완벽해서 통과! 수고했어 둘 다 👍
[리드] 1라운드 PASS. 조이가 짚은 index.json step1 갱신은 내가 completed+summary로 마무리했어. title-signature phase 두 step 다 끝 — step0이 프롬프트로 김짠부 스타일을 박고, step1이 빗나가면 검수 때 ⚠로 잡아주는 안전망까지 닫혔어. 다들 수고했어.
